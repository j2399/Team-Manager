"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
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
    const [isContentOpen, setIsContentOpen] = useState(true)
    const [hoveredId, setHoveredId] = useState<string | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // If user hasn't selected anything, or their selection is no longer valid, use active
    const expandedPushId = useMemo(() => {
        if (userSelectedPushId && chain.find(p => p.id === userSelectedPushId)) {
            return userSelectedPushId
        }
        return activePushId
    }, [userSelectedPushId, activePushId, chain])

    useEffect(() => {
        if (expandedPushId && !loadedPushes[expandedPushId]) {
            loadPushTasks(expandedPushId)
        }
    }, [expandedPushId, loadedPushes, loadPushTasks])

    const handlePushClick = useCallback((push: PushType) => {
        if (isLocked(push)) return

        if (push.id === expandedPushId) {
            setIsContentOpen(prev => !prev)
        } else {
            setUserSelectedPushId(push.id)
            setIsContentOpen(true)
        }
    }, [expandedPushId, isLocked])

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
                    const isHovered = hoveredId === push.id && !pushIsLocked

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
                                    "flex items-center justify-center",
                                    "transition-[width,min-width,background-color,opacity,box-shadow] duration-300 ease-out",
                                    pushIsComplete ? "bg-muted/40 border-border/50" : "bg-card",
                                    pushIsLocked
                                        ? "cursor-not-allowed opacity-50 grayscale border-dashed"
                                        : "cursor-pointer hover:shadow-md"
                                )}
                                style={{
                                    width: isHovered ? 'auto' : 48,
                                    minWidth: isHovered ? 140 : 48,
                                    height: 52,
                                }}
                            >
                                {/* Color indicator bar */}
                                <div
                                    className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
                                    style={{ backgroundColor: push.color }}
                                />

                                <div className={cn(
                                    "flex items-center gap-2 px-3 transition-opacity duration-200",
                                    isHovered ? "opacity-100" : "opacity-100"
                                )}>
                                    {pushIsLocked ? (
                                        <Lock className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                                    ) : pushIsComplete ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                    ) : (
                                        <span
                                            className="h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                                            style={{ backgroundColor: push.color }}
                                        >
                                            {index + 1}
                                        </span>
                                    )}

                                    {isHovered && (
                                        <span className="text-sm font-medium truncate whitespace-nowrap">
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
                                "flex-1 min-w-0 rounded-lg border shadow-sm transition-all duration-300 ease-out",
                                pushIsComplete ? "bg-muted/40 border-border/50" : "bg-card",
                                "hover:shadow-md"
                            )}
                        >
                            <button
                                type="button"
                                onClick={() => handlePushClick(push)}
                                className={cn(
                                    "w-full flex items-center justify-between p-3 transition-colors relative overflow-hidden",
                                    isContentOpen ? "rounded-t-lg" : "rounded-lg",
                                    "hover:bg-accent/50 dark:hover:bg-accent/20"
                                )}
                            >
                                {/* Color indicator bar */}
                                <div
                                    className="absolute left-0 top-0 bottom-0 w-1"
                                    style={{ backgroundColor: push.color }}
                                />

                                <div className="flex items-center gap-2 min-w-0 pl-2">
                                    <span className={cn(
                                        "font-semibold text-base tracking-tight truncate",
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
                                                "h-7 flex items-center gap-1 px-2 rounded-md border transition-all shrink-0 text-xs ml-2",
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

                                <div className="flex items-center gap-2 shrink-0">
                                    {!pushIsComplete && push.taskCount > 0 && (
                                        <div className="hidden md:flex items-center gap-2">
                                            <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary/60 rounded-full transition-all duration-300"
                                                    style={{ width: `${(push.completedCount / push.taskCount) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {index + 1}/{chain.length}
                                    </span>

                                    {isAdmin && (
                                        <div
                                            role="button"
                                            onClick={(e) => onEditPush(e, push)}
                                            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-primary/10 hover:text-primary transition-colors"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </div>
                                    )}

                                    <div className="h-7 w-7 flex items-center justify-center">
                                        <ChevronDown
                                            className={cn(
                                                "h-4 w-4 text-muted-foreground transition-transform duration-300",
                                                isContentOpen && "rotate-180"
                                            )}
                                        />
                                    </div>
                                </div>
                            </button>

                            {/* Content Panel */}
                            <div
                                className="grid transition-[grid-template-rows] duration-300 ease-out"
                                style={{ gridTemplateRows: isContentOpen ? "1fr" : "0fr" }}
                            >
                                <div className={cn(
                                    "min-h-0 overflow-hidden",
                                    isContentOpen ? "opacity-100" : "opacity-0"
                                )}>
                                    <div className={cn(
                                        "p-4 pt-0 border-t transition-opacity duration-200",
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
