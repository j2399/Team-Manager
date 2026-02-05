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
import { useState, useEffect, useCallback, useRef } from "react"
import { cn } from "@/lib/utils"
import { createPortal } from "react-dom"
import { Plus, ChevronDown, CheckCircle2, Pencil, Lock } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useRouter } from "next/navigation"

import { PushDialog } from "@/features/pushes/PushDialog"
import { useToast } from "@/components/ui/use-toast"
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
import { assignTaskToPush, updatePush } from "@/app/actions/pushes"
import { Column } from "./Column"
import { TaskCard } from "./TaskCard"
import { TaskDialog } from "./TaskDialog"
import { TaskPreview } from "./TaskPreview"
import { useConfetti } from "./Confetti"
import { PushChainStrip } from "./PushChainStrip"

type Task = {
    id: string
    title: string
    description?: string | null
    columnId: string | null
    difficulty?: string | null
    startDate?: Date | string | null
    endDate?: Date | string | null
    updatedAt?: Date | string | null
    requireAttachment?: boolean
    enableProgress?: boolean
    attachmentFolderId?: string | null
    attachmentFolderName?: string | null
    assigneeId?: string | null
    assignee?: { id?: string; name: string } | null
    assignees?: { user: { id: string; name: string } }[]
    instructionsFileUrl?: string | null
    instructionsFileName?: string | null
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
    dependsOnId?: string | null
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
    projectColor?: string
    users: { id: string; name: string; isProjectMember?: boolean }[]
    pushes?: PushType[]
    highlightTaskId?: string | null
    expandPushId?: string | null
    initialNewTask?: boolean
    initialAssigneeId?: string | null
    initialPushId?: string | null
}

