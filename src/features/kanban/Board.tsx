"use client"

import {
    DndContext,
    DragOverlay,
    useSensors,
    useSensor,
    PointerSensor,
    DragEndEvent,
    DragStartEvent,
    DragOverEvent,
} from "@dnd-kit/core"
import { arrayMove } from "@dnd-kit/sortable"
import { useState, useEffect, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import { Plus, ChevronDown, CheckCircle2, Trash2, Pencil } from "lucide-react"
import { useRouter } from "next/navigation"

import { PushDialog } from "@/features/pushes/PushDialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import { updateTaskStatus } from "@/app/actions/kanban"
import { deletePush, assignTaskToPush } from "@/app/actions/pushes"
import { Column } from "./Column"
import { TaskCard } from "./TaskCard"
import { TaskDialog } from "./TaskDialog"
import { TaskPreview } from "./TaskPreview"
import { useConfetti } from "./Confetti"

type Task = {
    id: string
    title: string
    columnId: string | null
    difficulty?: string | null
    startDate?: Date | string | null
    endDate?: Date | string | null
    updatedAt?: Date | string | null
    requireAttachment?: boolean
    assignee?: { id?: string; name: string } | null
    assignees?: { user: { id: string; name: string } }[]
    activityLogs?: { changedByName: string; createdAt: Date | string }[]
    comments?: { createdAt: Date | string }[]
    attachments?: { id: string; createdAt: Date | string }[]
    push?: { id: string; name: string; color: string; status: string } | null
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
}

type ColumnData = {
    id: string
    name: string
    order: number
    tasks: Task[]
}

type BoardProps = {
    board: {
        id: string
        columns: ColumnData[]
    }
    projectId: string
    users: { id: string; name: string; isProjectMember?: boolean }[]
    pushes?: PushType[]
    highlightTaskId?: string | null
}

export function Board({ board, projectId, users, pushes = [], highlightTaskId }: BoardProps) {
    const router = useRouter()
    const [columns, setColumns] = useState<ColumnData[]>(board.columns)
    const [activeTask, setActiveTask] = useState<Task | null>(null)
    const [userRole, setUserRole] = useState<string>('Member')
    const [userId, setUserId] = useState<string | null>(null)
    const [mounted, setMounted] = useState(false)
    const [creatingColumnId, setCreatingColumnId] = useState<string | null>(null)
    const [creatingPushId, setCreatingPushId] = useState<string | null>(null)
    const [previewingTask, setPreviewingTask] = useState<Task | null>(null)
    const [editingTask, setEditingTask] = useState<Task | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [isPersisting, setIsPersisting] = useState(false)
    const [flashingColumnId, setFlashingColumnId] = useState<string | null>(null)
    const [collapsedPushes, setCollapsedPushes] = useState<Set<string>>(() =>
        new Set(pushes.filter(p => p.status === 'Completed').map(p => p.id))
    )
    const { toast } = useToast()

    // Dialog States
    const [reviewDialog, setReviewDialog] = useState<{
        taskId: string
        toColumnId: string
        fromColumnId: string
        isResubmit: boolean
        pushId: string | null
        dropPosition?: { x: number, y: number }
    } | null>(null)

    const [attachmentWarningDialog, setAttachmentWarningDialog] = useState<{
        taskTitle: string
    } | null>(null)

    const [doneMoveDialog, setDoneMoveDialog] = useState<{
        taskId: string
        toColumnId: string
        fromColumnId: string
        toColumnName: string
        pushId: string | null
    } | null>(null)

    const [deletePushId, setDeletePushId] = useState<string | null>(null)
    const [editingPush, setEditingPush] = useState<PushType | null>(null)

    const isAdmin = userRole === 'Admin' || userRole === 'Team Lead'
    const { triggerConfetti } = useConfetti()

    const fetchUserRole = useCallback(async () => {
        try {
            const res = await fetch('/api/auth/role')
            const data = await res.json()
            setUserRole(data.role || 'Member')
            setUserId(data.id || null)
        } catch {
            setUserRole('Member')
            setUserId(null)
        }
    }, [])

    useEffect(() => {
        setMounted(true)
        fetchUserRole()
        fetch('/api/tasks/check-overdue', { method: 'POST' }).catch(err =>
            console.error('Failed to check overdue tasks:', err)
        )
    }, [fetchUserRole])

    const processedHighlightRef = useRef<string | null>(null)

    // Scroll to highlighted task
    useEffect(() => {
        if (!highlightTaskId || !mounted) return
        // Prevent repeated scrolling on re-renders (e.g. drag and drop)
        if (processedHighlightRef.current === highlightTaskId) return

        const task = columns.flatMap(c => c.tasks).find(t => t.id === highlightTaskId)
        if (!task) return

        // If task is in a push, check if it's collapsed
        // (For Kanban board, tasks have a push property)
        // If task has no push (Backlog), pushId might be undefined/null effectively
        const pushId = task.push?.id || ((task as any).pushId as string) || 'backlog'

        // 1. Ensure push is expanded
        let didExpand = false
        setCollapsedPushes(prev => {
            if (pushId && prev.has(pushId)) {
                const next = new Set(prev)
                next.delete(pushId)
                didExpand = true
                return next
            }
            return prev
        })

        // 2. Scroll into view
        // If we expanded, wait for animation. If not, scroll immediately (or short delay for safety)
        setTimeout(() => {
            const el = document.getElementById(`task-card-${highlightTaskId}`)
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                processedHighlightRef.current = highlightTaskId
            }
        }, didExpand ? 300 : 100)

    }, [highlightTaskId, mounted, columns])

    useEffect(() => {
        const handleFocus = () => fetchUserRole()
        window.addEventListener('focus', handleFocus)
        return () => window.removeEventListener('focus', handleFocus)
    }, [fetchUserRole])

    // Sync from props when board data actually changes (from router.refresh)
    // This happens AFTER server operations complete
    useEffect(() => {
        setColumns(board.columns)
    }, [board.columns])

    // Auto-refresh board data
    useEffect(() => {
        const interval = setInterval(() => {
            // Only refresh if user is not currently interacting with critical UI elements
            if (!isDragging && !reviewDialog && !doneMoveDialog && !editingTask && !previewingTask && !creatingColumnId && !editingPush && !deletePushId) {
                router.refresh()
            }
        }, 5000)

        return () => clearInterval(interval)
    }, [isDragging, reviewDialog, doneMoveDialog, editingTask, previewingTask, creatingColumnId, editingPush, deletePushId, router])

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    )

    // Helpers
    const findTaskColumn = (taskId: string) => columns.find(col => col.tasks.some(t => t.id === taskId))
    const canDragFrom = (colName: string) => isAdmin || (colName !== 'Review' && colName !== 'Done')
    const canDragTo = (colName: string) => isAdmin || colName !== 'Done'

    const saveToServer = async (taskId: string, columnId: string, originalColumnId?: string) => {
        try {
            const result = await updateTaskStatus(taskId, columnId, projectId)

            if (result.error === 'ATTACHMENT_REQUIRED') {
                const task = columns.flatMap(c => c.tasks).find(t => t.id === taskId)
                const taskTitle = task?.title || 'This task'
                setAttachmentWarningDialog({ taskTitle })

                if (columnId && task) {
                    const pushId = task.push?.id || 'backlog'
                    setFlashingColumnId(`${pushId}::${columnId}`)
                    setTimeout(() => setFlashingColumnId(null), 1000)
                }

                if (originalColumnId) setColumns(board.columns)
                return false
            } else if (result.error) {
                toast({ title: "Error", description: result.error, variant: "destructive" })
                if (originalColumnId) setColumns(board.columns)
                return false
            }
            return true
        } catch (e) {
            console.error('Save failed:', e)
            return false
        }
    }

    // ========================================================================
    // NEW DRAG AND DROP IMPLEMENTATION - NO OPTIMISTIC UPDATES
    // ========================================================================

    const onDragStart = (event: DragStartEvent) => {
        if (event.active.data.current?.type === "Task") {
            const task = event.active.data.current.task
            const col = findTaskColumn(task.id)
            if (col && canDragFrom(col.name)) {
                setIsDragging(true)
                setActiveTask(task)
            }
        }
    }

    const onDragOver = (event: DragOverEvent) => {
        // Intentionally empty - no visual updates during drag
        // This prevents the flash bug caused by state updates
    }

    const onDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event
        const rect = active?.rect?.current?.translated
        const dropCenter = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined

        if (!over || !activeTask) {
            setIsDragging(false)
            setActiveTask(null)
            return
        }

        const activeId = active.id as string
        const overId = over.id as string

        // Parse destination
        const isOverColumn = over.data.current?.type === "Column"
        const isOverTask = over.data.current?.type === "Task"

        let targetColumnId: string | null = null
        let targetPushId: string | null = null

        if (isOverColumn && overId.includes('::')) {
            const [pushPart, colPart] = overId.split('::')
            targetPushId = pushPart === 'backlog' ? null : pushPart
            targetColumnId = colPart
        } else if (isOverTask) {
            const overColumn = columns.find(col => col.tasks.some(t => t.id === overId))
            if (overColumn) {
                targetColumnId = overColumn.id
                const overTask = overColumn.tasks.find(t => t.id === overId)
                targetPushId = overTask?.push?.id || null
            }
        }

        if (!targetColumnId) {
            setIsDragging(false)
            setActiveTask(null)
            return
        }

        const targetColumn = columns.find(c => c.id === targetColumnId)
        const sourceColumn = findTaskColumn(activeId)

        if (!targetColumn || !sourceColumn) {
            setIsDragging(false)
            setActiveTask(null)
            return
        }

        // Permission check
        if (!isAdmin && (!canDragFrom(sourceColumn.name) || !canDragTo(targetColumn.name))) {
            setIsDragging(false)
            setActiveTask(null)
            return
        }

        // Check if anything changed
        const originalColumnId = activeTask.columnId
        const originalPushId = activeTask.push?.id || null
        const columnChanged = originalColumnId !== targetColumnId
        const pushChanged = originalPushId !== targetPushId

        if (!columnChanged && !pushChanged) {
            setIsDragging(false)
            setActiveTask(null)
            return
        }

        const startColName = sourceColumn.name
        const endColName = targetColumn.name

        // Handle special dialogs
        if (endColName === 'Review' && startColName !== 'Review') {
            setReviewDialog({
                taskId: activeId,
                toColumnId: targetColumnId,
                fromColumnId: originalColumnId!,
                isResubmit: startColName === 'Done',
                pushId: targetPushId,
                dropPosition: dropCenter
            })
            setIsDragging(false)
            setActiveTask(null)
            return
        }

        if (startColName === 'Done' && (endColName === 'Todo' || endColName === 'To Do' || endColName === 'In Progress')) {
            setDoneMoveDialog({
                taskId: activeId,
                toColumnId: targetColumnId,
                fromColumnId: originalColumnId!,
                toColumnName: endColName,
                pushId: targetPushId
            })
            setIsDragging(false)
            setActiveTask(null)
            return
        }

        // --- OPTIMISTIC UPDATE ---
        // 1. Calculate new columns state immediately
        const newColumns = columns.map(col => {
            // Handle Source Column (Remove Task)
            if (col.id === sourceColumn.id) {
                return {
                    ...col,
                    tasks: col.tasks.filter(t => t.id !== activeId)
                }
            }

            // Handle Target Column (Add Task)
            if (col.id === targetColumnId) {
                // Calculate insertion index
                let insertIndex = col.tasks.length
                if (isOverTask) {
                    const overIndex = col.tasks.findIndex(t => t.id === overId)
                    if (overIndex !== -1) {
                        insertIndex = overId === activeId ? overIndex : (overIndex >= 0 ? overIndex : insertIndex)
                    }
                }

                const updatedTask = {
                    ...activeTask,
                    columnId: targetColumnId,
                    push: targetPushId ? {
                        id: targetPushId,
                        name: activeTask.push?.name || 'Push',
                        color: activeTask.push?.color || '#000',
                        status: activeTask.push?.status || 'active'
                    } : null
                }

                return {
                    ...col,
                    tasks: [
                        ...col.tasks.slice(0, insertIndex),
                        updatedTask,
                        ...col.tasks.slice(insertIndex)
                    ]
                }
            }
            return col
        })

        // 2. Apply State
        setColumns(newColumns)

        // 3. Clear Drag State (Makes item visible in new spot, removes overlay)
        setIsDragging(false)
        setActiveTask(null)

        // 4. Server Persistence
        setIsPersisting(true)
        let success = true
        try {
            if (pushChanged) {
                const pushResult = await assignTaskToPush(activeId, targetPushId)
                if (pushResult.error) {
                    success = false
                    toast({ title: "Error", description: pushResult.error, variant: "destructive" })
                }
            }

            if (columnChanged && success) {
                const columnResult = await saveToServer(activeId, targetColumnId, originalColumnId!)
                if (!columnResult) {
                    success = false
                } else if (endColName === 'Done') {
                    triggerConfetti('done', dropCenter)
                }
            }

            // Only refresh if both operations succeeded
            if (success) {
                router.refresh()
            } else {
                // Revert on failure (optional, but good practice)
                setColumns(board.columns)
            }
        } catch (error) {
            console.error(error)
            setColumns(board.columns) // Revert
        } finally {
            setIsPersisting(false)
        }
    }


    const handleReviewConfirm = async () => {
        if (!reviewDialog) return

        // 1. Optimistic Update
        const task = columns.flatMap(c => c.tasks).find(t => t.id === reviewDialog.taskId)
        if (task) {
            let newPush = task.push
            if (reviewDialog.pushId === null) {
                newPush = null
            } else if (reviewDialog.pushId !== undefined && reviewDialog.pushId !== task.push?.id) {
                const pushData = pushes.find(p => p.id === reviewDialog.pushId)
                if (pushData) {
                    newPush = {
                        id: pushData.id,
                        name: pushData.name,
                        color: pushData.color,
                        status: pushData.status
                    }
                }
            }

            const updatedTask = {
                ...task,
                columnId: reviewDialog.toColumnId,
                push: newPush
            }

            const optimColumns = columns.map(col => {
                if (col.id === reviewDialog.fromColumnId) {
                    return { ...col, tasks: col.tasks.filter(t => t.id !== task.id) }
                }
                if (col.id === reviewDialog.toColumnId) {
                    return { ...col, tasks: [...col.tasks, updatedTask] }
                }
                return col
            })
            setColumns(optimColumns)
        }

        // 2. Server Persistence
        if (reviewDialog.pushId !== undefined) {
            await assignTaskToPush(reviewDialog.taskId, reviewDialog.pushId)
        }

        const result = await updateTaskStatus(reviewDialog.taskId, reviewDialog.toColumnId, projectId)

        if (result.error === 'ATTACHMENT_REQUIRED') {
            const taskTitle = task?.title || 'This task'
            setAttachmentWarningDialog({ taskTitle })
            setFlashingColumnId(reviewDialog.toColumnId)
            setTimeout(() => setFlashingColumnId(null), 500)
            // Revert on error
            router.refresh()
        } else if (result.error) {
            toast({ title: "Error", description: result.error, variant: "destructive" })
            // Revert on error
            router.refresh()
        } else {
            triggerConfetti('review', reviewDialog.dropPosition)
            router.refresh()
        }
        setReviewDialog(null)
        setIsDragging(false)
    }

    const handleReviewCancel = () => {
        if (!reviewDialog) return
        router.refresh()
        setReviewDialog(null)
        setIsDragging(false)
    }

    const handleDoneMoveConfirm = async () => {
        if (!doneMoveDialog) return

        // 1. Optimistic Update
        const task = columns.flatMap(c => c.tasks).find(t => t.id === doneMoveDialog.taskId)
        if (task) {
            let newPush = task.push
            if (doneMoveDialog.pushId === null) {
                newPush = null
            } else if (doneMoveDialog.pushId !== undefined && doneMoveDialog.pushId !== task.push?.id) {
                const pushData = pushes.find(p => p.id === doneMoveDialog.pushId)
                if (pushData) {
                    newPush = {
                        id: pushData.id,
                        name: pushData.name,
                        color: pushData.color,
                        status: pushData.status
                    }
                }
            }

            const updatedTask = {
                ...task,
                columnId: doneMoveDialog.toColumnId,
                push: newPush
            }

            const optimColumns = columns.map(col => {
                if (col.id === doneMoveDialog.fromColumnId) {
                    return { ...col, tasks: col.tasks.filter(t => t.id !== task.id) }
                }
                if (col.id === doneMoveDialog.toColumnId) {
                    return { ...col, tasks: [...col.tasks, updatedTask] }
                }
                return col
            })
            setColumns(optimColumns)
        }

        // 2. Server Persistence
        if (doneMoveDialog.pushId !== undefined) {
            await assignTaskToPush(doneMoveDialog.taskId, doneMoveDialog.pushId)
        }

        await saveToServer(doneMoveDialog.taskId, doneMoveDialog.toColumnId)
        router.refresh()
        setDoneMoveDialog(null)
        setIsDragging(false)
    }

    const handleDoneMoveCancel = () => {
        if (!doneMoveDialog) return
        router.refresh()
        setDoneMoveDialog(null)
        setIsDragging(false)
    }

    const togglePushCollapse = (pushId: string) => {
        setCollapsedPushes(prev => {
            const next = new Set(prev)
            if (next.has(pushId)) next.delete(pushId)
            else next.add(pushId)
            return next
        })
    }

    const getPushTasks = (pushId: string | null) => {
        return columns.map(col => ({
            ...col,
            tasks: col.tasks.filter(task =>
                pushId === null
                    ? !task.push
                    : task.push?.id === pushId
            )
        }))
    }

    const isPushComplete = (pushId: string) => {
        const pushCols = getPushTasks(pushId)
        const doneCol = pushCols.find(c => c.name === 'Done')
        const totalTasks = pushCols.reduce((sum, c) => sum + c.tasks.length, 0)
        return totalTasks > 0 && doneCol?.tasks.length === totalTasks
    }

    const handleDeletePush = (e: React.MouseEvent, pushId: string) => {
        e.stopPropagation()
        setDeletePushId(pushId)
    }

    const handleEditPush = (e: React.MouseEvent, push: PushType) => {
        e.stopPropagation()
        setEditingPush(push)
    }

    const confirmDeletePush = async () => {
        if (!deletePushId) return

        const result = await deletePush(deletePushId, projectId)
        if (result.error) {
            toast({ title: "Error", description: result.error, variant: "destructive" })
        } else {
            toast({ title: "Push Deleted", description: "The push has been removed." })
        }
        setDeletePushId(null)
    }

    const renderPushBoard = (pushColumns: ColumnData[], pushId: string | null) => (
        <div className="overflow-x-auto pb-4">
            <div className="flex flex-col gap-3 md:grid md:grid-flow-col md:auto-cols-[minmax(280px,1fr)] min-h-[200px] md:min-h-[300px] min-w-full">
                {pushColumns.sort((a, b) => a.order - b.order).map(col => (
                    <Column
                        key={`${pushId || 'backlog'}-${col.id}`}
                        column={col}
                        projectId={projectId}
                        users={users}
                        onEditTask={setPreviewingTask}
                        onAddTask={(col.name === 'Todo' || col.name === 'To Do') ? () => {
                            setCreatingColumnId(col.id)
                            setCreatingPushId(pushId)
                        } : undefined}
                        isDoneColumn={col.name === 'Done'}
                        isReviewColumn={col.name === 'Review'}
                        userRole={userRole}
                        isFlashing={flashingColumnId === `${pushId || 'backlog'}::${col.id}`}
                        pushId={pushId}
                        highlightTaskId={highlightTaskId}
                        currentUserId={userId}
                    />
                ))}
            </div>
        </div>
    )

    return (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
            <div className="flex flex-col h-full overflow-y-auto">

                <div className="flex-1 p-4 space-y-4">
                    {pushes.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-[50vh] text-muted-foreground border-2 border-dashed rounded-xl m-4 bg-muted/10">
                            <p className="text-lg font-medium">No pushes yet...</p>
                            <p className="text-sm mt-1">Create a push to get started</p>
                        </div>
                    )}

                    {[...pushes].sort((a, b) => {
                        const aComplete = isPushComplete(a.id)
                        const bComplete = isPushComplete(b.id)
                        if (aComplete !== bComplete) return aComplete ? 1 : -1

                        const aStart = new Date(a.startDate).getTime()
                        const bStart = new Date(b.startDate).getTime()
                        if (aStart !== bStart) return aStart - bStart

                        return a.id.localeCompare(b.id)
                    }).map(push => {
                        const pushColumns = getPushTasks(push.id)
                        const isComplete = isPushComplete(push.id)
                        const isCollapsed = collapsedPushes.has(push.id)

                        return (
                            <Collapsible
                                key={push.id}
                                open={!isCollapsed}
                                onOpenChange={() => togglePushCollapse(push.id)}
                                className="group"
                            >
                                <div className="rounded-lg border bg-card transition-all duration-200 shadow-sm hover:shadow-md data-[state=open]:shadow-sm">
                                    <CollapsibleTrigger asChild>
                                        <button className={`w-full flex items-center justify-between p-4 transition-colors rounded-t-lg group-data-[state=closed]:rounded-lg relative overflow-hidden ${isComplete ? 'bg-green-100 dark:bg-green-900/20 hover:bg-green-200/50 dark:hover:bg-green-900/30' : 'hover:bg-accent/50'}`}>
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-3 flex-wrap">
                                                    <span className="font-semibold text-lg tracking-tight">{push.name}</span>
                                                    {isComplete && (
                                                        <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-2.5 py-0.5 rounded-full ring-1 ring-inset ring-green-600/20">
                                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                                            {push.endDate && push.endDate !== 'null' ? `Completed on ${new Date(push.endDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : 'Completed!'}
                                                        </span>
                                                    )}
                                                    {!isComplete && (
                                                        <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
                                                            <span className="bg-muted/50 px-2 py-0.5 rounded">
                                                                {new Date(push.startDate).toLocaleDateString([], { month: 'short', day: 'numeric' })} - {push.endDate ? new Date(push.endDate).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Ongoing'}
                                                            </span>
                                                            <span>•</span>
                                                            <span>
                                                                {push.completedCount} of {push.taskCount} tasks completed
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-1">
                                                    {isAdmin && (
                                                        <>
                                                            <div
                                                                role="button"
                                                                onClick={(e) => handleEditPush(e, push)}
                                                                className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-primary/10 hover:text-primary transition-colors relative z-10"
                                                                title="Edit Push"
                                                            >
                                                                <Pencil className="h-4 w-4" />
                                                            </div>
                                                            <div
                                                                role="button"
                                                                onClick={(e) => handleDeletePush(e, push.id)}
                                                                className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors relative z-10"
                                                                title="Delete Push"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </div>
                                                        </>
                                                    )}
                                                    <div className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-accent transition-colors relative z-10">
                                                        <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${!isCollapsed ? 'rotate-180' : ''}`} />
                                                    </div>
                                                </div>
                                            </div>


                                        </button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                        <div className="p-4 pt-0 border-t bg-muted/10">
                                            <div className="pt-4">
                                                {renderPushBoard(pushColumns, push.id)}
                                            </div>
                                        </div>
                                    </CollapsibleContent>
                                </div>
                            </Collapsible>
                        )
                    })
                    }
                </div>
            </div>

            {mounted && createPortal(
                <DragOverlay dropAnimation={null}>
                    {activeTask && <TaskCard task={activeTask} overlay />}
                </DragOverlay>,
                document.body
            )}

            {previewingTask && (
                <TaskPreview
                    key={`preview-${previewingTask.id}`}
                    task={{
                        ...previewingTask,
                        assignee: previewingTask.assignee
                            ? { id: previewingTask.assignee.id ?? previewingTask.assignee.name, name: previewingTask.assignee.name }
                            : null,
                        updatedAt: previewingTask.updatedAt ?? undefined
                    }}
                    projectId={projectId}
                    open={true}
                    onOpenChange={(open) => !open && setPreviewingTask(null)}
                    onEdit={() => {
                        setEditingTask(previewingTask)
                        setPreviewingTask(null)
                    }}
                />
            )}

            {editingTask && (
                <TaskDialog
                    key={editingTask.id}
                    projectId={projectId}
                    users={users}
                    task={editingTask}
                    open={true}
                    onOpenChange={(open) => !open && setEditingTask(null)}
                />
            )}

            {creatingColumnId && (
                <TaskDialog
                    key={`new-${creatingColumnId}`}
                    projectId={projectId}
                    users={users}
                    columnId={creatingColumnId}
                    pushId={creatingPushId}
                    open={true}
                    onOpenChange={(open) => !open && setCreatingColumnId(null)}
                />
            )}

            <AlertDialog open={!!reviewDialog} onOpenChange={(open) => !open && handleReviewCancel()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {reviewDialog?.isResubmit ? "Resubmit for Review?" : "Submit for Review?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {reviewDialog?.isResubmit
                                ? "This task will be sent back for another review cycle."
                                : "This task will need approval from an Admin or Team Lead before it can be marked as Done."
                            }
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={handleReviewCancel}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleReviewConfirm}>
                            {reviewDialog?.isResubmit ? "Resubmit" : "Submit"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!doneMoveDialog} onOpenChange={(open) => !open && handleDoneMoveCancel()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Move Completed Task?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This task is already marked as Done. Are you sure you want to move it back to {doneMoveDialog?.toColumnName}? This will mark it as incomplete.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={handleDoneMoveCancel}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDoneMoveConfirm}>
                            Move Task
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!deletePushId} onOpenChange={(open) => !open && setDeletePushId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Push</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this push? All tasks in this push will be moved to the backlog (unassigned). This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeletePushId(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDeletePush}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            Delete Push
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!attachmentWarningDialog} onOpenChange={(open) => !open && setAttachmentWarningDialog(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>File Upload Required</AlertDialogTitle>
                        <AlertDialogDescription>
                            The task "{attachmentWarningDialog?.taskTitle}" requires a file upload before it can be moved to Review. Please upload a file in the task details first.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction onClick={() => setAttachmentWarningDialog(null)}>
                            OK
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {editingPush && (
                <PushDialog
                    projectId={projectId}
                    open={true}
                    onOpenChange={(open) => !open && setEditingPush(null)}
                    push={editingPush}
                />
            )}
        </DndContext>
    )
}
