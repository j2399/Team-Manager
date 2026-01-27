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
const NORMAL_TRANSITION_MS = 300
const COMPLETION_TRANSITION_MS = 600 // 2x slower for completion animation
const WATER_FILL_MS = 800

type AnimationPhase = 'filling' | 'transitioning' | null

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
    // Active push = first incomplete push in chain
    const activePushId = useMemo(() => {
        for (const push of chain) {
            if (!isComplete(push.id)) {
                return push.id
            }
        }
        return chain[chain.length - 1]?.id ?? null
    }, [chain, isComplete])

    // Check if a push is locked (dependency not complete)
    const isLocked = useCallback((push: PushType) => {
        if (!push.dependsOnId) return false
        return !isComplete(push.dependsOnId)
    }, [isComplete])

    const [userSelectedPushId, setUserSelectedPushId] = useState<string | null>(null)
    const [isContentOpen, setIsContentOpen] = useState(false)
    const [hoveredId, setHoveredId] = useState<string | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // Animation state
    const [completingPushId, setCompletingPushId] = useState<string | null>(null)
    const [animationPhase, setAnimationPhase] = useState<AnimationPhase>(null)
    const prevCompletionStatesRef = useRef<Record<string, boolean>>({})
    const initializedRef = useRef(false)

    // Detect when a push becomes complete (only after initial render)
    useEffect(() => {
        const prevStates = prevCompletionStatesRef.current

        // Skip animation on initial load - just record current states
        if (!initializedRef.current) {
            for (const push of chain) {
                prevStates[push.id] = isComplete(push.id)
            }
            initializedRef.current = true
            return
        }

        for (const push of chain) {
            const wasComplete = prevStates[push.id] ?? false
            const nowComplete = isComplete(push.id)

            // Detect transition from incomplete to complete
            if (!wasComplete && nowComplete && !completingPushId) {
                // Start completion animation for this push
                setCompletingPushId(push.id)
                setAnimationPhase('filling')

                // Phase 1: Water fill (800ms)
                setTimeout(() => {
                    setAnimationPhase('transitioning')
                    // Clear user selection so it expands to next active push
                    setUserSelectedPushId(null)

                    // Phase 2: Transition to next push (600ms)
                    setTimeout(() => {
                        // Animation complete - back to normal
                        setCompletingPushId(null)
                        setAnimationPhase(null)
                    }, COMPLETION_TRANSITION_MS)
                }, WATER_FILL_MS)
            }

            // Update prev states
            prevStates[push.id] = nowComplete
        }
    }, [chain, isComplete, completingPushId])

    // Expanded push: during transition, keep completing push expanded until animation switches
    const expandedPushId = useMemo(() => {
        // During filling phase, keep the completing push expanded
        if (animationPhase === 'filling' && completingPushId) {
            return completingPushId
        }
        if (userSelectedPushId && chain.find(p => p.id === userSelectedPushId)) {
            return userSelectedPushId
        }
        return activePushId
    }, [userSelectedPushId, activePushId, chain, animationPhase, completingPushId])

    const ensureTasksLoaded = useCallback((pushId: string) => {
        if (!loadedPushes[pushId]) {
            loadPushTasks(pushId)
        }
    }, [loadedPushes, loadPushTasks])

    const handlePushClick = useCallback((push: PushType) => {
        if (isLocked(push)) return

        if (push.id === expandedPushId) {
            // Toggle content panel
            setIsContentOpen(prev => !prev)
            if (!isContentOpen) {
                ensureTasksLoaded(push.id)
            }
        } else {
            // Switch to different push
            setUserSelectedPushId(push.id)
            ensureTasksLoaded(push.id)
        }
    }, [expandedPushId, isLocked, isContentOpen, ensureTasksLoaded])

    const expandedPush = chain.find(p => p.id === expandedPushId)

    if (!expandedPush || chain.length < 2) return null

    // Calculate widths
    const collapsedCount = chain.length - 1
    const totalCollapsedWidth = collapsedCount * COLLAPSED_WIDTH + (collapsedCount * 8)

    // Use slower transition during completion animation
    const transitionDuration = animationPhase === 'transitioning' ? COMPLETION_TRANSITION_MS : NORMAL_TRANSITION_MS

    return (
        <div className="w-full" ref={containerRef}>
            <div className="flex items-stretch gap-2">
                {chain.map((push, index) => {
                    const isExpanded = push.id === expandedPushId
                    const pushIsComplete = isComplete(push.id)
                    const pushIsLocked = isLocked(push)
                    const isHovered = hoveredId === push.id
                    const percent = push.taskCount > 0 ? (push.completedCount / push.taskCount) * 100 : 0

                    const collapsedWidth = isHovered ? 160 : COLLAPSED_WIDTH
                    const expandedWidth = `calc(100% - ${totalCollapsedWidth}px)`

                    // Check if this push is currently in filling animation
                    const isFillingAnimation = completingPushId === push.id && animationPhase === 'filling'
                    // Check if this push is in transition phase
                    const isTransitioning = completingPushId === push.id && animationPhase === 'transitioning'
                    // Green background for completed collapsed cards (always) and during transition
                    const showGreenBg = (!isExpanded && pushIsComplete && !isFillingAnimation) || isTransitioning

                    // When content is open and this is the expanded push, connect visually to content panel
                    const isConnectedToContent = isExpanded && isContentOpen

                    return (
                        <div
                            key={push.id}
                            className={cn(
                                "relative border shadow-sm overflow-hidden",
                                // Only transition width - background changes instantly
                                "transition-[width] ease-out",
                                isExpanded ? "min-w-0" : "shrink-0",
                                // Rounded corners - remove bottom when connected to content
                                isConnectedToContent ? "rounded-t-lg rounded-b-none border-b-0" : "rounded-lg",
                                !isExpanded && pushIsLocked
                                    ? "opacity-60 grayscale border-dashed cursor-not-allowed"
                                    : !isExpanded && "hover:shadow-md cursor-pointer"
                            )}
                            style={{
                                width: isExpanded ? expandedWidth : collapsedWidth,
                                transitionDuration: `${transitionDuration}ms`,
                                backgroundColor: showGreenBg ? 'rgb(34 197 94)' : undefined,
                                borderColor: showGreenBg ? 'rgb(34 197 94 / 0.5)' : undefined,
                            }}
                            onMouseEnter={() => setHoveredId(push.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            onClick={() => {
                                if (!isExpanded && !pushIsLocked && !animationPhase) {
                                    handlePushClick(push)
                                }
                            }}
                            role={!isExpanded ? "button" : undefined}
                            tabIndex={!isExpanded && !pushIsLocked ? 0 : -1}
                        >
                            {/* Water fill animation overlay - keep visible during both filling and transitioning while expanded */}
                            {(isFillingAnimation || (isTransitioning && isExpanded)) && (
                                <div className="absolute inset-0 z-20 overflow-hidden rounded-lg">
                                    <div
                                        className={cn(
                                            "absolute bottom-0 left-0 right-0 bg-green-500",
                                            isFillingAnimation ? "animate-water-fill" : "h-full"
                                        )}
                                        style={{
                                            willChange: 'height',
                                        }}
                                    >
                                        {/* Wave effect at the top edge - only during filling */}
                                        {isFillingAnimation && (
                                            <svg
                                                className="absolute -top-2 left-0 w-[200%] h-3 animate-wave"
                                                viewBox="0 0 200 12"
                                                preserveAspectRatio="none"
                                            >
                                                <path
                                                    d="M0 6 Q25 0, 50 6 T100 6 T150 6 T200 6 V12 H0 Z"
                                                    fill="currentColor"
                                                    className="text-green-500"
                                                />
                                            </svg>
                                        )}
                                    </div>
                                </div>
                            )}
                            {/* COLLAPSED CONTENT */}
                            {!isExpanded && (
                                <div className="flex items-stretch h-full w-full">
                                    {/* Left section - count/icon (fixed width) */}
                                    <div className="relative w-[56px] shrink-0 flex items-center justify-center">
                                        {/* Vertical fill for incomplete pushes */}
                                        {!pushIsComplete && !pushIsLocked && !showGreenBg && (
                                            <div
                                                className="absolute bottom-0 left-0 right-0 bg-primary/40 transition-all duration-500"
                                                style={{ height: `${percent}%` }}
                                            />
                                        )}

                                        {/* Icon/text overlay */}
                                        <div className="relative z-10">
                                            {pushIsLocked ? (
                                                <Lock className="w-4 h-4 text-muted-foreground/50" />
                                            ) : showGreenBg ? (
                                                <span className="text-[10px] font-bold tabular-nums text-white">
                                                    {push.completedCount}/{push.taskCount}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-medium tabular-nums text-foreground/70">
                                                    {push.completedCount}/{push.taskCount}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right section - name on hover */}
                                    <div className={cn(
                                        "flex items-center overflow-hidden whitespace-nowrap transition-all duration-300",
                                        isHovered ? "opacity-100 px-3" : "opacity-0 w-0 px-0"
                                    )}>
                                        <span className={cn(
                                            "font-semibold text-base md:text-lg tracking-tight truncate",
                                            showGreenBg ? "text-white" : pushIsComplete ? "text-muted-foreground" : "",
                                            pushIsLocked && "text-muted-foreground/70"
                                        )}>
                                            {push.name}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* EXPANDED CONTENT */}
                            {isExpanded && (
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
                                        <span className={cn(
                                            "font-semibold text-base md:text-lg tracking-tight truncate",
                                            pushIsComplete && "text-muted-foreground"
                                        )}>
                                            {push.name}
                                        </span>
                                        {pushIsComplete && (
                                            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                                        )}

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
                                                        ? "border-border/50 text-muted-foreground/50 hover:bg-muted/50"
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
                                                        style={{ width: `${percent}%` }}
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
                                            "h-7 w-7 md:h-8 md:w-8 flex items-center justify-center rounded-md transition-colors hover:bg-accent",
                                            pushIsComplete && "text-muted-foreground/50"
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
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Content Panel - visually connected to expanded push header */}
            {expandedPush && (
                <div
                    className="grid transition-[grid-template-rows] duration-300 ease-out"
                    style={{ gridTemplateRows: isContentOpen ? "1fr" : "0fr" }}
                >
                    <div className={cn(
                        "min-h-0",
                        isContentOpen ? "overflow-visible" : "overflow-hidden"
                    )}>
                        <div
                            className={cn(
                                "border shadow-sm transition-all duration-300",
                                // Connected to header: no top-left radius, no top margin
                                "rounded-b-lg rounded-tr-lg border-t",
                                isContentOpen ? "opacity-100" : "opacity-0 pointer-events-none",
                                isComplete(expandedPush.id) ? "bg-muted/30 border-border/50" : "bg-card border-border"
                            )}
                            style={{
                                // Match the width of the expanded push for the connected top edge
                                borderTopLeftRadius: 0,
                            }}
                        >
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
