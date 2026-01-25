"use client"

import { useState, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { GripVertical, Lock, Plus } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { type PushDraft, type DragType, formatDateShort, differenceInDays, addDays, startOfDay } from "./types"

type TimelineBarProps = {
    push: PushDraft
    timelineStart: Date
    timelineEnd: Date
    onUpdate: (id: string, updates: Partial<PushDraft>) => void
    onDelete: (id: string) => void
    isSelected: boolean
    onSelect: (id: string | null) => void
    onClick?: () => void
    rowIndex: number
    readOnly?: boolean
    isDependent?: boolean
    dependencyCompleted?: boolean
    onAddChained?: (afterPushId: string, endDate?: Date) => void
    isChainedWithNext?: boolean
    isTouchingPrevious?: boolean
    isTouchingNext?: boolean
    getDateFromX?: (clientX: number) => Date
}

const ROW_HEIGHT = 48
const MIN_MOVE_FOR_DRAG = 5

export function TimelineBar({
    push,
    timelineStart,
    timelineEnd,
    onUpdate,
    onDelete,
    isSelected,
    onSelect,
    onClick,
    rowIndex,
    readOnly = false,
    isDependent = false,
    dependencyCompleted = true,
    onAddChained,
    isChainedWithNext = false,
    isTouchingPrevious = false,
    isTouchingNext = false,
    getDateFromX
}: TimelineBarProps) {
    const barRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [dragType, setDragType] = useState<DragType>(null)
    const [dragOffset, setDragOffset] = useState({ x: 0 })
    const [startPos, setStartPos] = useState({ x: 0, y: 0 })
    const [hasMoved, setHasMoved] = useState(false)

    // Chain drag state
    const [isChainDragging, setIsChainDragging] = useState(false)
    const [chainDragEnd, setChainDragEnd] = useState<Date | null>(null)

    const totalDuration = timelineEnd.getTime() - timelineStart.getTime()

    const getPositionPercent = useCallback((date: Date) => {
        return ((date.getTime() - timelineStart.getTime()) / totalDuration) * 100
    }, [timelineStart, totalDuration])

    const pushEnd = push.endDate || addDays(push.startDate, 14)
    const leftPercent = getPositionPercent(push.startDate)
    const widthPercent = getPositionPercent(pushEnd) - leftPercent

    const handlePointerDown = useCallback((e: React.PointerEvent, type: DragType) => {
        if (readOnly) return
        e.preventDefault()
        e.stopPropagation()

        const target = e.currentTarget as HTMLElement
        target.setPointerCapture(e.pointerId)

        setIsDragging(true)
        setDragType(type)
        setDragOffset({ x: 0 })
        setStartPos({ x: e.clientX, y: e.clientY })
        setHasMoved(false)
        onSelect(push.tempId)
    }, [readOnly, push.tempId, onSelect])

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDragging || !barRef.current) return

        const distanceMoved = Math.sqrt(
            Math.pow(e.clientX - startPos.x, 2) + Math.pow(e.clientY - startPos.y, 2)
        )
        if (distanceMoved > MIN_MOVE_FOR_DRAG) {
            setHasMoved(true)
        }

        const container = barRef.current.parentElement
        if (!container) return

        const rect = container.getBoundingClientRect()
        const percentPerPixel = 100 / rect.width
        const deltaPercent = e.movementX * percentPerPixel

        setDragOffset(prev => ({ x: prev.x + deltaPercent }))
    }, [isDragging, startPos])

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (!isDragging) return

        const target = e.currentTarget as HTMLElement
        target.releasePointerCapture(e.pointerId)

        if (hasMoved) {
            const daysDelta = Math.round((dragOffset.x / 100) * (totalDuration / (1000 * 60 * 60 * 24)))

            if (daysDelta !== 0) {
                if (dragType === 'move') {
                    const newStart = addDays(push.startDate, daysDelta)
                    const newEnd = push.endDate ? addDays(push.endDate, daysDelta) : null
                    onUpdate(push.tempId, { startDate: newStart, endDate: newEnd })
                } else if (dragType === 'resize-start') {
                    const newStart = addDays(push.startDate, daysDelta)
                    if (newStart < pushEnd) {
                        onUpdate(push.tempId, { startDate: newStart })
                    }
                } else if (dragType === 'resize-end') {
                    const currentEnd = push.endDate || addDays(push.startDate, 14)
                    const newEnd = addDays(currentEnd, daysDelta)
                    if (newEnd > push.startDate) {
                        onUpdate(push.tempId, { endDate: newEnd })
                    }
                }
            }
        } else if (onClick && dragType === 'move') {
            onClick()
        }

        setIsDragging(false)
        setDragType(null)
        setDragOffset({ x: 0 })
        setHasMoved(false)
    }, [isDragging, hasMoved, dragOffset, dragType, push, pushEnd, totalDuration, onUpdate, onClick])

    // Chain drag handlers
    const handleChainPointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault()
        e.stopPropagation()

        const target = e.currentTarget as HTMLElement
        target.setPointerCapture(e.pointerId)

        setIsChainDragging(true)
        setStartPos({ x: e.clientX, y: e.clientY })
        setHasMoved(false)
        setChainDragEnd(null)
    }, [])

    const handleChainPointerMove = useCallback((e: React.PointerEvent) => {
        if (!isChainDragging || !getDateFromX) return

        const distanceMoved = Math.abs(e.clientX - startPos.x)
        if (distanceMoved > MIN_MOVE_FOR_DRAG) {
            setHasMoved(true)
            const endDate = getDateFromX(e.clientX)
            if (endDate > pushEnd) {
                setChainDragEnd(endDate)
            }
        }
    }, [isChainDragging, startPos, getDateFromX, pushEnd])

    const handleChainPointerUp = useCallback((e: React.PointerEvent) => {
        if (!isChainDragging) return

        const target = e.currentTarget as HTMLElement
        target.releasePointerCapture(e.pointerId)

        if (hasMoved && chainDragEnd && onAddChained) {
            onAddChained(push.tempId, chainDragEnd)
        } else if (onAddChained) {
            onAddChained(push.tempId)
        }

        setIsChainDragging(false)
        setChainDragEnd(null)
        setHasMoved(false)
    }, [isChainDragging, hasMoved, chainDragEnd, push.tempId, onAddChained])

    let visualLeft = leftPercent
    let visualWidth = widthPercent

    if (isDragging && hasMoved && dragOffset.x !== 0) {
        if (dragType === 'move') {
            visualLeft = leftPercent + dragOffset.x
        } else if (dragType === 'resize-start') {
            visualLeft = leftPercent + dragOffset.x
            visualWidth = widthPercent - dragOffset.x
        } else if (dragType === 'resize-end') {
            visualWidth = widthPercent + dragOffset.x
        }
    }

    const duration = differenceInDays(pushEnd, push.startDate)
    const isGreyedOut = isDependent && !dependencyCompleted

    // Chain preview dimensions
    const chainPreviewLeft = getPositionPercent(pushEnd)
    const chainPreviewWidth = chainDragEnd ? getPositionPercent(chainDragEnd) - chainPreviewLeft : 0

    // Determine edge styling based on whether pushes are touching
    const leftEdgeRounded = !isTouchingPrevious
    const rightEdgeRounded = !isTouchingNext

    return (
        <>
            <div
                ref={barRef}
                data-timeline-bar
                className={cn(
                    "absolute h-9 cursor-pointer transition-all select-none group",
                    isDragging && hasMoved && "z-50 shadow-lg scale-[1.02]",
                    isSelected && !isDragging && "ring-2 ring-primary ring-offset-1",
                    !isDragging && "hover:brightness-110",
                    isGreyedOut && "opacity-50",
                    leftEdgeRounded ? "rounded-l-lg" : "rounded-l-none",
                    rightEdgeRounded ? "rounded-r-lg" : "rounded-r-none"
                )}
                style={{
                    left: `${visualLeft}%`,
                    width: `${Math.max(visualWidth, 2)}%`,
                    top: `${rowIndex * ROW_HEIGHT + 6}px`,
                    background: isGreyedOut
                        ? `linear-gradient(90deg, #94a3b8dd, #94a3b8bb)`
                        : `linear-gradient(90deg, ${push.color}ee, ${push.color}bb)`,
                    transform: isDragging && hasMoved ? 'scale(1.02)' : undefined,
                    transition: isDragging ? 'none' : 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)'
                }}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                {/* Left resize handle */}
                {!readOnly && (
                    <div
                        className={cn(
                            "absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 transition-colors",
                            leftEdgeRounded && "rounded-l-lg"
                        )}
                        onPointerDown={(e) => handlePointerDown(e, 'resize-start')}
                    />
                )}

                {/* Main bar content - draggable */}
                <div
                    className={cn(
                        "absolute inset-0 mx-2 flex items-center gap-1 overflow-hidden",
                        !readOnly && "cursor-grab active:cursor-grabbing"
                    )}
                    onPointerDown={(e) => !readOnly && handlePointerDown(e, 'move')}
                >
                    {!readOnly && (
                        <GripVertical className="h-3 w-3 text-white/60 shrink-0" />
                    )}

                    {isGreyedOut && (
                        <Lock className="h-3 w-3 text-white/60 shrink-0" />
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
                            {isDependent && !dependencyCompleted && (
                                <div className="text-amber-500 mt-1">Blocked</div>
                            )}
                        </TooltipContent>
                    </Tooltip>
                </div>

                {/* Right resize handle */}
                {!readOnly && (
                    <div
                        className={cn(
                            "absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 transition-colors",
                            rightEdgeRounded && "rounded-r-lg"
                        )}
                        onPointerDown={(e) => handlePointerDown(e, 'resize-end')}
                    />
                )}

                {/* Add chained push button - hide tooltip while dragging */}
                {!readOnly && onAddChained && !isChainedWithNext && (
                    <Tooltip open={isChainDragging ? false : undefined}>
                        <TooltipTrigger asChild>
                            <div
                                className={cn(
                                    "absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full",
                                    "bg-background border-2 border-muted-foreground/40 flex items-center justify-center",
                                    "opacity-0 group-hover:opacity-100 transition-all duration-200",
                                    "hover:bg-primary hover:border-primary hover:scale-110 cursor-pointer z-10",
                                    isChainDragging && "opacity-100 bg-primary border-primary scale-110"
                                )}
                                onPointerDown={handleChainPointerDown}
                                onPointerMove={handleChainPointerMove}
                                onPointerUp={handleChainPointerUp}
                                onPointerCancel={handleChainPointerUp}
                            >
                                <Plus className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary-foreground" />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs">
                            Click or drag to add push
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>

            {/* Chain drag preview - renders behind plus button */}
            {isChainDragging && hasMoved && chainDragEnd && (
                <div
                    className="absolute h-9 rounded-lg bg-primary/40 border-2 border-dashed border-primary pointer-events-none z-0"
                    style={{
                        left: `${chainPreviewLeft}%`,
                        width: `${Math.max(chainPreviewWidth, 2)}%`,
                        top: `${rowIndex * ROW_HEIGHT + 6}px`
                    }}
                />
            )}
        </>
    )
}
