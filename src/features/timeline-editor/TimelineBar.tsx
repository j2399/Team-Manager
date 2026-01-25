"use client"

import { useState, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { GripVertical, Lock, Plus, CheckCircle2 } from "lucide-react"
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
    otherPushesOnSameRow?: PushDraft[]
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
    getDateFromX,
    otherPushesOnSameRow = []
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

                    // Final move collision check
                    const currentEnd = push.endDate || addDays(push.startDate, 14)
                    const durationDays = differenceInDays(currentEnd, push.startDate)
                    const finalEnd = newEnd || addDays(newStart, durationDays)

                    const isOverlapping = otherPushesOnSameRow.some(other => {
                        const otherEnd = other.endDate || addDays(other.startDate, 14)
                        return newStart < otherEnd && finalEnd > other.startDate
                    })

                    if (!isOverlapping) {
                        onUpdate(push.tempId, { startDate: newStart, endDate: newEnd })
                    }
                } else if (dragType === 'resize-start') {
                    const newStart = addDays(push.startDate, daysDelta)
                    // Check if newStart overlaps with any other push or passes current end
                    const isOverlapping = otherPushesOnSameRow.some(other => {
                        const otherEnd = other.endDate || addDays(other.startDate, 14)
                        return newStart < otherEnd && pushEnd > other.startDate
                    })
                    if (newStart < pushEnd && !isOverlapping) {
                        onUpdate(push.tempId, { startDate: newStart })
                    }
                } else if (dragType === 'resize-end') {
                    const currentEnd = push.endDate || addDays(push.startDate, 14)
                    const newEnd = addDays(currentEnd, daysDelta)
                    // Check if newEnd overlaps with any other push or passes current start
                    const isOverlapping = otherPushesOnSameRow.some(other => {
                        const otherEnd = other.endDate || addDays(other.startDate, 14)
                        return push.startDate < otherEnd && newEnd > other.startDate
                    })
                    if (newEnd > push.startDate && !isOverlapping) {
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
            const nextLeft = leftPercent + dragOffset.x
            const currentWidth = widthPercent

            // Check collisions for move
            let clampedLeft = nextLeft
            otherPushesOnSameRow.forEach(other => {
                const otherEnd = getPositionPercent(other.endDate || addDays(other.startDate, 14))
                const otherStart = getPositionPercent(other.startDate)

                // If moving left and hitting something
                if (dragOffset.x < 0 && nextLeft < otherEnd && nextLeft > otherStart - currentWidth) {
                    clampedLeft = Math.max(clampedLeft, otherEnd)
                }
                // If moving right and hitting something
                if (dragOffset.x > 0 && nextLeft + currentWidth > otherStart && nextLeft < otherEnd) {
                    clampedLeft = Math.min(clampedLeft, otherStart - currentWidth)
                }
            })

            visualLeft = clampedLeft
        } else if (dragType === 'resize-start') {
            const nextLeft = leftPercent + dragOffset.x
            const nextWidth = widthPercent - dragOffset.x

            // Check collisions for resize-start
            let clampedLeft = nextLeft
            otherPushesOnSameRow.forEach(other => {
                const otherEnd = getPositionPercent(other.endDate || addDays(other.startDate, 14))
                if (nextLeft < otherEnd && leftPercent >= otherEnd) {
                    clampedLeft = Math.max(clampedLeft, otherEnd)
                }
            })

            visualLeft = clampedLeft
            visualWidth = widthPercent - (visualLeft - leftPercent)
        } else if (dragType === 'resize-end') {
            const nextWidth = widthPercent + dragOffset.x
            const nextEnd = leftPercent + nextWidth

            // Check collisions for resize-end
            let clampedEnd = nextEnd
            otherPushesOnSameRow.forEach(other => {
                const otherStart = getPositionPercent(other.startDate)
                if (nextEnd > otherStart && (leftPercent + widthPercent) <= otherStart) {
                    clampedEnd = Math.min(clampedEnd, otherStart)
                }
            })

            visualWidth = clampedEnd - leftPercent
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
                    "absolute h-9 cursor-pointer transition-all select-none group z-10",
                    isDragging && hasMoved && "z-50 shadow-lg scale-[1.02]",
                    isSelected && !isDragging && "ring-2 ring-primary ring-offset-1",
                    !isDragging && "hover:brightness-105",
                    leftEdgeRounded ? "rounded-l-lg" : "rounded-l-none",
                    rightEdgeRounded ? "rounded-r-lg" : "rounded-r-none",
                    // Use standard card styling:
                    push.status === 'Completed' ? "bg-muted/40 border border-border/50" : "bg-card border border-border"
                )}
                style={{
                    left: `${visualLeft}%`,
                    width: `${Math.max(visualWidth, 2)}%`,
                    top: `${rowIndex * ROW_HEIGHT + 6}px`,
                    transform: isDragging && hasMoved ? 'scale(1.02)' : undefined,
                    transition: isDragging ? 'none' : 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                }}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                {/* Subtle color tint for active pushes - slightly more vibrant */}
                {push.status !== 'Completed' && (
                    <div
                        className={cn(
                            "absolute inset-0 opacity-20 mix-blend-multiply dark:mix-blend-screen pointer-events-none",
                            leftEdgeRounded && "rounded-l-lg",
                            rightEdgeRounded && "rounded-r-lg"
                        )}
                        style={{
                            backgroundColor: push.color,
                        }}
                    />
                )}

                {/* Left resize handle */}
                {!readOnly && (
                    <div
                        className={cn(
                            "absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-muted/30 transition-colors z-20",
                            leftEdgeRounded && "rounded-l-lg"
                        )}
                        onPointerDown={(e) => handlePointerDown(e, 'resize-start')}
                    />
                )}

                {/* Main bar content - draggable */}
                <div
                    className={cn(
                        "absolute inset-0 mx-2 flex items-center gap-1 overflow-hidden",
                        !readOnly && "cursor-grab active:cursor-grabbing",
                        isGreyedOut && "opacity-50"
                    )}
                    onPointerDown={(e) => !readOnly && handlePointerDown(e, 'move')}
                >
                    {!readOnly && (
                        <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                    )}

                    {isGreyedOut && (
                        <Lock className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                    )}

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className={cn(
                                    "text-xs font-semibold truncate select-none",
                                    push.status === 'Completed' ? "text-muted-foreground" : "text-foreground"
                                )}>
                                    {push.name || 'Untitled'}
                                </span>
                                {push.status === 'Completed' && (
                                    <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                                )}
                            </div>
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
                            "absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-muted/30 transition-colors z-20",
                            rightEdgeRounded && "rounded-r-lg"
                        )}
                        onPointerDown={(e) => handlePointerDown(e, 'resize-end')}
                    />
                )}

                {/* Add chained push button - hide if isTouchingNext is true to prevent redundancy */}
                {!readOnly && onAddChained && !isChainedWithNext && !isTouchingNext && (
                    <Tooltip open={isChainDragging ? false : undefined}>
                        <TooltipTrigger asChild>
                            <div
                                className={cn(
                                    "absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full",
                                    "bg-background border border-border shadow-sm flex items-center justify-center",
                                    "opacity-0 group-hover:opacity-100 transition-all duration-200 group/plus",
                                    "hover:bg-primary hover:text-primary-foreground hover:scale-110 cursor-pointer z-30",
                                    isChainDragging && "opacity-100 bg-primary text-primary-foreground scale-110"
                                )}
                                onPointerDown={handleChainPointerDown}
                                onPointerMove={handleChainPointerMove}
                                onPointerUp={handleChainPointerUp}
                                onPointerCancel={handleChainPointerUp}
                                onLostPointerCapture={() => {
                                    setIsChainDragging(false)
                                    setChainDragEnd(null)
                                    setHasMoved(false)
                                }}
                            >
                                <Plus
                                    className={cn(
                                        "h-3.5 w-3.5 transition-colors",
                                        !isChainDragging && "text-muted-foreground group-hover:text-primary-foreground"
                                    )}
                                />
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
                    className="absolute h-9 rounded-lg bg-primary/10 border-2 border-dashed border-primary/50 pointer-events-none z-0"
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
