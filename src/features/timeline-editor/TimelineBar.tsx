"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Trash2, GripVertical } from "lucide-react"
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
    rowIndex: number
    readOnly?: boolean
}

const ROW_HEIGHT = 48

export function TimelineBar({
    push,
    timelineStart,
    timelineEnd,
    onUpdate,
    onDelete,
    isSelected,
    onSelect,
    rowIndex,
    readOnly = false
}: TimelineBarProps) {
    const barRef = useRef<HTMLDivElement>(null)
    const [isEditing, setIsEditing] = useState(false)
    const [editName, setEditName] = useState(push.name)
    const [isDragging, setIsDragging] = useState(false)
    const [dragType, setDragType] = useState<DragType>(null)
    const [dragOffset, setDragOffset] = useState({ x: 0 })

    const totalDuration = timelineEnd.getTime() - timelineStart.getTime()

    const getPositionPercent = useCallback((date: Date) => {
        return ((date.getTime() - timelineStart.getTime()) / totalDuration) * 100
    }, [timelineStart, totalDuration])

    const getDateFromPercent = useCallback((percent: number) => {
        const timestamp = timelineStart.getTime() + (percent / 100) * totalDuration
        return startOfDay(new Date(timestamp))
    }, [timelineStart, totalDuration])

    const pushEnd = push.endDate || addDays(push.startDate, 14)
    const leftPercent = getPositionPercent(push.startDate)
    const widthPercent = getPositionPercent(pushEnd) - leftPercent

    // Handle name editing
    const handleNameSubmit = () => {
        if (editName.trim() && editName !== push.name) {
            onUpdate(push.tempId, { name: editName.trim() })
        }
        setIsEditing(false)
    }

    // Drag handlers
    const handlePointerDown = useCallback((e: React.PointerEvent, type: DragType) => {
        if (readOnly) return
        e.preventDefault()
        e.stopPropagation()

        const target = e.currentTarget as HTMLElement
        target.setPointerCapture(e.pointerId)

        setIsDragging(true)
        setDragType(type)
        setDragOffset({ x: 0 })
        onSelect(push.tempId)
    }, [readOnly, push.tempId, onSelect])

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDragging || !barRef.current) return

        const container = barRef.current.parentElement
        if (!container) return

        const rect = container.getBoundingClientRect()
        const percentPerPixel = 100 / rect.width
        const deltaPercent = e.movementX * percentPerPixel

        setDragOffset(prev => ({ x: prev.x + deltaPercent }))
    }, [isDragging])

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (!isDragging) return

        const target = e.currentTarget as HTMLElement
        target.releasePointerCapture(e.pointerId)

        // Calculate final dates based on drag offset
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

        setIsDragging(false)
        setDragType(null)
        setDragOffset({ x: 0 })
    }, [isDragging, dragOffset, dragType, push, pushEnd, totalDuration, onUpdate])

    // Calculate visual position during drag
    let visualLeft = leftPercent
    let visualWidth = widthPercent

    if (isDragging && dragOffset.x !== 0) {
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

    return (
        <div
            ref={barRef}
            className={cn(
                "absolute h-9 rounded-lg cursor-pointer transition-all select-none",
                isDragging && "z-50 shadow-lg scale-[1.02]",
                isSelected && !isDragging && "ring-2 ring-primary ring-offset-1",
                !isDragging && "hover:brightness-110"
            )}
            style={{
                left: `${visualLeft}%`,
                width: `${Math.max(visualWidth, 2)}%`,
                top: `${rowIndex * ROW_HEIGHT + 6}px`,
                background: `linear-gradient(90deg, ${push.color}ee, ${push.color}bb)`,
                transform: isDragging ? 'scale(1.02)' : undefined,
                transition: isDragging ? 'none' : 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)'
            }}
            onClick={() => !readOnly && onSelect(isSelected ? null : push.tempId)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
        >
            {/* Left resize handle */}
            {!readOnly && (
                <div
                    className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-l-lg transition-colors"
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

                {isEditing ? (
                    <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={handleNameSubmit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleNameSubmit()
                            if (e.key === 'Escape') {
                                setEditName(push.name)
                                setIsEditing(false)
                            }
                        }}
                        className="h-6 text-xs bg-white/20 border-white/30 text-white placeholder:text-white/50"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span
                                className="text-xs font-medium text-white truncate"
                                onDoubleClick={() => !readOnly && setIsEditing(true)}
                            >
                                {push.name || 'Untitled Push'}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                            <div className="font-medium">{push.name || 'Untitled Push'}</div>
                            <div className="text-muted-foreground">
                                {formatDateShort(push.startDate)} - {formatDateShort(pushEnd)}
                            </div>
                            <div className="text-muted-foreground">{duration} days</div>
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>

            {/* Right resize handle */}
            {!readOnly && (
                <div
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r-lg transition-colors"
                    onPointerDown={(e) => handlePointerDown(e, 'resize-end')}
                />
            )}

            {/* Delete button - only show when selected */}
            {isSelected && !readOnly && !isDragging && (
                <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -right-2 -top-2 h-5 w-5 rounded-full shadow-md"
                    onClick={(e) => {
                        e.stopPropagation()
                        onDelete(push.tempId)
                    }}
                >
                    <Trash2 className="h-3 w-3" />
                </Button>
            )}
        </div>
    )
}