export function Board({
    board,
    projectId,
    projectColor,
    users,
    pushes = [],
    highlightTaskId,
    expandPushId,
    initialNewTask,
    initialAssigneeId,
    initialPushId
}: BoardProps) {
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
    const [flashingColumnId, setFlashingColumnId] = useState<string | null>(null)
    const [collapsedPushes, setCollapsedPushes] = useState<Set<string>>(() =>
        new Set(pushes.filter(p => p.id !== expandPushId).map(p => p.id))
    )
    const [loadingPushes, setLoadingPushes] = useState<Record<string, true>>({})
    const [loadedPushes, setLoadedPushes] = useState<Record<string, true>>({})
    const [pushStatusOverrides, setPushStatusOverrides] = useState<Record<string, 'Active' | 'Completed'>>({})
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

    const [editingPush, setEditingPush] = useState<PushType | null>(null)

    const isAdmin = userRole === 'Admin' || userRole === 'Team Lead'
    const { triggerConfetti } = useConfetti()

    // Handle initial new task creation from URL
    useEffect(() => {
        if (initialNewTask && columns.length > 0 && !creatingColumnId && mounted) {
            // Find the "To Do" column or use the first one
            const todoCol = columns.find(c => c.name === 'To Do' || c.name === 'Todo') || columns[0]
            setCreatingColumnId(todoCol.id)
            if (initialPushId) setCreatingPushId(initialPushId)

            // Clean up URL parameters to prevent re-opening on refresh
            const url = new URL(window.location.href)
            url.searchParams.delete('newTask')
            url.searchParams.delete('assigneeId')
            window.history.replaceState({}, '', url.pathname + url.search)
        }
    }, [initialNewTask, columns, initialPushId, creatingColumnId, mounted])

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

    useEffect(() => {
        setColumns(board.columns)
    }, [board.columns])

    const processedHighlightRef = useRef<string | null>(null)

    const loadPushTasks = useCallback(async (pushId: string) => {
        if (loadedPushes[pushId] || loadingPushes[pushId]) return
        setLoadingPushes((prev) => ({ ...prev, [pushId]: true }))
        try {
            const res = await fetch(`/api/projects/${projectId}/tasks?pushId=${encodeURIComponent(pushId)}&lean=true`)
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error || "Failed to load tasks")

            const tasks: Task[] = Array.isArray(data?.tasks) ? data.tasks : []
            const byColumnId = new Map<string, Task[]>()
            for (const task of tasks) {
                const colId = task.columnId || ""
                if (!colId) continue
                const arr = byColumnId.get(colId) || []
                arr.push(task)
                byColumnId.set(colId, arr)
            }

            setColumns((prev) =>
                prev.map((col) => {
                    const kept = col.tasks.filter((t) => t.push?.id !== pushId)
                    const incoming = byColumnId.get(col.id) || []
                    return { ...col, tasks: [...kept, ...incoming] }
                })
            )

            setLoadedPushes((prev) => ({ ...prev, [pushId]: true }))
        } catch (e) {
            console.error(e)
        } finally {
            setLoadingPushes((prev) => {
                const next = { ...prev }
                delete next[pushId]
                return next
            })
        }
    }, [loadedPushes, loadingPushes, projectId])

    // Scroll to highlighted task
    useEffect(() => {
        if (!highlightTaskId || !mounted) return
        // Prevent repeated scrolling on re-renders (e.g. drag and drop)
        if (processedHighlightRef.current === highlightTaskId) return

        const task = columns.flatMap(c => c.tasks).find(t => t.id === highlightTaskId)
        if (!task) {
            // If tasks aren't loaded yet (pushes are collapsed by default), fetch the task meta
            fetch(`/api/tasks/${highlightTaskId}`)
                .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
                .then(async ({ ok, d }) => {
                    if (!ok) return
                    if (d?.projectId && d.projectId !== projectId) return
                    const pushId = d?.pushId || null
                    if (!pushId) return

                    // Expand and load the push, then scroll
                    setCollapsedPushes((prev) => {
                        if (!prev.has(pushId)) return prev
                        const next = new Set(prev)
                        next.delete(pushId)
                        return next
                    })
                    await loadPushTasks(pushId)
                    setTimeout(() => {
                        const el = document.getElementById(`task-card-${highlightTaskId}`)
                        if (el) {
                            el.scrollIntoView({ behavior: "smooth", block: "center" })
                            processedHighlightRef.current = highlightTaskId
                        }
                    }, 250)
                })
                .catch(() => { })
            return
        }

        // If task is in a push, check if it's collapsed
        // (For Kanban board, tasks have a push property)
        // If task has no push (Backlog), pushId might be undefined/null effectively
        const pushId = task.push?.id || (task as { pushId?: string }).pushId || 'backlog'

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

        if (pushId && pushId !== "backlog") {
            void loadPushTasks(pushId)
        }

        // 2. Scroll into view
        // If we expanded, wait for animation. If not, scroll immediately (or short delay for safety)
        setTimeout(() => {
            const el = document.getElementById(`task-card-${highlightTaskId}`)
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                processedHighlightRef.current = highlightTaskId
            }
        }, didExpand ? 300 : 100)

    }, [highlightTaskId, mounted, columns, loadPushTasks, projectId])

    useEffect(() => {
        const handleFocus = () => fetchUserRole()
        window.addEventListener('focus', handleFocus)
        return () => window.removeEventListener('focus', handleFocus)
    }, [fetchUserRole])

    // Sync from props when board data actually changes (from router.refresh)
    // This happens AFTER server operations complete
    useEffect(() => {
        // Preserve any already-loaded tasks; server payload omits tasks while pushes are collapsed
        setColumns((prev) => {
            const prevTasksByColId = new Map(prev.map((c) => [c.id, c.tasks]))
            return board.columns.map((c) => ({ ...c, tasks: prevTasksByColId.get(c.id) || [] }))
        })

        // Ensure new pushes start collapsed
        setCollapsedPushes(prev => {
            const next = new Set(prev)
            let changed = false
            pushes.forEach(p => {
                // If it's a new push (not in prev) and not explicitly requested to expand
                if (!prev.has(p.id) && p.id !== expandPushId && !loadedPushes[p.id]) {
                    next.add(p.id)
                    changed = true
                }
            })
            return changed ? next : prev
        })
    }, [board.columns, pushes, expandPushId, loadedPushes])

    // Smart real-time sync - poll for changes every 1.5 seconds
    const lastSyncTime = useRef<string>(new Date().toISOString())
    const isTabVisible = useRef(true)

    // Track tab visibility
    useEffect(() => {
        const handleVisibility = () => {
            isTabVisible.current = document.visibilityState === 'visible'
            // Reset sync time when tab becomes visible to catch up on changes
            if (isTabVisible.current) {
                lastSyncTime.current = new Date(Date.now() - 30000).toISOString() // Last 30 seconds
            }
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [])

    // Smart polling - only fetch changes, update state directly
    useEffect(() => {
        const syncChanges = async () => {
            // Skip if tab hidden or user is interacting
            if (!isTabVisible.current || isDragging || reviewDialog || doneMoveDialog || editingTask || previewingTask) {
                return
            }

            try {
                const baseSince = lastSyncTime.current
                let cursor: string | null = null
                const allTasks: any[] = []
                const deletedIds = new Set<string>()
                let latestUpdate: string | null = null
                let latestDeletion: string | null = null
                let serverTime: string | null = null
                let guard = 0

                while (guard < 20) {
                    const params = new URLSearchParams({ since: baseSince })
                    if (cursor) params.set('cursor', cursor)
                    const res = await fetch(`/api/projects/${projectId}/sync?${params.toString()}`)
                    if (!res.ok) return

                    const data = await res.json()
                    serverTime = data.serverTime || serverTime

                    const pageTasks = Array.isArray(data.tasks) ? data.tasks : []
                    if (pageTasks.length > 0) {
                        allTasks.push(...pageTasks)
                    }

                    if (Array.isArray(data.deletedTaskIds)) {
                        for (const id of data.deletedTaskIds) {
                            if (typeof id === 'string') deletedIds.add(id)
                        }
                    }

                    if (data.latestUpdate && (!latestUpdate || data.latestUpdate > latestUpdate)) {
                        latestUpdate = data.latestUpdate
                    }
                    if (data.latestDeletion && (!latestDeletion || data.latestDeletion > latestDeletion)) {
                        latestDeletion = data.latestDeletion
                    }

                    if (!data.hasMore || !data.nextCursor) break
                    if (data.nextCursor === cursor) break
                    cursor = data.nextCursor
                    guard += 1
                }

                if (allTasks.length > 0 || deletedIds.size > 0) {
                    const changedById = new Map<string, any>()
                    for (const task of allTasks) {
                        if (task?.id) {
                            changedById.set(task.id, task)
                        }
                    }
                    const changedTasks = Array.from(changedById.values())

                    setColumns(prev => {
                        const newColumns = prev.map(col => ({
                            ...col,
                            tasks: col.tasks
                                .filter(task => !deletedIds.has(task.id))
                                .map(task => {
                                    const updated = changedById.get(task.id)
                                    if (updated) {
                                        return {
                                            ...task,
                                            ...updated,
                                            description: updated.description !== undefined ? updated.description : task.description,
                                            // Preserve full data that sync doesn't return
                                            activityLogs: task.activityLogs,
                                            comments: task.comments,
                                            attachments: updated.hasAttachment ? task.attachments : []
                                        }
                                    }
                                    return task
                                })
                        }))

                        // Handle tasks that moved columns
                        for (const changedTask of changedTasks) {
                            if (deletedIds.has(changedTask.id)) continue
                            const currentCol = newColumns.find(c =>
                                c.tasks.some(t => t.id === changedTask.id)
                            )

                            if (currentCol && currentCol.id !== changedTask.columnId) {
                                const task = currentCol.tasks.find(t => t.id === changedTask.id)
                                if (task && changedTask.columnId) {
                                    currentCol.tasks = currentCol.tasks.filter(t => t.id !== changedTask.id)
                                    const targetCol = newColumns.find(c => c.id === changedTask.columnId)
                                    if (targetCol) {
                                        targetCol.tasks.push({ ...task, columnId: changedTask.columnId })
                                    }
                                }
                            }
                        }

                        // Handle new tasks (not in any column yet)
                        for (const changedTask of changedTasks) {
                            if (deletedIds.has(changedTask.id)) continue
                            const existsInAnyColumn = newColumns.some(c =>
                                c.tasks.some(t => t.id === changedTask.id)
                            )
                            if (!existsInAnyColumn && changedTask.columnId) {
                                const targetCol = newColumns.find(c => c.id === changedTask.columnId)
                                if (targetCol) {
                                        targetCol.tasks.push({
                                            id: changedTask.id,
                                            title: changedTask.title,
                                            columnId: changedTask.columnId,
                                            description: changedTask.description ?? null,
                                            assignee: changedTask.assignee,
                                            assignees: changedTask.assignees,
                                            push: changedTask.push,
                                            startDate: changedTask.startDate,
                                            endDate: changedTask.endDate,
                                            requireAttachment: changedTask.requireAttachment,
                                            attachmentFolderId: changedTask.attachmentFolderId ?? null,
                                            attachmentFolderName: changedTask.attachmentFolderName ?? null,
                                            updatedAt: changedTask.updatedAt
                                        })
                                }
                            }
                        }

                        return newColumns
                    })
                }

                const timeCandidates = [latestUpdate, latestDeletion].filter(Boolean) as string[]
                if (timeCandidates.length > 0) {
                    const nextSync = timeCandidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
                    lastSyncTime.current = nextSync
                } else if (serverTime) {
                    lastSyncTime.current = serverTime
                }
            } catch (error) {
                // Silent fail - will retry on next poll
            }
        }

        const interval = setInterval(syncChanges, 1500) // Poll every 1.5 seconds
        return () => clearInterval(interval)
    }, [projectId, isDragging, reviewDialog, doneMoveDialog, editingTask, previewingTask])

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
            const push = result.task?.push
            if (push?.id && push.status) {
                setPushStatusOverrides((prev) => ({
                    ...prev,
                    [push.id]: push.status as 'Active' | 'Completed'
                }))
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

        // Check if task meets attachment requirements for Done column
        const meetsAttachmentRequirement = !activeTask.requireAttachment ||
            (activeTask.attachments && activeTask.attachments.length > 0)

        // Trigger confetti on drop into Done (if requirements met)
        // Small delay so it appears after DragOverlay is gone
        if (endColName === 'Done' && startColName !== 'Done' && meetsAttachmentRequirement && dropCenter) {
            setTimeout(() => {
                triggerConfetti('done', dropCenter, projectColor)
            }, 50)
        }

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
                }
                // Confetti already triggered immediately on drop
            }

            // Only refresh if both operations succeeded
            if (!success) {
                // Revert on failure
                setColumns(board.columns)
            }
        } catch (error) {
            console.error(error)
            setColumns(board.columns) // Revert
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
            triggerConfetti('review', reviewDialog.dropPosition, projectColor)
            // router.refresh() // Removed to prevent flicker
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
        // router.refresh() // Removed to prevent flicker
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
        const willOpen = collapsedPushes.has(pushId)
        setCollapsedPushes(prev => {
            const next = new Set(prev)
            if (next.has(pushId)) next.delete(pushId)
            else next.add(pushId)
            return next
        })
        if (willOpen) void loadPushTasks(pushId)
    }

    const getPushTasks = (pushId: string | null) => {
        return columns.map(col => ({
            ...col,
            tasks: col.tasks.filter(task => {
                if (pushId === null) {
                    // Backlog: show tasks with no push or push object is null
                    return !task.push || task.push === null
                }
                // Specific push: show tasks where push.id matches
                return task.push?.id === pushId
            })
        }))
    }

    const isPushAllDone = (pushId: string) => {
        const pushCols = getPushTasks(pushId)
        const doneCol = pushCols.find(c => c.name === 'Done')
        const totalTasks = pushCols.reduce((sum, c) => sum + c.tasks.length, 0)

        // All tasks done if it has tasks and all are in Done
        if (loadedPushes[pushId]) return totalTasks > 0 && doneCol?.tasks.length === totalTasks

        const push = pushes.find((p) => p.id === pushId)
        return !!push && push.taskCount > 0 && push.completedCount === push.taskCount
    }

    const getPushStatus = (pushId: string) => {
        return pushStatusOverrides[pushId] ?? pushes.find((p) => p.id === pushId)?.status ?? 'Active'
    }

    const isPushMarkedComplete = (pushId: string) => {
        return getPushStatus(pushId) === 'Completed'
    }

    const isPushLocked = (push: PushType) => {
        if (!push.dependsOnId) return false
        // A push is locked if its parent is not complete
        return !isPushMarkedComplete(push.dependsOnId)
    }

    const setPushStatus = async (pushId: string, status: 'Active' | 'Completed') => {
        setPushStatusOverrides((prev) => ({ ...prev, [pushId]: status }))
        if (status === 'Completed') {
            setCollapsedPushes((prev) => {
                const next = new Set(prev)
                next.add(pushId)
                return next
            })
        } else {
            setCollapsedPushes((prev) => {
                const next = new Set(prev)
                next.delete(pushId)
                return next
            })
            void loadPushTasks(pushId)
        }
        try {
            await updatePush({ id: pushId, status })
        } catch {
            setPushStatusOverrides((prev) => ({ ...prev, [pushId]: 'Active' }))
        }
    }

    const getParentPushName = (parentId: string) => {
        return pushes.find(p => p.id === parentId)?.name || "Parent Push"
    }

    const handleEditPush = (e: React.MouseEvent, push: PushType) => {
        e.stopPropagation()
        setEditingPush(push)
    }

    const renderPushBoard = (pushColumns: ColumnData[], pushId: string | null) => (
        <div className="w-full min-w-0 pb-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
                {pushColumns
                    .sort((a, b) => a.order - b.order)
                    .map((col) => (
                        <div key={`${pushId || 'backlog'}-${col.id}`} className="min-w-0 h-full">
                            <Column
                                column={col}
                                projectId={projectId}
                                users={users}
                                onEditTask={setPreviewingTask}
                                isDoneColumn={col.name === 'Done'}
                                isReviewColumn={col.name === 'Review'}
                                userRole={userRole}
                                isFlashing={flashingColumnId === `${pushId || 'backlog'}::${col.id}`}
                                pushId={pushId}
                                highlightTaskId={highlightTaskId}
                                currentUserId={userId}
                            />
                        </div>
                    ))}
            </div>
        </div>
    )

    const handleTaskCreated = (newTask: Task) => {
        setColumns(prev => prev.map(col => {
            if (col.id === newTask.columnId) {
                // Check if task already exists (may have been added by sync polling)
                const taskExists = col.tasks.some(t => t.id === newTask.id)
                if (taskExists) {
                    return col
                }
                return { ...col, tasks: [...col.tasks, newTask] }
            }
            return col
        }))
    }

    const handleTaskUpdated = (updatedTask: Task) => {
        setColumns(prev => prev.map(col => {
            const existingTaskIndex = col.tasks.findIndex(t => t.id === updatedTask.id)

            if (col.id === updatedTask.columnId) {
                if (existingTaskIndex !== -1) {
                    const newTasks = [...col.tasks]
                    newTasks[existingTaskIndex] = updatedTask
                    return { ...col, tasks: newTasks }
                } else {
                    return { ...col, tasks: [...col.tasks, updatedTask] }
                }
            } else {
                if (existingTaskIndex !== -1) {
                    return { ...col, tasks: col.tasks.filter(t => t.id !== updatedTask.id) }
                }
            }
            return col
        }))
    }

    const handleTaskDeleted = (taskId: string) => {
        setColumns(prev => prev.map(col => ({
            ...col,
            tasks: col.tasks.filter(t => t.id !== taskId)
        })))
    }

    return (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
            <div
                className="flex flex-col min-w-0"
            >

                <div className="p-4 space-y-4">
                    {pushes.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-[50vh] text-muted-foreground border-2 border-dashed rounded-xl m-4 bg-muted/10">
                            <p className="text-lg font-medium">No projects yet...</p>
                            <p className="text-sm mt-1">A project is a time-boxed sprint to group related tasks</p>
                        </div>
                    )}

                    {(() => {
                        // Build chains from pushes
                        const pushMap = new Map(pushes.map(p => [p.id, p]))
                        const processed = new Set<string>()
                        const chains: PushType[][] = []

                        // Find root pushes (no parent or parent doesn't exist)
                        const roots = pushes
                            .filter(p => !p.dependsOnId || !pushMap.has(p.dependsOnId))
                            .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())

                        // Build chains by following dependency links
                        for (const root of roots) {
                            if (processed.has(root.id)) continue

                            const chain: PushType[] = [root]
                            processed.add(root.id)

                            let current = root
                            while (true) {
                                const next = pushes.find(p => p.dependsOnId === current.id && !processed.has(p.id))
                                if (!next) break
                                chain.push(next)
                                processed.add(next.id)
                                current = next
                            }

                            chains.push(chain)
                        }

                        // Catch any remaining pushes
                        for (const push of pushes) {
                            if (!processed.has(push.id)) {
                                chains.push([push])
                                processed.add(push.id)
                            }
                        }

                        return chains
                    })().map((chain) => {
                        // For chains with 2+ pushes, render PushChainStrip
                        if (chain.length >= 2) {
                            const firstPush = chain[0]

                            return (
                                <div key={`chain-${firstPush.id}`}>
                                    <PushChainStrip
                                        chain={chain}
                                        isComplete={isPushMarkedComplete}
                                        isAllDone={isPushAllDone}
                                        onMarkComplete={(push) => setPushStatus(push.id, 'Completed')}
                                        onUnmarkComplete={(push) => setPushStatus(push.id, 'Active')}
                                        isAdmin={isAdmin}
                                        onEditPush={handleEditPush}
                                        onAddTask={(push) => {
                                            const todoColumn = columns.find(c => c.name === 'Todo' || c.name === 'To Do')
                                            if (todoColumn) {
                                                setCreatingColumnId(todoColumn.id)
                                                setCreatingPushId(push.id)
                                            }
                                        }}
                                        loadPushTasks={loadPushTasks}
                                        loadedPushes={loadedPushes}
                                        loadingPushes={loadingPushes}
                                        renderPushBoard={(pushId) => {
                                            const pushColumns = getPushTasks(pushId)
                                            return renderPushBoard(pushColumns, pushId)
                                        }}
                                    />
                                </div>
                            )
                        }

                        // For single pushes, use original rendering
                        const push = chain[0]
                        const pushColumns = getPushTasks(push.id)
                        const allTasksDone = isPushAllDone(push.id)
                        const isComplete = isPushMarkedComplete(push.id)
                        const isLocked = isPushLocked(push)
                        const isCollapsed = collapsedPushes.has(push.id)
                        const isOpen = !isCollapsed
                        const contentId = `push-${push.id}-content`

                        return (
                            <div key={push.id} className="relative group/push-container">
                                {/* Vertical connection line from parent to this child */}
                                {push.dependsOnId && (
                                    <div className="absolute left-1/2 -top-4 w-[3px] h-4 bg-muted-foreground/50 -translate-x-1/2 z-0" />
                                )}

                                <div className={cn(
                                    "w-full min-w-0 max-w-full rounded-lg border shadow-sm hover:shadow-md transition-all duration-200 relative z-10",
                                    isComplete ? "bg-muted/40 border-border/50" : "bg-card",
                                    isLocked && "grayscale opacity-70 border-dashed"
                                )}>
                                    <button
                                        type="button"
                                        aria-expanded={isOpen}
                                        aria-controls={contentId}
                                        onClick={() => !isLocked && togglePushCollapse(push.id)}
                                        className={cn(
                                            "w-full flex items-center justify-between p-3 md:p-4 transition-colors relative overflow-hidden",
                                            isOpen ? "rounded-t-lg" : "rounded-lg",
                                            isLocked ? "cursor-not-allowed bg-muted/30" : "hover:bg-accent/50 dark:hover:bg-accent/20"
                                        )}
                                    >
                                        <div className="flex items-center gap-2 md:gap-3 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    "font-semibold text-base md:text-lg tracking-tight truncate",
                                                    isComplete && "text-muted-foreground",
                                                    isLocked && "text-muted-foreground/80 font-medium"
                                                )}>
                                                    {push.name}
                                                </span>
                                                {isAdmin && (isComplete || allTasksDone) && (
                                                    <TooltipProvider delayDuration={100}>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        setPushStatus(push.id, isComplete ? 'Active' : 'Completed')
                                                                    }}
                                                                    className={cn(
                                                                        "h-7 inline-flex items-center overflow-hidden rounded-md border text-xs font-medium transition-[max-width,padding,border-color,background-color] duration-200 ease-out",
                                                                        isComplete
                                                                            ? "max-w-7 px-0 gap-0 border-transparent bg-transparent text-green-600 justify-center"
                                                                            : "max-w-[140px] px-2 gap-1 border-green-200 bg-green-50 text-green-600 hover:bg-green-100"
                                                                    )}
                                                                    title={isComplete ? "Mark as not complete" : "Mark this push complete"}
                                                                >
                                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                                    <span
                                                                        className={cn(
                                                                            "hidden sm:inline whitespace-nowrap transition-all duration-200",
                                                                            isComplete ? "opacity-0 w-0 translate-x-1" : "opacity-100"
                                                                        )}
                                                                    >
                                                                        Mark Complete
                                                                    </span>
                                                                </button>
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top" className="text-xs">
                                                                {isComplete ? "Click to unmark complete" : "Mark this project complete"}
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                )}
                                            </div>

                                            {isLocked && !isComplete && (
                                                <Lock className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                                            )}

                                            {isAdmin && (
                                                <div
                                                    role="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        if (isLocked) return

                                                        // Expand push if collapsed
                                                        if (collapsedPushes.has(push.id)) {
                                                            setCollapsedPushes(prev => {
                                                                const next = new Set(prev)
                                                                next.delete(push.id)
                                                                return next
                                                            })
                                                            loadPushTasks(push.id)
                                                        }
                                                        const todoColumn = columns.find(c => c.name === 'Todo' || c.name === 'To Do')
                                                        if (todoColumn) {
                                                            setCreatingColumnId(todoColumn.id)
                                                            setCreatingPushId(push.id)
                                                        }
                                                    }}
                                                    className={cn(
                                                        "h-7 flex items-center gap-1 px-2 rounded-md border transition-all relative z-10 shrink-0 text-xs",
                                                        isLocked
                                                            ? "cursor-not-allowed opacity-50 bg-muted text-muted-foreground border-transparent"
                                                            : isComplete
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
                                            {!isComplete && push.taskCount > 0 && (
                                                <TooltipProvider delayDuration={100}>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="w-20 md:w-24 h-2 bg-muted rounded-full overflow-hidden shrink-0">
                                                                <div
                                                                    className="h-full bg-primary/60 rounded-full transition-all duration-300"
                                                                    style={{ width: `${(push.completedCount / push.taskCount) * 100}%` }}
                                                                />
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top" className="text-xs">
                                                            {push.completedCount}/{push.taskCount} tasks completed
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )}
                                            {!isComplete && (
                                                <span className="hidden md:inline text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                                                    {new Date(push.startDate).toLocaleDateString([], { month: 'short', day: 'numeric' })} - {push.endDate ? new Date(push.endDate).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Ongoing'}
                                                </span>
                                            )}
                                            {isAdmin && (
                                                <div
                                                    role="button"
                                                    onClick={(e) => handleEditPush(e, push)}
                                                    className={`flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-md hover:bg-primary/10 hover:text-primary transition-colors relative z-10 ${isComplete ? "text-muted-foreground/50" : ""}`}
                                                    title="Edit Push"
                                                >
                                                    <Pencil className="h-3.5 w-3.5 md:h-4 md:w-4" />
                                                </div>
                                            )}
                                            <div className={cn(
                                                "h-7 w-7 md:h-8 md:w-8 flex items-center justify-center rounded-md transition-colors relative z-10",
                                                isComplete ? "text-muted-foreground/50" : "",
                                                !isLocked && "hover:bg-accent"
                                            )}>
                                                <ChevronDown className={`h-4 w-4 md:h-5 md:w-5 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                                            </div>
                                        </div>
                                    </button>

                                    <div
                                        id={contentId}
                                        className="grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
                                        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                                    >
                                        <div className={`min-h-0 ${isOpen ? "overflow-visible" : "overflow-hidden"}`}>
                                            <div className={`p-4 pt-0 border-t rounded-b-lg transition-opacity duration-150 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"} ${isComplete ? "bg-muted/20 border-border/30" : "bg-muted/10"}`}>
                                                <div className="pt-4">
                                                    {loadingPushes[push.id] ? (
                                                        <div className="h-[180px] rounded-lg border bg-background/60 animate-pulse" />
                                                    ) : (

                                                        renderPushBoard(pushColumns, push.id)
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
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
                    onTaskUpdated={handleTaskUpdated}
                />
            )}

            {editingTask && (
                <TaskDialog
                    key={editingTask.id}
                    projectId={projectId}
                    users={users}
                    task={editingTask}
                    open={true}
                    onOpenChange={(open) => {
                        if (open) return
                        setEditingTask(null)
                    }}
                    onTaskUpdated={handleTaskUpdated}
                    onTaskDeleted={handleTaskDeleted}
                />
            )}

            {creatingColumnId && (
                <TaskDialog
                    key={`new-${creatingColumnId}`}
                    projectId={projectId}
                    users={users}
                    columnId={creatingColumnId}
                    pushId={creatingPushId}
                    initialAssigneeIds={initialAssigneeId ? [initialAssigneeId] : []}
                    open={true}
                    onOpenChange={(open) => {
                        if (open) return
                        setCreatingColumnId(null)
                        setCreatingPushId(null)
                    }}
                    onTaskCreated={handleTaskCreated}
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
                                ? "Send back for another review cycle."
                                : "Requires admin approval to mark as Done."
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
                            Move back to {doneMoveDialog?.toColumnName}?
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

            <AlertDialog open={!!attachmentWarningDialog} onOpenChange={(open) => !open && setAttachmentWarningDialog(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>File Upload Required</AlertDialogTitle>
                        <AlertDialogDescription>
                            Please upload a file before moving to Review.
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
