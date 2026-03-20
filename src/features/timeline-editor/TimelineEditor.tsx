"use client"

import { useState, useRef, useCallback, useMemo } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"
import { Calendar, Trash2 } from "lucide-react"
import { TimelineGrid } from "./TimelineGrid"
import { TimelineBar } from "./TimelineBar"
import {
    type PushDraft,
    type TimelineViewRange,
    generateTempId,
    getNextPushColor,
    addDays,
    startOfDay,
    formatDateShort,
    formatDateISO,
    differenceInDays
} from "./types"

type TimelineEditorProps = {
    pushes: PushDraft[]
    onPushesChange: (pushes: PushDraft[]) => void
    viewRange?: TimelineViewRange
    readOnly?: boolean
    minHeight?: number
    minInteractiveDate?: Date | null
}

const ROW_HEIGHT = 48
const MIN_ROWS = 3
const HEADER_HEIGHT = 48
const MIN_DRAG_DISTANCE = 20
const DEFAULT_CHAINED_DURATION = 14

export function TimelineEditor({
    pushes,
    onPushesChange,
    viewRange: externalViewRange,
    readOnly = false,
    minHeight = 200,
    minInteractiveDate = null,
}: TimelineEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [selectedPushId, setSelectedPushId] = useState<string | null>(null)
    const [isCreating, setIsCreating] = useState(false)
    const [createStart, setCreateStart] = useState<{ x: number; date: Date } | null>(null)
    const [createPreview, setCreatePreview] = useState<{ start: Date; end: Date } | null>(null)
    const [hasDragged, setHasDragged] = useState(false)

    // Name prompt dialog state
    const [namePromptOpen, setNamePromptOpen] = useState(false)
    const [pendingPush, setPendingPush] = useState<PushDraft | null>(null)
    const [newPushName, setNewPushName] = useState("")
    const [newPushEndDate, setNewPushEndDate] = useState("")
    // Preview state for showing dotted box during dialog
    const [pendingPreview, setPendingPreview] = useState<{ start: Date; end: Date; row: number } | null>(null)

    // Edit popup state
    const [editingPush, setEditingPush] = useState<PushDraft | null>(null)
    const [editName, setEditName] = useState("")
    const [editStartDate, setEditStartDate] = useState("")
    const [editEndDate, setEditEndDate] = useState("")

    // Hover date indicator state
    const [hoverInfo, setHoverInfo] = useState<{ x: number; date: Date } | null>(null)

    // Bar drag indicator state (shows date tag next to bar when dragging)
    const [barDragInfo, setBarDragInfo] = useState<{ date: Date; row: number; isEnd?: boolean } | null>(null)
    const today = useMemo(() => startOfDay(new Date()), [])
    const minTimelineDate = useMemo(
        () => minInteractiveDate ? startOfDay(minInteractiveDate) : null,
        [minInteractiveDate]
    )

    // Calculate dynamic view range based on pushes with extra space
    const calculatedViewRange = useMemo(() => {
        if (pushes.length === 0) {
            return {
                start: addDays(today, -7),
                end: addDays(today, 42)
            }
        }

        const dates = pushes.flatMap(p => {
            const start = p.startDate
            const end = p.endDate || addDays(start, 14)
            return [start, end]
        })

        const minDate = new Date(Math.min(...dates.map(d => d.getTime()), today.getTime()))
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime()), today.getTime()))

        return {
            start: addDays(minDate, -14),
            end: addDays(maxDate, 28)
        }
    }, [pushes])

    const viewRange = externalViewRange || calculatedViewRange
    const totalDuration = viewRange.end.getTime() - viewRange.start.getTime()

    const clampInteractiveDate = useCallback((date: Date) => {
        if (minTimelineDate && date < minTimelineDate) {
            return minTimelineDate
        }

        return startOfDay(date)
    }, [minTimelineDate])

    const getDateFromClientX = useCallback((clientX: number) => {
        if (!containerRef.current) return new Date()
        const rect = containerRef.current.getBoundingClientRect()
        const percent = (clientX - rect.left) / rect.width
        const timestamp = viewRange.start.getTime() + percent * totalDuration
        return clampInteractiveDate(new Date(timestamp))
    }, [viewRange, totalDuration, clampInteractiveDate])

    const getPositionPercent = useCallback((date: Date) => {
        return ((date.getTime() - viewRange.start.getTime()) / totalDuration) * 100
    }, [viewRange, totalDuration])

    const formatIndicatorLabel = useCallback((date: Date) => {
        const normalizedDate = startOfDay(date)
        if (normalizedDate.getTime() === today.getTime()) {
            return "Today"
        }

        return normalizedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }, [today])

    // Calculate row assignments - chained pushes go on the same row
    const rowAssignments = useMemo(() => {
        const assignments: Record<string, number> = {}
        const processed = new Set<string>()
        const chains: { ids: string[]; start: number; end: number }[] = []

        const pushMap = new Map(pushes.map(p => [p.tempId, p]))

        // 1. Identify Chains
        const rootPushes = pushes
            .filter(p => !p.dependsOn || !pushMap.has(p.dependsOn))
            .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

        for (const root of rootPushes) {
            if (processed.has(root.tempId)) continue

            const chainIds: string[] = [root.tempId]
            processed.add(root.tempId)

            const chainStart = root.startDate.getTime()
            let chainEnd = (root.endDate || addDays(root.startDate, 14)).getTime()

            let current = root
            while (true) {
                // Find next in chain: must depend on current AND not be processed
                const next = pushes.find(p => p.dependsOn === current.tempId && !processed.has(p.tempId))
                if (!next) break

                chainIds.push(next.tempId)
                processed.add(next.tempId)
                const nextEnd = (next.endDate || addDays(next.startDate, 14)).getTime()
                chainEnd = Math.max(chainEnd, nextEnd)
                current = next
            }

            chains.push({ ids: chainIds, start: chainStart, end: chainEnd })
        }

        // Catch any remaining pushes that might have circular dependencies or were missed
        for (const push of pushes) {
            if (!processed.has(push.tempId)) {
                const start = push.startDate.getTime()
                const end = (push.endDate || addDays(push.startDate, 14)).getTime()
                chains.push({ ids: [push.tempId], start, end })
                processed.add(push.tempId)
            }
        }

        // 2. Pack Chains into Rows
        // Sort chains by start date to pack effectively
        chains.sort((a, b) => a.start - b.start)

        const rowEnds: number[] = [] // Keeps track of the end time of the last push in each row

        chains.forEach(chain => {
            // Find the first row where this chain fits (starts after the row's last push ends)
            const assignedRow = rowEnds.findIndex(rowEnd => chain.start >= rowEnd)

            if (assignedRow === -1) {
                // No room in existing rows, create a new one
                const newRowIndex = rowEnds.length
                rowEnds.push(chain.end)
                chain.ids.forEach(id => { assignments[id] = newRowIndex })
            } else {
                // Update the end time for this row
                rowEnds[assignedRow] = chain.end
                chain.ids.forEach(id => { assignments[id] = assignedRow })
            }
        })

        return assignments
    }, [pushes])

    const numRows = useMemo(() => {
        const rows = new Set(Object.values(rowAssignments))
        return Math.max(rows.size, 0)
    }, [rowAssignments])

    // Check if push has a chained push after it and calculate touch info
    const pushInfo = useMemo(() => {
        const info: Record<string, {
            isChainedWithNext: boolean
            isTouchingPrevious: boolean
            isTouchingNext: boolean
        }> = {}

        for (const push of pushes) {
            const hasNext = pushes.some(p => p.dependsOn === push.tempId)
            const pushEnd = (push.endDate || addDays(push.startDate, 14)).getTime()

            // Check if touching previous (this push starts exactly when its dependency ends)
            let isTouchingPrevious = false
            if (push.dependsOn) {
                const prevPush = pushes.find(p => p.tempId === push.dependsOn)
                if (prevPush) {
                    const prevEnd = (prevPush.endDate || addDays(prevPush.startDate, 14)).getTime()
                    // Same day = touching (1ms buffer)
                    isTouchingPrevious = Math.abs(prevEnd - push.startDate.getTime()) < 1000 * 60 * 60
                }
            }

            // Check if touching next (a dependent push starts exactly when this ends)
            let isTouchingNext = false
            const nextPush = pushes.find(p => p.dependsOn === push.tempId)
            if (nextPush) {
                const nextStart = nextPush.startDate.getTime()
                isTouchingNext = Math.abs(pushEnd - nextStart) < 1000 * 60 * 60
            }

            info[push.tempId] = { isChainedWithNext: hasNext, isTouchingPrevious, isTouchingNext }
        }

        return info
    }, [pushes])
    // Handlers for creating new pushes by dragging
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (readOnly) return
        if ((e.target as HTMLElement).closest('[data-timeline-bar]')) return
        if ((e.target as HTMLElement).closest('button')) return

        const date = getDateFromClientX(e.clientX)
        setIsCreating(true)
        setCreateStart({ x: e.clientX, date })
        setCreatePreview(null)
        setHasDragged(false)
        setSelectedPushId(null)
    }, [readOnly, getDateFromClientX])

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        // Always update hover info for date indicator
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            const date = getDateFromClientX(e.clientX)
            const clampedPercent = Math.max(0, Math.min(getPositionPercent(date), 100))
            setHoverInfo({ x: (clampedPercent / 100) * rect.width, date })
        }

        if (!isCreating || !createStart) return

        const distanceDragged = Math.abs(e.clientX - createStart.x)

        if (distanceDragged >= MIN_DRAG_DISTANCE) {
            setHasDragged(true)
            const currentDate = getDateFromClientX(e.clientX)
            const start = currentDate < createStart.date ? currentDate : createStart.date
            const end = addDays(currentDate < createStart.date ? createStart.date : currentDate, 1)

            // Collision check for creation preview
            const isOverlapping = pushes.some(other => {
                const otherRow = rowAssignments[other.tempId]
                if (otherRow !== numRows) return false // Previews are on a new row
                const otherEnd = other.endDate || addDays(other.startDate, 14)
                return start < otherEnd && end > other.startDate
            })

            if (!isOverlapping) {
                setCreatePreview({ start, end })
            }
        }
    }, [isCreating, createStart, getDateFromClientX, getPositionPercent, pushes, rowAssignments, numRows])

    const handleMouseLeave = useCallback(() => {
        setHoverInfo(null)
    }, [])

    const handleMouseUp = useCallback(() => {
        if (!isCreating) return

        if (hasDragged && createPreview) {
            const duration = differenceInDays(createPreview.end, createPreview.start)
            if (duration >= 1) {
                const newPush: PushDraft = {
                    tempId: generateTempId(),
                    name: "",
                    startDate: createPreview.start,
                    endDate: createPreview.end,
                    color: getNextPushColor(pushes.length)
                }
                setPendingPush(newPush)
                setNewPushName("") // No autofill
                setNewPushEndDate(formatDateISO(createPreview.end))
                // Store preview for display during dialog
                setPendingPreview({ start: createPreview.start, end: createPreview.end, row: numRows })
                setNamePromptOpen(true)
            }
        }

        setIsCreating(false)
        setCreateStart(null)
        setCreatePreview(null)
        setHasDragged(false)
    }, [isCreating, hasDragged, createPreview, pushes.length, numRows])

    // Handle adding a chained push after an existing one
    const handleAddChained = useCallback((afterPushId: string, endDate?: Date) => {
        const sourcePush = pushes.find(p => p.tempId === afterPushId)
        if (!sourcePush) return

        const sourceEnd = sourcePush.endDate || addDays(sourcePush.startDate, 14)
        const defaultEnd = endDate || addDays(sourceEnd, DEFAULT_CHAINED_DURATION)
        const row = rowAssignments[afterPushId] ?? 0

        const newPush: PushDraft = {
            tempId: generateTempId(),
            name: "",
            startDate: sourceEnd,
            endDate: defaultEnd,
            color: sourcePush.color, // Inherit color
            dependsOn: afterPushId
        }

        setPendingPush(newPush)
        setNewPushName("")
        setNewPushEndDate(formatDateISO(defaultEnd))
        setPendingPreview({ start: sourceEnd, end: defaultEnd, row })
        setNamePromptOpen(true)
    }, [pushes, rowAssignments])

    // Handle name prompt submission
    const handleNameSubmit = useCallback(() => {
        if (pendingPush && newPushName.trim()) {
            const pushWithName: PushDraft = {
                ...pendingPush,
                name: newPushName.trim(),
                endDate: newPushEndDate ? new Date(newPushEndDate) : pendingPush.endDate
            }
            onPushesChange([...pushes, pushWithName])
            setSelectedPushId(pushWithName.tempId)
        }
        setNamePromptOpen(false)
        setPendingPush(null)
        setNewPushName("")
        setNewPushEndDate("")
        setPendingPreview(null) // Clear preview when done
    }, [pendingPush, newPushName, newPushEndDate, pushes, onPushesChange])

    // Handle dialog close without submission
    const handleDialogClose = useCallback(() => {
        setNamePromptOpen(false)
        setPendingPush(null)
        setNewPushName("")
        setNewPushEndDate("")
        setPendingPreview(null) // Clear preview on cancel
    }, [])

    // Handle push click to open edit popup
    const handlePushClick = useCallback((push: PushDraft) => {
        setEditingPush(push)
        setEditName(push.name)
        setEditStartDate(formatDateISO(push.startDate))
        setEditEndDate(push.endDate ? formatDateISO(push.endDate) : "")
    }, [])

    const handleUpdatePush = useCallback((id: string, updates: Partial<PushDraft>) => {
        onPushesChange(pushes.map(p => p.tempId === id ? { ...p, ...updates } : p))
    }, [pushes, onPushesChange])

    const syncEditingPush = useCallback((updates: Partial<PushDraft>) => {
        if (!editingPush) return

        const nextPush = { ...editingPush, ...updates }
        setEditingPush(nextPush)
        handleUpdatePush(editingPush.tempId, updates)
    }, [editingPush, handleUpdatePush])

    const handleDeletePush = useCallback((id: string) => {
        onPushesChange(pushes.filter(p => p.tempId !== id).map(p =>
            p.dependsOn === id ? { ...p, dependsOn: null } : p
        ))
        if (selectedPushId === id) setSelectedPushId(null)
        setEditingPush(null)
    }, [pushes, onPushesChange, selectedPushId])

    const handleRemoveDependency = useCallback(() => {
        if (!editingPush) return
        onPushesChange(pushes.map(p =>
            p.tempId === editingPush.tempId ? { ...p, dependsOn: null } : p
        ))
        setEditingPush({ ...editingPush, dependsOn: null })
    }, [editingPush, pushes, onPushesChange])

    const gridHeight = Math.max((numRows + 1) * ROW_HEIGHT, MIN_ROWS * ROW_HEIGHT)
    const totalHeight = HEADER_HEIGHT + gridHeight

    const getDependencyName = useCallback((dependsOnId: string | undefined | null) => {
        if (!dependsOnId) return null
        const dep = pushes.find(p => p.tempId === dependsOnId)
        return dep?.name || 'Unknown'
    }, [pushes])

    return (
        <TooltipProvider delayDuration={100}>
            <div className="flex flex-col rounded-lg border bg-card overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">
                            {formatDateShort(viewRange.start)} − {formatDateShort(viewRange.end)}
                        </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                        {pushes.length} project{pushes.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {/* Timeline area */}
                <div
                    ref={containerRef}
                    className={cn(
                        "relative select-none",
                        !readOnly && "cursor-crosshair"
                    )}
                    style={{ minHeight: `${Math.max(totalHeight, minHeight)}px` }}
                    onPointerDown={handleMouseDown}
                    onPointerMove={handleMouseMove}
                    onPointerUp={handleMouseUp}
                    onPointerCancel={handleMouseUp}
                    onLostPointerCapture={handleMouseUp}
                    onMouseLeave={handleMouseLeave}
                >
                    <TimelineGrid
                        startDate={viewRange.start}
                        endDate={viewRange.end}
                        height={gridHeight}
                    />

                    {/* Hover date indicator (only when not dragging a bar) */}
                    {hoverInfo && !isCreating && !barDragInfo && (
                        <div
                            className="absolute pointer-events-none z-20"
                            style={{
                                left: `${hoverInfo.x}px`,
                                top: `${HEADER_HEIGHT}px`,
                                bottom: 0
                            }}
                        >
                            {/* Vertical line - extends to bottom of container */}
                            <div
                                className="absolute w-px bg-primary/50"
                                style={{
                                    left: 0,
                                    top: 0,
                                    bottom: 0
                                }}
                            />
                            {/* Date label - positioned at top of line */}
                            <div
                                className="absolute -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary text-primary-foreground whitespace-nowrap"
                                style={{
                                    left: 0,
                                    top: '-18px'
                                }}
                            >
                                {formatIndicatorLabel(hoverInfo.date)}
                            </div>
                        </div>
                    )}

                    <div
                        className="absolute left-0 right-0"
                        style={{ top: `${HEADER_HEIGHT}px`, height: `${gridHeight}px` }}
                    >
                        {/* Active drag preview (Render before map for correct layering) */}
                        {isCreating && hasDragged && createPreview && (
                            <div
                                className="absolute h-9 rounded-lg bg-primary/40 border-2 border-dashed border-primary pointer-events-none z-0"
                                style={{
                                    left: `${getPositionPercent(createPreview.start)}%`,
                                    width: `${Math.max(getPositionPercent(createPreview.end) - getPositionPercent(createPreview.start), 2)}%`,
                                    top: `${numRows * ROW_HEIGHT + 6}px`
                                }}
                            />
                        )}

                        {/* Pending preview during dialog (Render before map for correct layering) */}
                        {pendingPreview && namePromptOpen && (
                            <div
                                className="absolute h-9 rounded-lg bg-primary/40 border-2 border-dashed border-primary pointer-events-none z-0"
                                style={{
                                    left: `${getPositionPercent(pendingPreview.start)}%`,
                                    width: `${Math.max(getPositionPercent(pendingPreview.end) - getPositionPercent(pendingPreview.start), 2)}%`,
                                    top: `${pendingPreview.row * ROW_HEIGHT + 6}px`
                                }}
                            />
                        )}

                        {pushes.map((push) => (
                            <TimelineBar
                                key={push.tempId}
                                push={push}
                                timelineStart={viewRange.start}
                                timelineEnd={viewRange.end}
                                onUpdate={handleUpdatePush}
                                onDelete={handleDeletePush}
                                isSelected={selectedPushId === push.tempId}
                                onSelect={setSelectedPushId}
                                onClick={() => handlePushClick(push)}
                                rowIndex={rowAssignments[push.tempId] ?? 0}
                                readOnly={readOnly}
                                isDependent={!!push.dependsOn}
                                dependencyCompleted={false}
                                onAddChained={handleAddChained}
                                isChainedWithNext={pushInfo[push.tempId]?.isChainedWithNext || false}
                                isTouchingPrevious={pushInfo[push.tempId]?.isTouchingPrevious || false}
                                isTouchingNext={pushInfo[push.tempId]?.isTouchingNext || false}
                                getDateFromX={getDateFromClientX}
                                onDragChange={setBarDragInfo}
                                otherPushesOnSameRow={pushes.filter(p =>
                                    p.tempId !== push.tempId &&
                                    rowAssignments[p.tempId] === rowAssignments[push.tempId]
                                )}
                            />
                        ))}

                        {/* Date tag shown next to bar when dragging */}
                        {barDragInfo && (
                            <div
                                className="absolute pointer-events-none z-50"
                                style={{
                                    left: `${getPositionPercent(barDragInfo.date)}%`,
                                    top: `${barDragInfo.row * ROW_HEIGHT + 6}px`,
                                    transform: barDragInfo.isEnd ? 'translateX(4px)' : 'translateX(-100%) translateX(-4px)'
                                }}
                            >
                                <div className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary text-primary-foreground whitespace-nowrap shadow-md">
                                    {formatIndicatorLabel(barDragInfo.date)}
                                </div>
                            </div>
                        )}
                    </div>

                    {pushes.length === 0 && !isCreating && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: `${HEADER_HEIGHT}px` }}>
                            <p className="text-sm text-muted-foreground">
                                {readOnly ? 'No projects' : 'Drag to create a project'}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Name prompt dialog */}
            <Dialog open={namePromptOpen} onOpenChange={(open) => {
                if (!open) handleDialogClose()
            }}>
                <DialogContent showCloseButton={false} className="sm:max-w-[320px] p-5">
                    <DialogTitle className="sr-only">Name this push</DialogTitle>
                    <DialogDescription className="sr-only">Enter a name for the new push you just created.</DialogDescription>
                    <div className="space-y-3">
                        <Input
                            id="new-push-name"
                            value={newPushName}
                            onChange={(e) => setNewPushName(e.target.value)}
                            placeholder="Push name..."
                            autoFocus
                            className="h-9"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && newPushName.trim()) handleNameSubmit()
                            }}
                        />

                        <div className="flex items-center justify-between gap-4">
                            {pendingPush?.dependsOn ? (
                                <div className="flex items-center gap-2 flex-1">
                                    <Input
                                        id="new-push-end"
                                        type="date"
                                        value={newPushEndDate}
                                        onChange={(e) => setNewPushEndDate(e.target.value)}
                                        className="h-8 text-xs py-1"
                                    />
                                </div>
                            ) : (
                                <div className="text-[10px] text-muted-foreground truncate">
                                    {pendingPush && formatDateShort(pendingPush.startDate)} − {pendingPush && formatDateShort(pendingPush.endDate || addDays(pendingPush.startDate, 14))}
                                </div>
                            )}

                            <div className="flex gap-2 shrink-0">
                                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setNamePromptOpen(false)}>Cancel</Button>
                                <Button size="sm" className="h-8 px-3 text-xs" onClick={handleNameSubmit} disabled={!newPushName.trim()}>Create</Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit push dialog */}
            <Dialog open={!!editingPush} onOpenChange={(open) => !open && setEditingPush(null)}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <div className="flex items-center justify-between gap-3">
                            <DialogTitle>Edit Project</DialogTitle>
                            <Button size="sm" onClick={() => setEditingPush(null)}>Done</Button>
                        </div>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-name">Name</Label>
                            <Input
                                id="edit-name"
                                value={editName}
                                onChange={(e) => {
                                    const value = e.target.value
                                    setEditName(value)
                                    if (value.trim()) {
                                        syncEditingPush({ name: value })
                                    }
                                }}
                                placeholder="Push name"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-start">Start</Label>
                                <Input
                                    id="edit-start"
                                    type="date"
                                    value={editStartDate}
                                    onChange={(e) => {
                                        const value = e.target.value
                                        setEditStartDate(value)
                                        if (!value || !editingPush) return

                                        const nextStart = new Date(value)
                                        if (Number.isNaN(nextStart.getTime())) return

                                        const nextUpdates: Partial<PushDraft> = { startDate: nextStart }
                                        const currentEnd = editingPush.endDate

                                        if (currentEnd && nextStart > currentEnd) {
                                            nextUpdates.endDate = nextStart
                                            setEditEndDate(formatDateISO(nextStart))
                                        }

                                        syncEditingPush(nextUpdates)
                                    }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-end">End</Label>
                                <Input
                                    id="edit-end"
                                    type="date"
                                    value={editEndDate}
                                    onChange={(e) => {
                                        const value = e.target.value
                                        setEditEndDate(value)
                                        if (!editingPush) return

                                        if (!value) {
                                            syncEditingPush({ endDate: null })
                                            return
                                        }

                                        let nextEnd = new Date(value)
                                        if (Number.isNaN(nextEnd.getTime())) return

                                        if (nextEnd < editingPush.startDate) {
                                            nextEnd = editingPush.startDate
                                            setEditEndDate(formatDateISO(nextEnd))
                                        }

                                        syncEditingPush({ endDate: nextEnd })
                                    }}
                                />
                            </div>
                        </div>

                        {editingPush?.dependsOn && (
                            <div className="pt-2 border-t">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">
                                        Follows: <span className="font-medium text-foreground">{getDependencyName(editingPush.dependsOn)}</span>
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-xs text-destructive hover:text-destructive"
                                        onClick={handleRemoveDependency}
                                    >
                                        Unlink
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-start border-t pt-4">
                        <Button
                            variant="outline"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => editingPush && handleDeletePush(editingPush.tempId)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </TooltipProvider>
    )
}
