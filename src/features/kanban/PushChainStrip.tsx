"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
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
    // Add transition state for "juicy" animation feel
    const [isTransitioning, setIsTransitioning] = useState(false)
    // Track automatic transitions (push completed -> next push) for slower animation
    const [isAutoTransitioning, setIsAutoTransitioning] = useState(false)
    const prevActivePushIdRef = useRef<string | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const expandedPushId = useMemo(() => {
        // During auto-transition, keep showing the old push briefly
        if (isAutoTransitioning && prevActivePushIdRef.current) {
            return prevActivePushIdRef.current
        }
        if (userSelectedPushId && chain.find(p => p.id === userSelectedPushId)) {
            return userSelectedPushId
        }
        return activePushId
    }, [userSelectedPushId, activePushId, chain, isAutoTransitioning])

    const ensureTasksLoaded = useCallback((pushId: string) => {
        if (!loadedPushes[pushId]) {
            loadPushTasks(pushId)
        }
    }, [loadedPushes, loadPushTasks])

    // Handle transition end cleanup
    useEffect(() => {
        if (isTransitioning) {
            const timer = setTimeout(() => setIsTransitioning(false), 400)
            return () => clearTimeout(timer)
        }
    }, [isTransitioning])

    // Detect automatic push changes (when a push is completed and we auto-advance)
    useEffect(() => {
        if (prevActivePushIdRef.current && activePushId && prevActivePushIdRef.current !== activePushId) {
            // Active push changed - this is an automatic transition!
            // Only trigger if user hasn't manually selected a different push
            if (!userSelectedPushId || userSelectedPushId === prevActivePushIdRef.current) {
                setIsAutoTransitioning(true)
                // Clear user selection so we follow the new active push
                setUserSelectedPushId(null)

                // Preload the new push's tasks
                ensureTasksLoaded(activePushId)

                // After a delay, complete the transition with animation
                const timer = setTimeout(() => {
                    setIsAutoTransitioning(false)
                    setIsTransitioning(true)
                }, 600) // 600ms delay before switching - gives time to see the completed state

                return () => clearTimeout(timer)
            }
        }
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
            setIsTransitioning(true)
            setUserSelectedPushId(push.id)
            ensureTasksLoaded(push.id)
            // Ensure content stays closed or follows previous state?
            // User said: "Clicking collapsed push just switches selection, doesn't auto-open content"
            // So we don't call setIsContentOpen(true) here.
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
                    // Check if this push just completed (we're in auto-transition and this was the previous active)
                    const justCompleted = isAutoTransitioning && push.id === prevActivePushIdRef.current

                    return (
                        <div
                            key={push.id}
                            className={cn(
                                "relative rounded-lg border shadow-sm overflow-hidden",
                                // Slower animation for auto-transitions
                                isAutoTransitioning
                                    ? "transition-all duration-700 ease-out"
                                    : "transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1.2)]",
                                pushIsComplete
                                    ? "bg-muted/40 border-border/50"
                                    : "bg-card border-border",
                                // Green pulse for just-completed push
                                justCompleted && "ring-2 ring-green-500/60 animate-pulse",
                                isExpanded ? "min-w-0" : "shrink-0",
                                !isExpanded && pushIsLocked
                                    ? "opacity-60 grayscale border-dashed cursor-not-allowed"
                                    : !isExpanded && "hover:shadow-md cursor-pointer"
                            )}
                            style={{
                                // Use maxWidth for hover transition (avoid width: auto which prevents animation)
                                width: isExpanded
                                    ? `calc(100% - ${totalCollapsedWidth}px)`
                                    : undefined, // Let flex/maxWidth control it
                                minWidth: isExpanded ? 0 : COLLAPSED_WIDTH,
                                maxWidth: isExpanded
                                    ? '100%'
                                    : isHovered ? 160 : COLLAPSED_WIDTH, // Cap at ~10 chars (56px bar + ~100px text)
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
                            {/* COLLAPSED CONTENT */}
                            {!isExpanded && (
                                <div className="flex items-stretch h-full w-full">
                                    {/* Vertical Progress Bar Area (Fixed Width) */}
                                    <div className={cn(
                                        "relative w-[56px] shrink-0 h-full bg-muted/20 border-r border-transparent transition-colors flex items-center justify-center", // Added flex center for lock icon
                                        isHovered && "border-border/50"
                                    )}>
                                        {/* Vertical Fill */}
                                        <div
                                            className={cn(
                                                "absolute bottom-0 left-0 right-0 transition-all duration-500 ease-out",
                                                pushIsComplete ? "bg-green-500/80" : "bg-primary/80",
                                                pushIsLocked && "bg-muted-foreground/30" // Greyed out fill if locked/inactive
                                            )}
                                            style={{ height: `${pushIsLocked ? 0 : percent}%` }}
                                        />

                                        {/* Progress Text - Very Subtle, for all unlocked pushes */}
                                        {!pushIsLocked && (
                                            <div className="absolute inset-0 flex items-center justify-center z-10">
                                                <span className={cn(
                                                    "text-[9px] font-medium tabular-nums select-none",
                                                    pushIsComplete ? "text-white/90" : "text-foreground/80 mix-blend-difference" // improved contrast
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
