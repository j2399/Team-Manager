"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { ChevronDown, Pencil, Plus, Lock, CheckCircle2 } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

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
    isAllDone: (pushId: string) => boolean
    isAdmin: boolean
    onEditPush: (e: React.MouseEvent, push: PushType) => void
    onAddTask: (push: PushType) => void
    onMarkComplete: (push: PushType) => void
    onUnmarkComplete: (push: PushType) => void
    loadPushTasks: (pushId: string) => void
    loadedPushes: Record<string, true>
    loadingPushes: Record<string, true>
    renderPushBoard: (pushId: string) => React.ReactNode
}

const COLLAPSED_WIDTH = 56
const NORMAL_TRANSITION_MS = 300
const COMPLETION_TRANSITION_MS = 600 // 2x slower for completion animation
const WATER_FILL_MS = 800

type AnimationPhase = 'filling' | 'transitioning' | 'fading' | null

export function PushChainStrip({
    chain,
    isComplete,
    isAllDone,
    isAdmin,
    onEditPush,
    onAddTask,
    onMarkComplete,
    onUnmarkComplete,
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

    // Track pushes that are currently collapsing (to delay green bg)
    const [collapsingPushId, setCollapsingPushId] = useState<string | null>(null)
    const prevExpandedPushIdRef = useRef<string | null>(null)
    const completionTimeoutsRef = useRef<{
        fill: ReturnType<typeof setTimeout> | null
        transition: ReturnType<typeof setTimeout> | null
    }>({ fill: null, transition: null })
    const completionKickoffTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const collapseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Ensure timers can't fire after unmount.
    useEffect(() => {
        const completionTimeouts = completionTimeoutsRef.current
        return () => {
            if (completionKickoffTimeoutRef.current) clearTimeout(completionKickoffTimeoutRef.current)
            if (completionTimeouts.fill) clearTimeout(completionTimeouts.fill)
            if (completionTimeouts.transition) clearTimeout(completionTimeouts.transition)
            if (collapseTimeoutRef.current) clearTimeout(collapseTimeoutRef.current)
        }
    }, [])

    const startCompletionAnimation = useCallback((pushId: string) => {
        setCompletingPushId(pushId)
        setAnimationPhase('filling')

        if (completionTimeoutsRef.current.fill) {
            clearTimeout(completionTimeoutsRef.current.fill)
            completionTimeoutsRef.current.fill = null
        }
        if (completionTimeoutsRef.current.transition) {
            clearTimeout(completionTimeoutsRef.current.transition)
            completionTimeoutsRef.current.transition = null
        }

        completionTimeoutsRef.current.fill = setTimeout(() => {
            setAnimationPhase('transitioning')
            // Clear user selection so it expands to next active push
            setUserSelectedPushId(null)

            completionTimeoutsRef.current.transition = setTimeout(() => {
                // Animation complete - back to normal
                setCompletingPushId(null)
                setAnimationPhase(null)
                completionTimeoutsRef.current.fill = null
                completionTimeoutsRef.current.transition = null
            }, COMPLETION_TRANSITION_MS)
        }, WATER_FILL_MS)
    }, [])

    // Detect when a push becomes complete (only after initial render)
    useEffect(() => {
        const prevStates = prevCompletionStatesRef.current
        let startedCompletionAnimation = false

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
            if (!startedCompletionAnimation && !wasComplete && nowComplete && !completingPushId) {
                startedCompletionAnimation = true
                // Schedule state changes async to avoid cascading renders in the effect body.
                if (completionKickoffTimeoutRef.current) {
                    clearTimeout(completionKickoffTimeoutRef.current)
                    completionKickoffTimeoutRef.current = null
                }
                completionKickoffTimeoutRef.current = setTimeout(() => {
                    completionKickoffTimeoutRef.current = null
                    startCompletionAnimation(push.id)
                }, 0)
            }

            // Update prev states
            prevStates[push.id] = nowComplete
        }
    }, [chain, isComplete, completingPushId, startCompletionAnimation])

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

    // Detect when a push goes from expanded to collapsed and delay green bg
    useEffect(() => {
        const prevExpanded = prevExpandedPushIdRef.current

        // If a different push was expanded before, it's now collapsing
        if (prevExpanded && prevExpanded !== expandedPushId) {
            const collapsedPush = chain.find(p => p.id === prevExpanded)
            // Only track if it's a completed push (needs green delay)
            if (collapsedPush && isComplete(collapsedPush.id)) {
                setCollapsingPushId(prevExpanded)
                // Clear after collapse animation completes
                if (collapseTimeoutRef.current) {
                    clearTimeout(collapseTimeoutRef.current)
                    collapseTimeoutRef.current = null
                }
                collapseTimeoutRef.current = setTimeout(() => {
                    setCollapsingPushId(null)
                    collapseTimeoutRef.current = null
                }, NORMAL_TRANSITION_MS)
            }
        }

        prevExpandedPushIdRef.current = expandedPushId
    }, [expandedPushId, chain, isComplete])

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
                {chain.map((push) => {
                    const isExpanded = push.id === expandedPushId
                    const pushIsComplete = isComplete(push.id)
                    const pushIsLocked = isLocked(push)
                    const isHovered = hoveredId === push.id
                    const percent = push.taskCount > 0 ? (push.completedCount / push.taskCount) * 100 : 0

                    const collapsedWidth = isHovered ? 160 : COLLAPSED_WIDTH
                    const expandedWidth = `calc(100% - ${totalCollapsedWidth}px)`

                    // Check if this push is currently in filling animation
                    const isFillingAnimation = completingPushId === push.id && animationPhase === 'filling'
                    // Check if this push is in transition phase (completion animation)
                    const isTransitioning = completingPushId === push.id && animationPhase === 'transitioning'
                    // Check if this push is currently collapsing (delay green)
                    const isCollapsing = collapsingPushId === push.id
                    // Green background:
                    // - When collapsed AND complete AND not filling AND not currently collapsing
                    // - OR during completion transition phase
                    const showGreenBg = (
                        (!isExpanded && pushIsComplete && !isFillingAnimation && !isCollapsing) ||
                        isTransitioning
                    )

                    // During completion animation, don't transition bg (instant green)
                    // During manual clicks, transition bg smoothly
                    const shouldTransitionBg = !isTransitioning && !isFillingAnimation

                    return (
                        <div
                            key={push.id}
                            className={cn(
                                "relative rounded-lg border shadow-sm overflow-hidden",
                                "transition-[width] ease-out",
                                // Only add bg transition for manual clicks, not completion animation
                                shouldTransitionBg && "transition-[width,background-color,border-color]",
                                isExpanded ? "min-w-0" : "shrink-0",
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
                                        {isAdmin && (pushIsComplete || isAllDone(push.id)) && (
                                            <TooltipProvider delayDuration={100}>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                if (pushIsComplete) {
                                                                    onUnmarkComplete(push)
                                                                    setUserSelectedPushId(push.id)
                                                                    setIsContentOpen(true)
                                                                    ensureTasksLoaded(push.id)
                                                                    return
                                                                }
                                                                onMarkComplete(push)
                                                                setIsContentOpen(false)
                                                                setUserSelectedPushId(null)
                                                            }}
                                                            className={cn(
                                                                "h-7 inline-flex items-center overflow-hidden rounded-md border text-xs font-medium transition-[max-width,padding,border-color,background-color] duration-200 ease-out",
                                                                pushIsComplete
                                                                    ? "max-w-7 px-0 gap-0 border-transparent bg-transparent text-green-600 justify-center"
                                                                    : "max-w-[140px] px-2 gap-1 border-green-200 bg-green-50 text-green-600 hover:bg-green-100"
                                                            )}
                                                            title={pushIsComplete ? "Mark as not complete" : "Mark this push complete"}
                                                        >
                                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                                            <span
                                                                className={cn(
                                                                    "hidden sm:inline whitespace-nowrap transition-all duration-200",
                                                                    pushIsComplete ? "opacity-0 w-0 translate-x-1" : "opacity-100"
                                                                )}
                                                            >
                                                                Mark Complete
                                                            </span>
                                                        </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" className="text-xs">
                                                        {pushIsComplete ? "Click to unmark complete" : "Mark this division complete"}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
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
                                        <div
                                            className={cn(
                                                "hidden md:flex items-center overflow-hidden transition-all duration-200 ease-out",
                                                !pushIsComplete && push.taskCount > 0
                                                    ? "max-w-28 opacity-100"
                                                    : "max-w-0 opacity-0 pointer-events-none"
                                            )}
                                        >
                                            <div className="w-20 md:w-24 h-2 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary/60 rounded-full transition-all duration-300"
                                                    style={{ width: `${percent}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div
                                            className={cn(
                                                "hidden md:flex items-center overflow-hidden transition-all duration-200 ease-out",
                                                !pushIsComplete
                                                    ? "max-w-[260px] opacity-100"
                                                    : "max-w-0 opacity-0 pointer-events-none"
                                            )}
                                        >
                                            <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded whitespace-nowrap">
                                                {new Date(push.startDate).toLocaleDateString([], { month: 'short', day: 'numeric' })} - {push.endDate ? new Date(push.endDate).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Ongoing'}
                                            </span>
                                        </div>

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

            {/* Content Panel */}
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
                            isContentOpen ? "opacity-100" : "opacity-0 pointer-events-none",
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
