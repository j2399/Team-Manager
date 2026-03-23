"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { cn, getInitials } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Plus } from "lucide-react"
import { ChevronDown, Pencil, Lock, Check } from "lucide-react"

function lightenColor(hex: string, amount: number) {
    const n = (hex || '#3b82f6').trim().replace(/^#/, "")
    if (!/^[0-9a-fA-F]{6}$/.test(n)) return `rgb(186,211,251)`
    const r = Math.round(parseInt(n.slice(0, 2), 16) + (255 - parseInt(n.slice(0, 2), 16)) * amount)
    const g = Math.round(parseInt(n.slice(2, 4), 16) + (255 - parseInt(n.slice(2, 4), 16)) * amount)
    const b = Math.round(parseInt(n.slice(4, 6), 16) + (255 - parseInt(n.slice(4, 6), 16)) * amount)
    return `rgb(${r},${g},${b})`
}

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
    getAssignees?: (pushId: string) => { id: string; name: string }[]
    onAddTask?: (push: PushType) => void
    onMarkComplete: (push: PushType) => void
    onUnmarkComplete: (push: PushType) => void
    loadPushTasks: (pushId: string) => void
    loadedPushes: Record<string, true>
    loadingPushes: Record<string, true>
    renderPushBoard: (pushId: string) => React.ReactNode
    myTaskCounts?: Record<string, number>
    projectColor?: string | null
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
    getAssignees,
    onAddTask,
    onMarkComplete,
    onUnmarkComplete,
    loadPushTasks,
    loadedPushes,
    loadingPushes,
    renderPushBoard,
    myTaskCounts = {},
    projectColor,
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
    const [isContentOpen, setIsContentOpen] = useState(true)
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

    useEffect(() => {
        if (!isContentOpen || !expandedPushId) return
        ensureTasksLoaded(expandedPushId)
    }, [ensureTasksLoaded, expandedPushId, isContentOpen])

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
                    const showMarkCompleteAction = isAdmin && (pushIsComplete || isAllDone(push.id))
                    const pushDateLabel = `${new Date(push.startDate).toLocaleDateString([], { month: 'short', day: 'numeric' })} - ${push.endDate ? new Date(push.endDate).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Ongoing'}`

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
                            className={cn("relative", isExpanded ? "min-w-0" : "shrink-0")}
                            style={{ width: isExpanded ? expandedWidth : collapsedWidth, transition: `width ${transitionDuration}ms ease-out` }}
                            onMouseEnter={() => setHoveredId(push.id)}
                            onMouseLeave={() => setHoveredId(null)}
                        >
                        {/* Corner badge on expanded push - fades out when content opens */}
                        {isExpanded && (
                            <span
                                className="absolute -top-2 -left-2 z-30 flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold leading-none pointer-events-none"
                                style={{
                                    background: `linear-gradient(135deg, ${lightenColor(projectColor || '#3b82f6', 0.85)}, ${lightenColor(projectColor || '#3b82f6', 0.62)})`,
                                    border: `1px solid ${lightenColor(projectColor || '#3b82f6', 0.42)}`,
                                    color: 'rgba(0,0,0,0.8)',
                                    transform: (myTaskCounts[push.id] ?? 0) > 0 ? 'scale(1)' : 'scale(0)',
                                    opacity: (myTaskCounts[push.id] ?? 0) > 0 ? 1 : 0,
                                    transition: (myTaskCounts[push.id] ?? 0) > 0
                                        ? 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.15s ease'
                                        : 'transform 0.18s ease-in, opacity 0.15s ease',
                                }}
                            >
                                {(myTaskCounts[push.id] ?? 0) > 99 ? '99' : (myTaskCounts[push.id] || '')}
                            </span>
                        )}
                        <div
                            className={cn(
                                "w-full h-full rounded-lg border shadow-sm overflow-hidden",
                                shouldTransitionBg && "transition-[background-color,border-color]",
                                !isExpanded && pushIsLocked
                                    ? "opacity-60 grayscale border-dashed cursor-not-allowed"
                                    : !isExpanded && "hover:shadow-md cursor-pointer"
                            )}
                            style={{
                                transitionDuration: `${transitionDuration}ms`,
                                backgroundColor: showGreenBg ? 'rgb(34 197 94)' : undefined,
                                borderColor: showGreenBg ? 'rgb(34 197 94 / 0.5)' : undefined,
                            }}
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

                                        {/* Assignee avatars + add task shortcut */}
                                        {(() => {
                                            const assignees = getAssignees?.(push.id) ?? []
                                            const canAdd = isAdmin && onAddTask && !pushIsComplete
                                            if (assignees.length === 0 && !canAdd) return null
                                            const maxVisible = 10
                                            const visible = assignees.slice(0, maxVisible)
                                            return (
                                                <div className="flex items-center -space-x-[5px] shrink-0" onClick={(e) => e.stopPropagation()}>
                                                    {canAdd && (
                                                        <Avatar
                                                            className="relative h-6 w-6 shrink-0 bg-background text-[10px] ring-2 ring-background cursor-pointer hover:ring-primary/30 transition-all"
                                                            style={{ zIndex: maxVisible + 1 }}
                                                            title="Add task"
                                                            onClick={() => onAddTask!(push)}
                                                        >
                                                            <AvatarFallback className="bg-muted/60 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                                                                <Plus className="h-3 w-3" />
                                                            </AvatarFallback>
                                                        </Avatar>
                                                    )}
                                                    {visible.map((a, i) => (
                                                        <Avatar
                                                            key={a.id}
                                                            className="relative h-6 w-6 shrink-0 bg-background text-[10px] ring-2 ring-background"
                                                            title={a.name}
                                                            style={{ zIndex: maxVisible - i }}
                                                        >
                                                            <AvatarFallback className="bg-primary/5 text-primary">
                                                                {getInitials(a.name)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                    ))}
                                                </div>
                                            )
                                        })()}
                                    </div>

                                    <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                                        <div className="flex items-center justify-end md:w-[8.75rem] md:shrink-0">
                                            {showMarkCompleteAction ? (
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
                                                    aria-label={pushIsComplete ? "Mark as not complete" : "Mark this project complete"}
                                                    className={cn(
                                                        "h-7 w-7 md:w-full inline-flex items-center justify-center gap-1.5 overflow-hidden rounded-md border px-0 md:px-3 text-xs font-medium transition-[background-color,border-color,color]",
                                                        pushIsComplete
                                                            ? "border-transparent bg-transparent text-emerald-700/70 hover:bg-emerald-50/40 hover:text-emerald-700"
                                                            : "border-green-200/80 bg-green-50/35 text-foreground hover:border-green-300 hover:bg-green-100/70"
                                                    )}
                                                >
                                                    <Check className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="hidden md:inline whitespace-nowrap">
                                                        {pushIsComplete ? "Completed" : "Mark Complete"}
                                                    </span>
                                                </button>
                                            ) : (
                                                <div
                                                    className={cn(
                                                        "hidden h-7 items-center justify-center md:flex md:w-full",
                                                        !pushIsComplete && push.taskCount > 0 ? "opacity-100" : "opacity-0 pointer-events-none"
                                                    )}
                                                >
                                                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-primary/60 rounded-full transition-all duration-300"
                                                            style={{ width: `${percent}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div
                                            className={cn(
                                                "hidden md:flex md:w-[150px] md:shrink-0 md:justify-center transition-opacity duration-200 ease-out opacity-100"
                                            )}
                                        >
                                            <span className={cn(
                                                "inline-flex w-full items-center justify-center px-2 py-0.5 text-xs tabular-nums whitespace-nowrap",
                                                pushIsComplete ? "text-muted-foreground/55" : "text-muted-foreground"
                                            )}>
                                                {pushDateLabel}
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
