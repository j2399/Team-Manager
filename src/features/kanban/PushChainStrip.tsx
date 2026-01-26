"use client"

import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from "react"
import { cn } from "@/lib/utils"
import { ChevronDown, Pencil, Plus, Lock, CheckCircle2 } from "lucide-react"

type PushType = {
    id: string
    name: string
    startDate: Date | string
    endDate: Date | string | null
    status: string
    color: string
    projectId: string
    taskCount: number
    completedCount: number
    dependsOnId?: string | null
}

type PushChainStripProps = {
    chain: PushType[]
    isComplete: (pushId: string) => boolean
    isAdmin: boolean
    onEditPush: (e: React.MouseEvent, push: PushType) => void
    onAddTask: (push: PushType) => void
    loadPushTasks: (pushId: string) => void
    loadedPushes: Record<string, true>
    loadingPushes: Record<string, true>
    renderPushBoard: (pushId: string) => React.ReactNode
}

const COLLAPSED_WIDTH = 56

export function PushChainStrip({
    chain,
    isComplete,
    isAdmin,
    onEditPush,
    onAddTask,
    loadPushTasks,
    loadedPushes,
    loadingPushes,
    renderPushBoard
}: PushChainStripProps) {
    const activePushId = useMemo(() => {
        for (const push of chain) {
            if (!isComplete(push.id)) {
                return push.id
            }
        }
        return chain[chain.length - 1]?.id ?? null
    }, [chain, isComplete])

    const isLocked = useCallback((push: PushType) => {
        if (!push.dependsOnId) return false
        return !isComplete(push.dependsOnId)
    }, [isComplete])

    const [userSelectedPushId, setUserSelectedPushId] = useState<string | null>(null)
    const [isContentOpen, setIsContentOpen] = useState(false)
    const [hoveredId, setHoveredId] = useState<string | null>(null)
    // Track automatic transitions for slower animation
    const [isAutoTransitioning, setIsAutoTransitioning] = useState(false)
    // Flag to use slow animation during the actual motion
    const [useSlowMotion, setUseSlowMotion] = useState(false)
    // Track which push is showing the green completion fill animation
    const [completionFillId, setCompletionFillId] = useState<string | null>(null)
    // Track the previous activePushId to detect auto-transitions
    const prevActivePushIdRef = useRef<string | null>(activePushId)
    const containerRef = useRef<HTMLDivElement>(null)

    const expandedPushId = useMemo(() => {
        // During auto-transition delay, keep showing the old push (the one being filled green)
        if (completionFillId) {
            return completionFillId
        }
        if (userSelectedPushId && chain.find(p => p.id === userSelectedPushId)) {
            return userSelectedPushId
        }
        return activePushId
    }, [userSelectedPushId, activePushId, chain, completionFillId])

    const ensureTasksLoaded = useCallback((pushId: string) => {
        if (!loadedPushes[pushId]) {
            loadPushTasks(pushId)
        }
    }, [loadedPushes, loadPushTasks])

    // Clear slow motion after the animation completes
    useEffect(() => {
        if (useSlowMotion && !completionFillId) {
            const timer = setTimeout(() => setUseSlowMotion(false), 1200)
            return () => clearTimeout(timer)
        }
    }, [useSlowMotion, completionFillId])

    // Detect automatic push changes (when a push is completed and we auto-advance)
    // Use useLayoutEffect to set state BEFORE the browser paints
    useLayoutEffect(() => {
        const prevId = prevActivePushIdRef.current

        if (prevId && activePushId && prevId !== activePushId) {
            // Active push changed - a push was just completed!
            // Only trigger if user hasn't manually selected a DIFFERENT push
            if (!userSelectedPushId || userSelectedPushId === prevId) {
                // Start the green fill animation on the just-completed push
                setCompletionFillId(prevId)
                setIsAutoTransitioning(true)
                setUseSlowMotion(true)
                setUserSelectedPushId(null)

                // Preload new push tasks
                ensureTasksLoaded(activePushId)

                // After green fill completes, transition to next push
                const timer = setTimeout(() => {
                    setCompletionFillId(null)
                    setIsAutoTransitioning(false)
                }, 1200) // 1.2s for green fill animation

                return () => clearTimeout(timer)
            }
        }

        // Always update the ref AFTER the effect body runs
        prevActivePushIdRef.current = activePushId
    }, [activePushId, userSelectedPushId, ensureTasksLoaded])

    const handlePushClick = useCallback((push: PushType) => {
        // Locked pushes can't be clicked
        if (isLocked(push)) return

        if (push.id === expandedPushId) {
            // Clicking the already-expanded push toggles content
            setIsContentOpen(prev => !prev)
            if (!isContentOpen) {
                ensureTasksLoaded(push.id)
            }
        } else {
            // Switching to a different push - just switch, don't auto-open
            setUserSelectedPushId(push.id)
            ensureTasksLoaded(push.id)
        }
    }, [expandedPushId, isLocked, isContentOpen, ensureTasksLoaded])

    const expandedPush = chain.find(p => p.id === expandedPushId)

    if (!expandedPush || chain.length < 2) return null

    // Calculate the width for the expanded push
    const collapsedCount = chain.length - 1
    const totalCollapsedWidth = collapsedCount * COLLAPSED_WIDTH + (collapsedCount * 8) // 8px gap

    return (
        <div className="w-full" ref={containerRef}>
            <div className="flex items-stretch gap-2">
                {chain.map((push, index) => {
                    const isExpanded = push.id === expandedPushId
                    const pushIsComplete = isComplete(push.id)
                    const pushIsLocked = isLocked(push)
                    const isHovered = hoveredId === push.id
                    const percent = push.taskCount > 0 ? (push.completedCount / push.taskCount) * 100 : 0
                    // Check if this push is showing the completion fill animation
                    const showingCompletionFill = completionFillId === push.id

                    // Calculate explicit widths for smooth animation
                    // Expanded: takes remaining space after collapsed items
                    // Collapsed: COLLAPSED_WIDTH (or wider on hover)
                    const collapsedWidth = isHovered ? 160 : COLLAPSED_WIDTH
                    const expandedWidth = `calc(100% - ${totalCollapsedWidth}px)`

                    return (
                        <div
                            key={push.id}
                            className={cn(
                                "relative rounded-lg border shadow-sm overflow-hidden",
                                // Slower, more dramatic animation for auto-transitions
                                useSlowMotion
                                    ? "transition-all duration-1000 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
                                    : "transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1.2)]",
                                // Completed pushes stay green, others use card background
                                pushIsComplete
                                    ? "bg-green-400 border-green-500/50"
                                    : "bg-card border-border",
                                isExpanded ? "min-w-0 flex-1" : "shrink-0 flex-none",
                                !isExpanded && pushIsLocked
                                    ? "opacity-60 grayscale border-dashed cursor-not-allowed"
                                    : !isExpanded && "hover:shadow-md cursor-pointer"
                            )}
                            style={{
                                // Use explicit width for both states to enable smooth animation
                                width: isExpanded ? expandedWidth : collapsedWidth,
                            }}
                            onMouseEnter={() => setHoveredId(push.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            onClick={(e) => {
                                // Only handle click on wrapper if collapsed
                                if (!isExpanded && !pushIsLocked) {
                                    handlePushClick(push)
                                }
                            }}
                            role={!isExpanded ? "button" : undefined}
                            tabIndex={!isExpanded && !pushIsLocked ? 0 : -1}
                        >
                            {/* Green completion fill overlay - sweeps from bottom to top, fully opaque */}
                            {showingCompletionFill && (
                                <div className="absolute inset-0 bg-green-400 z-20 pointer-events-none animate-completion-fill" />
                            )}
                            {/* COLLAPSED CONTENT */}
                            {!isExpanded && (
                                <div className="flex items-stretch h-full w-full">
                                    {/* Vertical Progress Bar Area (Fixed Width) */}
                                    <div className={cn(
                                        "relative w-[56px] shrink-0 h-full border-r border-transparent transition-colors flex items-center justify-center",
                                        // Completed pushes get full green background, others get muted
                                        pushIsComplete ? "bg-green-400" : "bg-muted/20",
                                        isHovered && "border-border/50"
                                    )}>
                                        {/* Vertical Fill - only show for non-complete pushes */}
                                        {!pushIsComplete && (
                                            <div
                                                className={cn(
                                                    "absolute bottom-0 left-0 right-0 transition-all duration-500 ease-out",
                                                    pushIsLocked ? "bg-muted-foreground/30" : "bg-primary/80"
                                                )}
                                                style={{ height: `${pushIsLocked ? 0 : percent}%` }}
                                            />
                                        )}

                                        {/* Progress Text - Very Subtle, for all unlocked pushes */}
                                        {!pushIsLocked && (
                                            <div className="absolute inset-0 flex items-center justify-center z-10">
                                                <span className={cn(
                                                    "text-[9px] font-medium tabular-nums select-none",
                                                    pushIsComplete ? "text-white" : "text-foreground/80 mix-blend-difference"
                                                )}>
                                                    {push.completedCount}/{push.taskCount}
                                                </span>
                                            </div>
                                        )}

                                        {/* Lock Icon for Locked Pushes */}
                                        {pushIsLocked && (
                                            <div className="absolute inset-0 flex items-center justify-center z-10">
                                                <Lock className="w-3.5 h-3.5 text-muted-foreground/60" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Name Label (Appears on Hover) */}
                                    <div className={cn(
                                        "flex items-center px-3 overflow-hidden whitespace-nowrap transition-all duration-300",
                                        isHovered ? "opacity-100 max-w-[104px]" : "opacity-0 max-w-0 px-0"
                                    )}>
                                        <span className={cn(
                                            "text-sm font-semibold truncate",
                                            pushIsComplete && "text-muted-foreground",
                                            pushIsLocked && "text-muted-foreground/70"
                                        )}>
                                            {push.name}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* EXPANDED CONTENT */}
                            {isExpanded && (
                                <div className="flex flex-col h-full w-full">
                                    <button
                                        type="button"
                                        onClick={() => handlePushClick(push)}
                                        className={cn(
                                            "w-full flex items-center justify-between p-3 md:p-4 transition-colors",
                                            isContentOpen ? "rounded-t-lg" : "rounded-lg",
                                            "hover:bg-accent/50 dark:hover:bg-accent/20"
                                        )}
                                    >
                                        <div className="flex items-center gap-2 md:gap-3 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    "font-semibold text-base md:text-lg tracking-tight truncate",
                                                    pushIsComplete && "text-muted-foreground"
                                                )}>
                                                    {push.name}
                                                </span>
                                                {pushIsComplete && (
                                                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                                                )}
                                            </div>

                                            {isAdmin && (
                                                <div
                                                    role="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        onAddTask(push)
                                                    }}
                                                    className={cn(
                                                        "h-7 flex items-center gap-1 px-2 rounded-md border transition-all shrink-0 text-xs",
                                                        pushIsComplete
                                                            ? "border-border/50 text-muted-foreground/50 hover:bg-muted/50 hover:text-muted-foreground"
                                                            : "border-border bg-background hover:bg-muted/50"
                                                    )}
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    <span className="hidden sm:inline">Add Task</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                                            {!pushIsComplete && push.taskCount > 0 && (
                                                <div className="hidden md:flex items-center gap-2">
                                                    <div className="w-20 md:w-24 h-2 bg-muted rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-primary/60 rounded-full transition-all duration-300"
                                                            style={{ width: `${(push.completedCount / push.taskCount) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {!pushIsComplete && (
                                                <span className="hidden md:inline text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                                                    {new Date(push.startDate).toLocaleDateString([], { month: 'short', day: 'numeric' })} - {push.endDate ? new Date(push.endDate).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Ongoing'}
                                                </span>
                                            )}

                                            {isAdmin && (
                                                <div
                                                    role="button"
                                                    onClick={(e) => onEditPush(e, push)}
                                                    className={cn(
                                                        "flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-md hover:bg-primary/10 hover:text-primary transition-colors",
                                                        pushIsComplete && "text-muted-foreground/50"
                                                    )}
                                                >
                                                    <Pencil className="h-3.5 w-3.5 md:h-4 md:w-4" />
                                                </div>
                                            )}

                                            <div className={cn(
                                                "h-7 w-7 md:h-8 md:w-8 flex items-center justify-center rounded-md transition-colors",
                                                pushIsComplete ? "text-muted-foreground/50" : "",
                                                "hover:bg-accent"
                                            )}>
                                                <ChevronDown
                                                    className={cn(
                                                        "h-4 w-4 md:h-5 md:w-5 text-muted-foreground transition-transform duration-200",
                                                        isContentOpen && "rotate-180"
                                                    )}
                                                />
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Separated Full-Width Content Panel */}
            {expandedPush && (
                <div
                    className="grid transition-[grid-template-rows] duration-300 ease-out"
                    style={{ gridTemplateRows: isContentOpen ? "1fr" : "0fr" }}
                >
                    <div className={cn(
                        "min-h-0",
                        isContentOpen ? "overflow-visible" : "overflow-hidden"
                    )}>
                        <div className={cn(
                            "mt-2 rounded-lg border shadow-sm transition-all duration-300",
                            isContentOpen ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none",
                            isComplete(expandedPush.id) ? "bg-muted/30 border-border/50" : "bg-card border-border"
                        )}>
                            <div className="p-4">
                                {loadingPushes[expandedPush.id] ? (
                                    <div className="h-[180px] rounded-lg border bg-background/60 animate-pulse" />
                                ) : (
                                    renderPushBoard(expandedPush.id)
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
