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
    DialogFooter,
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
    onViewRangeChange?: (range: TimelineViewRange) => void
    readOnly?: boolean
    minHeight?: number
    showConnections?: boolean
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
    onViewRangeChange,
    readOnly = false,
    minHeight = 200,
    showConnections = true
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

    // Calculate dynamic view range based on pushes with extra space
    const calculatedViewRange = useMemo(() => {
        const today = startOfDay(new Date())

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
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))

        return {
            start: addDays(minDate, -14),
            end: addDays(maxDate, 28)
        }
    }, [pushes])

    const viewRange = externalViewRange || calculatedViewRange
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

    // Calculate row assignments - chained pushes go on the same row
    const rowAssignments = useMemo(() => {
        const assignments: Record<string, number> = {}

        const chains: string[][] = []
        const processed = new Set<string>()

        const rootPushes = pushes.filter(p => !p.dependsOn)

        for (const root of rootPushes) {
            const chain: string[] = [root.tempId]
            processed.add(root.tempId)

            let current = root
            while (true) {
                const next = pushes.find(p => p.dependsOn === current.tempId && !processed.has(p.tempId))
                if (!next) break
                chain.push(next.tempId)
                processed.add(next.tempId)
                current = next
            }

            chains.push(chain)
        }

        for (const push of pushes) {
            if (!processed.has(push.tempId)) {
                chains.push([push.tempId])
            }
        }

        chains.forEach((chain, rowIndex) => {
            chain.forEach(pushId => {
                assignments[pushId] = rowIndex
            })
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
            const pushEnd = push.endDate || addDays(push.startDate, 14)

            // Check if touching previous (this push starts exactly when its dependency ends)
            let isTouchingPrevious = false
            if (push.dependsOn) {
                const prevPush = pushes.find(p => p.tempId === push.dependsOn)
                if (prevPush) {
                    const prevEnd = prevPush.endDate || addDays(prevPush.startDate, 14)
                    // Same day = touching
                    isTouchingPrevious = Math.abs(prevEnd.getTime() - push.startDate.getTime()) < 1000 * 60 * 60 * 24
                }
            }

            // Check if touching next (a dependent push starts exactly when this ends)
            let isTouchingNext = false
            const nextPush = pushes.find(p => p.dependsOn === push.tempId)
            if (nextPush) {
                isTouchingNext = Math.abs(pushEnd.getTime() - nextPush.startDate.getTime()) < 1000 * 60 * 60 * 24
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
        if (!isCreating || !createStart) return

        const distanceDragged = Math.abs(e.clientX - createStart.x)

        if (distanceDragged >= MIN_DRAG_DISTANCE) {
            setHasDragged(true)
            const currentDate = getDateFromClientX(e.clientX)
            const start = currentDate < createStart.date ? currentDate : createStart.date
            const end = currentDate < createStart.date ? createStart.date : currentDate

            setCreatePreview({
                start,
                end: addDays(end, 1)
            })
        }
    }, [isCreating, createStart, getDateFromClientX])

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
            color: sourcePush.color,
            dependsOn: afterPushId
        }

        setPendingPush(newPush)
        setNewPushName("") // No autofill
        setNewPushEndDate(formatDateISO(defaultEnd))
        // Store preview for chained push
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

    // Handle edit save
    const handleEditSave = useCallback(() => {
        if (!editingPush) return

        const updates: Partial<PushDraft> = {
            name: editName.trim() || editingPush.name
        }

        if (editStartDate) {
            updates.startDate = new Date(editStartDate)
        }
        if (editEndDate) {
            updates.endDate = new Date(editEndDate)
        }

        onPushesChange(pushes.map(p =>
            p.tempId === editingPush.tempId ? { ...p, ...updates } : p
        ))
        setEditingPush(null)
    }, [editingPush, editName, editStartDate, editEndDate, pushes, onPushesChange])

    const handleUpdatePush = useCallback((id: string, updates: Partial<PushDraft>) => {
        onPushesChange(pushes.map(p => p.tempId === id ? { ...p, ...updates } : p))
    }, [pushes, onPushesChange])

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
                        {pushes.length} push{pushes.length !== 1 ? 'es' : ''}
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
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    <TimelineGrid
                        startDate={viewRange.start}
                        endDate={viewRange.end}
                        height={gridHeight}
                    />

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
                            />
                        ))}
                    </div>

                    {pushes.length === 0 && !isCreating && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: `${HEADER_HEIGHT}px` }}>
                            <p className="text-sm text-muted-foreground">
                                {readOnly ? 'No pushes' : 'Drag to create a push'}
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
                        <DialogTitle>Edit Push</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-name">Name</Label>
                            <Input
                                id="edit-name"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
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
                                    onChange={(e) => setEditStartDate(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-end">End</Label>
                                <Input
                                    id="edit-end"
                                    type="date"
                                    value={editEndDate}
                                    onChange={(e) => setEditEndDate(e.target.value)}
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
                    <DialogFooter className="flex-row justify-between sm:justify-between">
                        <Button
                            variant="outline"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => editingPush && handleDeletePush(editingPush.tempId)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setEditingPush(null)}>Cancel</Button>
                            <Button onClick={handleEditSave}>Save</Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </TooltipProvider>
    )
}
