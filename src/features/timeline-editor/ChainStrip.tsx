"use client"

import { useState, useEffect, useMemo } from "react"
import { cn } from "@/lib/utils"
import { GripVertical, Plus } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { type PushDraft, formatDateShort, differenceInDays, addDays } from "./types"
import { ChainSquare } from "./ChainSquare"

type ChainStripProps = {
    chain: PushDraft[]
    completedIds: Set<string>
    selectedPushId: string | null
    onSelect: (id: string | null) => void
    onUpdate: (id: string, updates: Partial<PushDraft>) => void
    onClick?: (pushId: string) => void
    rowIndex: number
    readOnly?: boolean
    onAddChained?: (afterPushId: string) => void
}

const ROW_HEIGHT = 48

export function ChainStrip({
    chain,
    completedIds,
    selectedPushId,
    onSelect,
    onUpdate: _onUpdate,
    onClick,
    rowIndex,
    readOnly = false,
    onAddChained
}: ChainStripProps) {
    // _onUpdate reserved for future inline editing
    void _onUpdate
    // Determine the active push (first incomplete in chain)
    const activePushId = useMemo(() => {
        for (const push of chain) {
            if (!completedIds.has(push.tempId)) {
                return push.tempId
            }
        }
        // All completed - return the last one
        return chain[chain.length - 1]?.tempId ?? null
    }, [chain, completedIds])

    // Track which push is currently expanded (defaults to active)
    const [expandedPushId, setExpandedPushId] = useState<string | null>(activePushId)

    // Sync expandedPushId when activePushId changes (e.g., push completed)
    useEffect(() => {
        setExpandedPushId(activePushId)
    }, [activePushId])

    const handleSquareClick = (pushId: string) => {
        setExpandedPushId(pushId)
        onSelect(pushId)
    }

    const handleExpandedClick = () => {
        const expandedPush = chain.find(p => p.tempId === expandedPushId)
        if (expandedPush && onClick) {
            onClick(expandedPush.tempId)
        }
    }

    const expandedPush = chain.find(p => p.tempId === expandedPushId)
    const isLastInChain = expandedPushId === chain[chain.length - 1]?.tempId
    const isExpandedCompleted = expandedPushId ? completedIds.has(expandedPushId) : false

    if (!expandedPush) return null

    const pushEnd = expandedPush.endDate || addDays(expandedPush.startDate, 14)
    const duration = differenceInDays(pushEnd, expandedPush.startDate)

    return (
        <div
            className="absolute left-4 right-4 h-9 flex items-center gap-1.5"
            style={{ top: `${rowIndex * ROW_HEIGHT + 6}px` }}
        >
            {chain.map((push, index) => {
                const isExpanded = push.tempId === expandedPushId
                const isCompleted = completedIds.has(push.tempId)

                if (isExpanded) {
                    // Render expanded push
                    return (
                        <div
                            key={push.tempId}
                            className={cn(
                                "relative flex-1 h-full rounded-lg cursor-pointer",
                                "transition-all duration-300",
                                "hover:brightness-110",
                                selectedPushId === push.tempId && "ring-2 ring-primary ring-offset-1",
                                isExpandedCompleted && "opacity-80"
                            )}
                            style={{
                                background: `linear-gradient(90deg, ${push.color}ee, ${push.color}bb)`,
                                transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
                            }}
                            onClick={handleExpandedClick}
                        >
                            <div className="absolute inset-0 mx-3 flex items-center gap-2 overflow-hidden">
                                {!readOnly && (
                                    <GripVertical className="h-3 w-3 text-white/60 shrink-0" />
                                )}

                                {isExpandedCompleted && (
                                    <div className="flex items-center gap-1 text-white/80 text-xs shrink-0">
                                        <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                            DONE
                                        </span>
                                    </div>
                                )}

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="text-xs font-medium text-white truncate">
                                            {push.name || 'Untitled'}
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                        <div className="font-medium">{push.name || 'Untitled'}</div>
                                        <div className="text-muted-foreground">
                                            {formatDateShort(push.startDate)} − {formatDateShort(pushEnd)} ({duration}d)
                                        </div>
                                        <div className="text-muted-foreground mt-1">
                                            Push {index + 1} of {chain.length}
                                        </div>
                                    </TooltipContent>
                                </Tooltip>

                                <div className="ml-auto flex items-center gap-1 text-white/60 text-[10px] shrink-0">
                                    <span>{index + 1}/{chain.length}</span>
                                </div>
                            </div>

                            {/* Add chained button - only on last push */}
                            {!readOnly && isLastInChain && onAddChained && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            className={cn(
                                                "absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full",
                                                "bg-white border-2 border-muted-foreground/40 flex items-center justify-center",
                                                "opacity-0 hover:opacity-100 transition-all duration-200",
                                                "hover:bg-primary hover:border-primary hover:scale-110 cursor-pointer z-30 shadow-md",
                                                "group-hover:opacity-100"
                                            )}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onAddChained(push.tempId)
                                            }}
                                        >
                                            <Plus className="h-3.5 w-3.5 text-muted-foreground hover:text-primary-foreground transition-colors" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="text-xs">
                                        Add division to chain
                                    </TooltipContent>
                                </Tooltip>
                            )}
                        </div>
                    )
                }

                // Render collapsed square
                return (
                    <ChainSquare
                        key={push.tempId}
                        push={push}
                        state={isCompleted ? 'completed' : 'upcoming'}
                        onClick={() => handleSquareClick(push.tempId)}
                    />
                )
            })}
        </div>
    )
}
