"use client"

import { useState, useRef, useCallback, useMemo } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Plus, ChevronLeft, ChevronRight } from "lucide-react"
import { TimelineGrid } from "./TimelineGrid"
import { TimelineBar } from "./TimelineBar"
import {
    type PushDraft,
    type TimelineViewRange,
    generateTempId,
    getNextPushColor,
    addDays,
    startOfDay,
    formatDateShort
} from "./types"

type TimelineEditorProps = {
    pushes: PushDraft[]
    onPushesChange: (pushes: PushDraft[]) => void
    viewRange?: TimelineViewRange
    onViewRangeChange?: (range: TimelineViewRange) => void
    readOnly?: boolean
    minHeight?: number
}

const ROW_HEIGHT = 48
const MIN_ROWS = 3
const HEADER_HEIGHT = 48

export function TimelineEditor({
    pushes,
    onPushesChange,
    viewRange: externalViewRange,
    onViewRangeChange,
    readOnly = false,
    minHeight = 200
}: TimelineEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [selectedPushId, setSelectedPushId] = useState<string | null>(null)
    const [isCreating, setIsCreating] = useState(false)
    const [createStart, setCreateStart] = useState<{ x: number; date: Date } | null>(null)
    const [createPreview, setCreatePreview] = useState<{ start: Date; end: Date } | null>(null)

    // Default view range: 4 weeks from today
    const defaultViewRange = useMemo(() => {
        const today = startOfDay(new Date())
        return {
            start: addDays(today, -7),
            end: addDays(today, 28)
        }
    }, [])

    const viewRange = externalViewRange || defaultViewRange

    const totalDuration = viewRange.end.getTime() - viewRange.start.getTime()

    const getDateFromClientX = useCallback((clientX: number) => {
        if (!containerRef.current) return new Date()
        const rect = containerRef.current.getBoundingClientRect()
        const percent = (clientX - rect.left) / rect.width
        const timestamp = viewRange.start.getTime() + percent * totalDuration
        return startOfDay(new Date(timestamp))
    }, [viewRange, totalDuration])

    const getPositionPercent = useCallback((date: Date) => {
        return ((date.getTime() - viewRange.start.getTime()) / totalDuration) * 100
    }, [viewRange, totalDuration])

    // Handlers for creating new pushes by dragging
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (readOnly) return
        if ((e.target as HTMLElement).closest('[data-timeline-bar]')) return

        const date = getDateFromClientX(e.clientX)
        setIsCreating(true)
        setCreateStart({ x: e.clientX, date })
        setCreatePreview({ start: date, end: addDays(date, 1) })
        setSelectedPushId(null)
    }, [readOnly, getDateFromClientX])

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isCreating || !createStart) return

        const currentDate = getDateFromClientX(e.clientX)
        const start = currentDate < createStart.date ? currentDate : createStart.date
        const end = currentDate < createStart.date ? createStart.date : currentDate

        setCreatePreview({
            start,
            end: addDays(end, 1) // Make it at least 1 day
        })
    }, [isCreating, createStart, getDateFromClientX])

    const handleMouseUp = useCallback(() => {
        if (!isCreating || !createPreview) {
            setIsCreating(false)
            setCreateStart(null)
            setCreatePreview(null)
            return
        }

        // Create new push if dragged at least 1 day
        const duration = (createPreview.end.getTime() - createPreview.start.getTime()) / (1000 * 60 * 60 * 24)
        if (duration >= 1) {
            const newPush: PushDraft = {
                tempId: generateTempId(),
                name: `Push ${pushes.length + 1}`,
                startDate: createPreview.start,
                endDate: createPreview.end,
                color: getNextPushColor(pushes.length)
            }
            onPushesChange([...pushes, newPush])
            setSelectedPushId(newPush.tempId)
        }

        setIsCreating(false)
        setCreateStart(null)
        setCreatePreview(null)
    }, [isCreating, createPreview, pushes, onPushesChange])

    const handleUpdatePush = useCallback((id: string, updates: Partial<PushDraft>) => {
        onPushesChange(pushes.map(p => p.tempId === id ? { ...p, ...updates } : p))
    }, [pushes, onPushesChange])

    const handleDeletePush = useCallback((id: string) => {
        onPushesChange(pushes.filter(p => p.tempId !== id))
        if (selectedPushId === id) setSelectedPushId(null)
    }, [pushes, onPushesChange, selectedPushId])

    const handleAddPush = useCallback(() => {
        const today = startOfDay(new Date())
        const newPush: PushDraft = {
            tempId: generateTempId(),
            name: `Push ${pushes.length + 1}`,
            startDate: today,
            endDate: addDays(today, 14),
            color: getNextPushColor(pushes.length)
        }
        onPushesChange([...pushes, newPush])
        setSelectedPushId(newPush.tempId)
    }, [pushes, onPushesChange])

    // Navigation
    const handlePrevWeek = () => {
        if (onViewRangeChange) {
            onViewRangeChange({
                start: addDays(viewRange.start, -7),
                end: addDays(viewRange.end, -7)
            })
        }
    }

    const handleNextWeek = () => {
        if (onViewRangeChange) {
            onViewRangeChange({
                start: addDays(viewRange.start, 7),
                end: addDays(viewRange.end, 7)
            })
        }
    }

    const gridHeight = Math.max(pushes.length * ROW_HEIGHT, MIN_ROWS * ROW_HEIGHT)
    const totalHeight = HEADER_HEIGHT + gridHeight

    return (
        <TooltipProvider delayDuration={100}>
            <div className="flex flex-col rounded-lg border bg-card overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                            {formatDateShort(viewRange.start)} - {formatDateShort(viewRange.end)}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={handlePrevWeek}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={handleNextWeek}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        {!readOnly && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 ml-2"
                                onClick={handleAddPush}
                            >
                                <Plus className="h-3 w-3 mr-1" />
                                Add Push
                            </Button>
                        )}
                    </div>
                </div>

                {/* Timeline area */}
                <div
                    ref={containerRef}
                    className={cn(
                        "relative select-none",
                        !readOnly && "cursor-crosshair"
                    )}
                    style={{ minHeight: `${Math.max(totalHeight, minHeight)}px` }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    {/* Grid with headers */}
                    <TimelineGrid
                        startDate={viewRange.start}
                        endDate={viewRange.end}
                        height={gridHeight}
                    />

                    {/* Push bars */}
                    <div
                        className="absolute left-0 right-0"
                        style={{ top: `${HEADER_HEIGHT}px`, height: `${gridHeight}px` }}
                    >
                        {pushes.map((push, index) => (
                            <TimelineBar
                                key={push.tempId}
                                data-timeline-bar
                                push={push}
                                timelineStart={viewRange.start}
                                timelineEnd={viewRange.end}
                                onUpdate={handleUpdatePush}
                                onDelete={handleDeletePush}
                                isSelected={selectedPushId === push.tempId}
                                onSelect={setSelectedPushId}
                                rowIndex={index}
                                readOnly={readOnly}
                            />
                        ))}

                        {/* Creation preview */}
                        {isCreating && createPreview && (
                            <div
                                className="absolute h-9 rounded-lg bg-primary/40 border-2 border-dashed border-primary pointer-events-none"
                                style={{
                                    left: `${getPositionPercent(createPreview.start)}%`,
                                    width: `${getPositionPercent(createPreview.end) - getPositionPercent(createPreview.start)}%`,
                                    top: `${pushes.length * ROW_HEIGHT + 6}px`
                                }}
                            />
                        )}
                    </div>

                    {/* Empty state */}
                    {pushes.length === 0 && !isCreating && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: `${HEADER_HEIGHT}px` }}>
                            <div className="text-center text-muted-foreground">
                                <p className="text-sm font-medium">No pushes yet</p>
                                <p className="text-xs mt-1">
                                    {readOnly ? 'No pushes to display' : 'Drag on the timeline to create a push, or click "Add Push"'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </TooltipProvider>
    )
}
