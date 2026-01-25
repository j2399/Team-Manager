"use client"

import { useState, useMemo, useCallback, useRef } from "react"
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
    // Determine the active push (first incomplete in chain)
    const activePushId = useMemo(() => {
        for (const push of chain) {
            if (!isComplete(push.id)) {
                return push.id
            }
        }
        return chain[chain.length - 1]?.id ?? null
    }, [chain, isComplete])

    // Check if a push is locked
    const isLocked = useCallback((push: PushType) => {
        if (!push.dependsOnId) return false
        return !isComplete(push.dependsOnId)
    }, [isComplete])

    // Track user's explicit selection - null means "follow active"
    const [userSelectedPushId, setUserSelectedPushId] = useState<string | null>(null)
    const [isContentOpen, setIsContentOpen] = useState(false)
    const [hoveredId, setHoveredId] = useState<string | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // If user hasn't selected anything, or their selection is no longer valid, use active
    const expandedPushId = useMemo(() => {
        if (userSelectedPushId && chain.find(p => p.id === userSelectedPushId)) {
            return userSelectedPushId
        }
        return activePushId
    }, [userSelectedPushId, activePushId, chain])

    // Load tasks when expanded push changes
    const ensureTasksLoaded = useCallback((pushId: string) => {
        if (!loadedPushes[pushId]) {
            loadPushTasks(pushId)
        }
    }, [loadedPushes, loadPushTasks])

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
        }
    }, [expandedPushId, isLocked, isContentOpen, ensureTasksLoaded])

    const expandedPush = chain.find(p => p.id === expandedPushId)

    if (!expandedPush || chain.length < 2) return null

    return (
        <div className="w-full" ref={containerRef}>
            {/* Chain Strip - matches single push card style */}
            <div className="flex items-stretch gap-2">
                {chain.map((push, index) => {
                    const isExpanded = push.id === expandedPushId
                    const pushIsComplete = isComplete(push.id)
                    const pushIsLocked = isLocked(push)
                    const isHovered = hoveredId === push.id

                    // Collapsed square
                    if (!isExpanded) {
                        return (
                            <button
                                key={push.id}
                                type="button"
                                onClick={() => handlePushClick(push)}
                                onMouseEnter={() => setHoveredId(push.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                disabled={pushIsLocked}
                                className={cn(
                                    "relative rounded-lg border shadow-sm overflow-hidden",
                                    "flex items-center",
                                    "transition-[width,min-width,box-shadow] duration-300 ease-out",
                                    pushIsComplete ? "bg-muted/40 border-border/50" : "bg-card border-border",
                                    pushIsLocked
                                        ? "cursor-not-allowed opacity-70 grayscale border-dashed"
                                        : "cursor-pointer hover:shadow-md"
                                )}
                                style={{
                                    width: isHovered ? 'auto' : 56,
                                    minWidth: isHovered ? 160 : 56,
                                }}
                            >
                                <div className="flex items-center gap-2 px-4 py-3 h-full">
                                    {pushIsLocked ? (
                                        <Lock className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                                    ) : pushIsComplete ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                    ) : (
                                        <span className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                                            {index + 1}
                                        </span>
                                    )}

                                    {isHovered && (
                                        <span className={cn(
                                            "text-sm font-semibold truncate whitespace-nowrap",
                                            pushIsComplete && "text-muted-foreground",
                                            pushIsLocked && "text-muted-foreground/70"
                                        )}>
                                            {push.name}
                                        </span>
                                    )}
                                </div>
                            </button>
                        )
                    }

                    // Expanded push - matches single push card style exactly
                    return (
                        <div
                            key={push.id}
                            className={cn(
                                "flex-1 min-w-0 rounded-lg border shadow-sm transition-shadow duration-200",
                                pushIsComplete ? "bg-muted/40 border-border/50" : "bg-card border-border",
                                "hover:shadow-md"
                            )}
                        >
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

                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {index + 1}/{chain.length}
                                    </span>

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

                            {/* Content Panel */}
                            <div
                                className="grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
                                style={{ gridTemplateRows: isContentOpen ? "1fr" : "0fr" }}
                            >
                                <div className={cn(
                                    "min-h-0",
                                    isContentOpen ? "overflow-visible" : "overflow-hidden"
                                )}>
                                    <div className={cn(
                                        "p-4 pt-0 border-t rounded-b-lg transition-opacity duration-150",
                                        isContentOpen ? "opacity-100" : "opacity-0 pointer-events-none",
                                        pushIsComplete ? "bg-muted/20 border-border/30" : "bg-muted/10"
                                    )}>
                                        <div className="pt-4">
                                            {loadingPushes[expandedPush.id] ? (
                                                <div className="h-[180px] rounded-lg border bg-background/60 animate-pulse" />
                                            ) : (
                                                renderPushBoard(expandedPush.id)
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
