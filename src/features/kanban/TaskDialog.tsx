"use client"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DateRangePicker } from "@/components/ui/date-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Plus, Trash2, X, ListChecks, Folder, ChevronRight, Loader2, ArrowLeft, AlertCircle } from "lucide-react"
import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import { createTask, updateTaskDetails, deleteTask } from "@/app/actions/kanban"
import { createChecklistItem } from "@/app/actions/checklist"
import { deleteTaskInstructions, uploadTaskInstructions } from "@/app/actions/task-instructions"
import { RemoveScroll } from "react-remove-scroll"
import { useDashboardUser } from "@/components/DashboardUserProvider"

type TaskType = {
    id: string
    title: string
    description?: string | null
    assigneeId?: string | null
    assignees?: { user: { id: string; name: string } }[]
    requireAttachment?: boolean
    enableProgress?: boolean
    attachmentFolderId?: string | null
    attachmentFolderName?: string | null
    instructionsFileUrl?: string | null
    instructionsFileName?: string | null
    startDate?: Date | string | null
    endDate?: Date | string | null
    series?: {
        id: string
        position: number
        totalCount: number
        isBlocked: boolean
        previousTaskId: string | null
        previousTaskTitle: string | null
    } | null
}

type TaskDialogResultTask = TaskType & {
    columnId: string | null
    updatedAt?: Date | string | null
    push?: { id: string; name: string; color: string; status: string } | null
    assignee?: { id?: string; name: string } | null
    activityLogs?: { changedByName: string; createdAt: Date | string }[]
    comments?: { createdAt: Date | string }[]
    attachments?: { id: string; createdAt: Date | string }[]
}

type DriveConfig = {
    connected: boolean
    folderId: string | null
    folderName: string | null
}

type FolderNode = {
    id: string
    name: string
    parents: string[]
    modifiedTime?: string | null
}

type SeriesTaskDraft = {
    id: string
    title: string
    description: string
    startDate: string
    endDate: string
}

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

const formatDate = (d: Date | string | null | undefined) => {
    if (!d) return ""
    const dateObj = typeof d === 'string' ? new Date(d) : d
    return dateObj.toISOString().split('T')[0]
}

function createSeriesTaskDraft(): SeriesTaskDraft {
    const randomPart = Math.random().toString(36).slice(2, 8)
    return {
        id: `series-${Date.now()}-${randomPart}`,
        title: "",
        description: "",
        startDate: "",
        endDate: "",
    }
}

export function TaskDialog({ columnId, projectId, pushId, users, task, open: externalOpen, onOpenChange, onTaskCreated, onTaskUpdated, onTaskDeleted, initialAssigneeIds, onBack, showOverlay = true }: {
    columnId?: string
    projectId: string
    pushId?: string | null
    users: { id: string; name: string; isProjectMember?: boolean }[]
    task?: TaskType | null
    open?: boolean
    onOpenChange?: (open: boolean) => void
    onTaskCreated?: (tasks: TaskDialogResultTask[]) => void
    onTaskUpdated?: (task: TaskDialogResultTask) => void
    onTaskDeleted?: (taskId: string) => void
    initialAssigneeIds?: string[]
    onBack?: () => void
    showOverlay?: boolean
}) {
    const dashboardUser = useDashboardUser()
    const workspaceId = dashboardUser?.workspaceId ?? null
    const [internalOpen, setInternalOpen] = useState(false)
    const isControlled = externalOpen !== undefined
    const open = isControlled ? externalOpen : internalOpen
    const dialogContentRef = useRef<HTMLDivElement | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    const today = useMemo(() => new Date().toISOString().split('T')[0], [])
    const [workspaceUsers, setWorkspaceUsers] = useState(users)
    const projectMembershipById = useMemo(() => {
        const map = new Map<string, boolean>()
        users.forEach((user) => map.set(user.id, !!user.isProjectMember))
        return map
    }, [users])

    // Sort users: project members first, then alphabetical
    const sortedUsers = useMemo(() => {
        return [...workspaceUsers].sort((a, b) => {
            if (a.isProjectMember && !b.isProjectMember) return -1
            if (!a.isProjectMember && b.isProjectMember) return 1
            return a.name.localeCompare(b.name)
        })
    }, [workspaceUsers])

    const [title, setTitle] = useState(task?.title || "")
    const [description, setDescription] = useState(task?.description || "")
    const [assigneeId, setAssigneeId] = useState<string>(task?.assigneeId || "")
    const [assigneeIds, setAssigneeIds] = useState<string[]>([])
    const [startDate, setStartDate] = useState<string>(formatDate(task?.startDate) || today)
    const [endDate, setEndDate] = useState<string>(formatDate(task?.endDate) || "")
    const [requireAttachment, setRequireAttachment] = useState<boolean>(task?.requireAttachment !== undefined ? task.requireAttachment : false)
    const [enableProgress, setEnableProgress] = useState<boolean>(task?.enableProgress !== undefined ? task.enableProgress : false)
    const [instructionsFile, setInstructionsFile] = useState<File | null>(null)
    const [existingInstructionsFile, setExistingInstructionsFile] = useState<{ url: string; name: string } | null>(null)
    const [isUploadingInstructions, setIsUploadingInstructions] = useState(false)
    const [isDraggingFile, setIsDraggingFile] = useState(false)
    const [dragFileName, setDragFileName] = useState<string | null>(null)
    const descriptionRef = useRef<HTMLTextAreaElement>(null)
    const [folderTree, setFolderTree] = useState<FolderNode[]>([])
    const [pickerOpen, setPickerOpen] = useState(false)
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
    const [folderStack, setFolderStack] = useState<string[]>([])
    const [loadingFolders, setLoadingFolders] = useState(false)
    const [selectedFolder, setSelectedFolder] = useState<{ id: string; name: string } | null>(null)
    const [folderSelectionChanged, setFolderSelectionChanged] = useState(false)
    const folderInitRef = useRef(false)
    const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false)
    const assigneePopoverCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [removedAssigneeNotice, setRemovedAssigneeNotice] = useState<{ removedCount: number; targetAssigneeCount: number } | null>(null)
    const initialAssigneeIdsRef = useRef<string[] | undefined>(initialAssigneeIds)
    const workspaceUserIdsRef = useRef<Set<string>>(new Set(workspaceUsers.map((u) => u.id)))
    const workspaceUsersResult = useQuery(
        api.admin.getWorkspaceUsers,
        workspaceId ? { workspaceId } : "skip"
    )
    const driveConfigRecord = useQuery(
        api.settings.getWorkspaceDriveConfig,
        workspaceId ? { workspaceId } : "skip"
    )
    const driveLoading = workspaceId ? driveConfigRecord === undefined : false
    const driveConfig: DriveConfig | null = driveConfigRecord === undefined
        ? null
        : {
            connected: !!driveConfigRecord?.refreshToken,
            folderId: driveConfigRecord?.folderId || null,
            folderName: driveConfigRecord?.folderName || null,
        }

    const sanitizeAssigneeIds = useCallback((ids: string[]) => {
        const workspaceUserIds = workspaceUserIdsRef.current
        return Array.from(new Set(ids.filter((id) => id.trim().length > 0 && workspaceUserIds.has(id))))
    }, [])

    const applySanitizedAssignees = useCallback((originalIds: string[], sanitizedIds: string[]) => {
        setAssigneeIds(sanitizedIds)
        setAssigneeId(sanitizedIds[0] || "")
        if (sanitizedIds.length < originalIds.length) {
            const removedCount = originalIds.length - sanitizedIds.length
            setRemovedAssigneeNotice((prev) => ({
                removedCount: (prev?.removedCount || 0) + removedCount,
                targetAssigneeCount: Math.max(prev?.targetAssigneeCount || originalIds.length, originalIds.length)
            }))
        }
    }, [])

    // Checklist state
    const [enableChecklist, setEnableChecklist] = useState(false)
    const [checklistItems, setChecklistItems] = useState<string[]>([])
    const [newChecklistItem, setNewChecklistItem] = useState("")
    const [seriesTasks, setSeriesTasks] = useState<SeriesTaskDraft[]>([])
    const [activeSeriesTaskIndex, setActiveSeriesTaskIndex] = useState(0)

    // Reset form when task changes or dialog opens
    useEffect(() => {
        if (open) {
            setAssigneePopoverOpen(false)
            setError(null)
            folderInitRef.current = false
            setPickerOpen(false)
            setCurrentFolderId(null)
            setFolderStack([])
            setSelectedFolder(null)
            setFolderSelectionChanged(false)
            if (task) {
                setTitle(task.title || "")
                setDescription(task.description || "")
                const rawAssigneeIds =
                    task.assignees && task.assignees.length > 0
                        ? task.assignees.map((ta) => ta.user.id)
                        : task.assigneeId
                            ? [task.assigneeId]
                            : []
                const sanitizedAssigneeIds = sanitizeAssigneeIds(rawAssigneeIds)
                const uniqueRawAssigneeCount = Array.from(new Set(rawAssigneeIds.filter((id) => id.trim().length > 0))).length
                setAssigneeId(sanitizedAssigneeIds[0] || "")
                setAssigneeIds(sanitizedAssigneeIds)
                if (uniqueRawAssigneeCount > sanitizedAssigneeIds.length) {
                    setRemovedAssigneeNotice({
                        removedCount: uniqueRawAssigneeCount - sanitizedAssigneeIds.length,
                        targetAssigneeCount: uniqueRawAssigneeCount
                    })
                } else {
                    setRemovedAssigneeNotice(null)
                }
                setStartDate(formatDate(task.startDate) || today)
                setEndDate(formatDate(task.endDate) || "")
                setRequireAttachment(task.requireAttachment !== undefined ? task.requireAttachment : false)
                setEnableProgress(task.enableProgress !== undefined ? task.enableProgress : false)
                if (task.instructionsFileUrl && task.instructionsFileName) {
                    setExistingInstructionsFile({ url: task.instructionsFileUrl, name: task.instructionsFileName })
                } else {
                    setExistingInstructionsFile(null)
                }
                setInstructionsFile(null)
                setSeriesTasks([])
                setActiveSeriesTaskIndex(0)
            } else {
                setInstructionsFile(null)
                setExistingInstructionsFile(null)
                setTitle("")
                setDescription("")
                const sanitizedInitialAssigneeIds = sanitizeAssigneeIds(initialAssigneeIdsRef.current || [])
                setAssigneeId(sanitizedInitialAssigneeIds[0] || "")
                setAssigneeIds(sanitizedInitialAssigneeIds)
                setRemovedAssigneeNotice(null)
                setStartDate("")
                setEndDate("")
                setRequireAttachment(false)
                setEnableProgress(false)
                setEnableChecklist(false)
                setChecklistItems([])
                setNewChecklistItem("")
                setSeriesTasks([createSeriesTaskDraft()])
                setActiveSeriesTaskIndex(0)
            }
        }
    }, [task, today, open, sanitizeAssigneeIds])

    useEffect(() => {
        return () => {
            if (assigneePopoverCloseTimeoutRef.current) {
                clearTimeout(assigneePopoverCloseTimeoutRef.current)
            }
        }
    }, [])

    useEffect(() => {
        const sourceUsers = workspaceUsersResult?.users?.length
            ? workspaceUsersResult.users.map((user) => ({
                id: user.id,
                name: user.name,
            }))
            : users.map((user) => ({
                id: user.id,
                name: user.name,
            }))

        setWorkspaceUsers((previousUsers) => {
            const previousMembershipById = new Map(previousUsers.map((user) => [user.id, !!user.isProjectMember]))
            return sourceUsers.map((user) => ({
                ...user,
                isProjectMember: projectMembershipById.get(user.id) ?? previousMembershipById.get(user.id) ?? false,
            }))
        })
    }, [projectMembershipById, users, workspaceUsersResult])

    useEffect(() => {
        workspaceUserIdsRef.current = new Set(workspaceUsers.map((u) => u.id))
    }, [workspaceUsers])

    useEffect(() => {
        initialAssigneeIdsRef.current = initialAssigneeIds
    }, [initialAssigneeIds])

    useEffect(() => {
        if (!open || assigneeIds.length === 0) return
        const sanitizedAssigneeIds = sanitizeAssigneeIds(assigneeIds)
        if (sanitizedAssigneeIds.length === assigneeIds.length) return
        applySanitizedAssignees(assigneeIds, sanitizedAssigneeIds)
    }, [open, assigneeIds, workspaceUsers, sanitizeAssigneeIds, applySanitizedAssignees])

    useEffect(() => {
        if (!removedAssigneeNotice) return
        if (assigneeIds.length >= removedAssigneeNotice.targetAssigneeCount) {
            setRemovedAssigneeNotice(null)
        }
    }, [assigneeIds.length, removedAssigneeNotice])

    const handleAssigneePopoverMouseEnter = () => {
        if (assigneePopoverCloseTimeoutRef.current) {
            clearTimeout(assigneePopoverCloseTimeoutRef.current)
            assigneePopoverCloseTimeoutRef.current = null
        }
        setAssigneePopoverOpen(true)
    }

    const handleAssigneePopoverMouseLeave = () => {
        if (assigneePopoverCloseTimeoutRef.current) {
            clearTimeout(assigneePopoverCloseTimeoutRef.current)
        }
        assigneePopoverCloseTimeoutRef.current = setTimeout(() => {
            setAssigneePopoverOpen(false)
        }, 120)
    }

    useEffect(() => {
        if (!open || folderInitRef.current) return
        if (driveConfig?.connected && driveConfig.folderId) {
            if (task?.attachmentFolderId) {
                setSelectedFolder({
                    id: task.attachmentFolderId,
                    name: task.attachmentFolderName || "Drive Folder"
                })
            } else {
                setSelectedFolder(null)
            }
        } else {
            setSelectedFolder(null)
        }
        folderInitRef.current = true
    }, [driveConfig, task, open])

    const rootId = driveConfig?.folderId || null
    const rootName = driveConfig?.folderName || "Drive"
    const showDriveSection = driveLoading || (!!(driveConfig?.connected && rootId))
    const folderCacheKey = rootId ? `driveFolderTree:${rootId}` : null
    const folderCacheTimeKey = folderCacheKey ? `${folderCacheKey}:ts` : null
    const folderCacheTtlMs = 30 * 60 * 1000

    const folderMap = useMemo(() => {
        const map = new Map<string, FolderNode>()
        folderTree.forEach((node) => map.set(node.id, node))
        return map
    }, [folderTree])

    const childMap = useMemo(() => {
        const map = new Map<string, FolderNode[]>()
        folderTree.forEach((node) => {
            node.parents?.forEach((parentId) => {
                if (!map.has(parentId)) map.set(parentId, [])
                map.get(parentId)!.push(node)
            })
        })
        map.forEach((arr) =>
            arr.sort((a, b) => {
                const at = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0
                const bt = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0
                return bt - at
            })
        )
        return map
    }, [folderTree])

    const children = currentFolderId ? childMap.get(currentFolderId) || [] : []
    const readCachedTree = () => {
        if (!folderCacheKey) return null
        try {
            const raw = sessionStorage.getItem(folderCacheKey)
            if (!raw) return null
            const parsed = JSON.parse(raw)
            return Array.isArray(parsed) ? (parsed as FolderNode[]) : null
        } catch {
            return null
        }
    }

    const readCachedTreeTime = () => {
        if (!folderCacheTimeKey) return 0
        try {
            const raw = sessionStorage.getItem(folderCacheTimeKey)
            const ts = raw ? Number(raw) : 0
            return Number.isFinite(ts) ? ts : 0
        } catch {
            return 0
        }
    }

    const writeCachedTree = (tree: FolderNode[]) => {
        if (!folderCacheKey || !folderCacheTimeKey) return
        try {
            sessionStorage.setItem(folderCacheKey, JSON.stringify(tree))
            sessionStorage.setItem(folderCacheTimeKey, String(Date.now()))
        } catch {
            // Ignore cache write failures
        }
    }

    const loadFolderTree = async (force = false) => {
        if (!rootId) return
        if (!force && folderTree.length > 0) return
        setLoadingFolders(true)
        try {
            const res = await fetch(`/api/google-drive/folders/tree?rootId=${rootId}`)
            if (!res.ok) throw new Error("Failed")
            const data = await res.json()
            const nextTree = Array.isArray(data.folders) ? data.folders : []
            setFolderTree(nextTree)
            if (nextTree.length > 0) {
                writeCachedTree(nextTree)
            }
        } catch {
            setFolderTree([])
        } finally {
            setLoadingFolders(false)
        }
    }

    useEffect(() => {
        if (!driveConfig?.connected || !rootId) return
        if (folderTree.length > 0) return

        const cached = readCachedTree()
        const cachedAt = readCachedTreeTime()
        const isStale = !cachedAt || Date.now() - cachedAt > folderCacheTtlMs

        if (cached && cached.length > 0) {
            setFolderTree(cached)
        }
        if (!cached || isStale) {
            void loadFolderTree(true)
        }
    }, [driveConfig?.connected, rootId])

    const openFolderPicker = async () => {
        if (!rootId) return
        const cached = readCachedTree()
        const cachedAt = readCachedTreeTime()
        const isStale = !cachedAt || Date.now() - cachedAt > folderCacheTtlMs
        if (cached && cached.length > 0) {
            setFolderTree(cached)
        }
        setCurrentFolderId(rootId)
        setFolderStack([])
        setPickerOpen(true)
        if (!cached || isStale) {
            await loadFolderTree(true)
        }
    }

    const goFolder = (id: string) => {
        if (!id) return
        if (currentFolderId) setFolderStack((s) => [...s, currentFolderId])
        setCurrentFolderId(id)
    }

    const backFolder = () => {
        if (folderStack.length === 0) {
            setCurrentFolderId(rootId)
            return
        }
        const next = [...folderStack]
        const prev = next.pop()!
        setFolderStack(next)
        setCurrentFolderId(prev)
    }

    const confirmFolder = () => {
        if (!currentFolderId) return
        const name =
            currentFolderId === rootId
                ? rootName
                : folderMap.get(currentFolderId)?.name || "Folder"
        setSelectedFolder({ id: currentFolderId, name })
        setFolderSelectionChanged(true)
        setPickerOpen(false)
    }

    const addChecklistItem = () => {
        if (newChecklistItem.trim()) {
            setChecklistItems(prev => [...prev, newChecklistItem.trim()])
            setNewChecklistItem("")
        }
    }

    const removeChecklistItem = (index: number) => {
        setChecklistItems(prev => prev.filter((_, i) => i !== index))
    }

    const getSeriesTaskDraftsWithCurrentStep = useCallback(() => {
        if (task) return []

        const nextDraft = {
            id: seriesTasks[activeSeriesTaskIndex]?.id ?? createSeriesTaskDraft().id,
            title,
            description,
            startDate,
            endDate,
        }

        if (seriesTasks.length === 0) {
            return [nextDraft]
        }

        return seriesTasks.map((seriesTask, index) => (
            index === activeSeriesTaskIndex
                ? nextDraft
                : seriesTask
        ))
    }, [activeSeriesTaskIndex, description, endDate, seriesTasks, startDate, task, title])

    const loadSeriesTaskDraft = useCallback((seriesTask: SeriesTaskDraft) => {
        setTitle(seriesTask.title)
        setDescription(seriesTask.description)
        setStartDate(seriesTask.startDate)
        setEndDate(seriesTask.endDate)
    }, [])

    const isSeriesTaskDescriptionValid = useCallback((seriesTask: SeriesTaskDraft, index: number) => {
        if (seriesTask.description.trim().length > 0) return true
        return index === 0 && (!!instructionsFile || !!existingInstructionsFile)
    }, [existingInstructionsFile, instructionsFile])

    const isSeriesTaskValid = useCallback((seriesTask: SeriesTaskDraft, index: number) => {
        return (
            seriesTask.title.trim().length > 0 &&
            isSeriesTaskDescriptionValid(seriesTask, index) &&
            seriesTask.startDate !== "" &&
            seriesTask.endDate !== ""
        )
    }, [isSeriesTaskDescriptionValid])

    const goToSeriesTask = useCallback((index: number) => {
        if (task) return

        const nextDrafts = getSeriesTaskDraftsWithCurrentStep()
        const targetTask = nextDrafts[index]
        if (!targetTask) return

        setSeriesTasks(nextDrafts)
        setActiveSeriesTaskIndex(index)
        loadSeriesTaskDraft(targetTask)
        setError(null)
    }, [getSeriesTaskDraftsWithCurrentStep, loadSeriesTaskDraft, task])

    const addSeriesTask = () => {
        const nextDrafts = getSeriesTaskDraftsWithCurrentStep()
        const currentTask = nextDrafts[activeSeriesTaskIndex]

        if (!currentTask || !isSeriesTaskValid(currentTask, activeSeriesTaskIndex)) {
            setError("Complete this task's required fields before adding the next task in series.")
            return
        }

        const newSeriesTask = createSeriesTaskDraft()
        const appendedDrafts = [...nextDrafts, newSeriesTask]
        setSeriesTasks(appendedDrafts)
        setActiveSeriesTaskIndex(appendedDrafts.length - 1)
        loadSeriesTaskDraft(newSeriesTask)
        setError(null)
    }

    const removeActiveSeriesTask = () => {
        if (task || activeSeriesTaskIndex === 0) return

        const nextDrafts = getSeriesTaskDraftsWithCurrentStep().filter((_, index) => index !== activeSeriesTaskIndex)
        const nextIndex = Math.max(0, activeSeriesTaskIndex - 1)
        const nextTask = nextDrafts[nextIndex] ?? createSeriesTaskDraft()

        setSeriesTasks(nextDrafts.length > 0 ? nextDrafts : [nextTask])
        setActiveSeriesTaskIndex(nextIndex)
        loadSeriesTaskDraft(nextTask)
        setError(null)
    }

    const [isLoading, setIsLoading] = useState(false)

    const hasTitle = title.trim().length > 0
    const hasDescriptionValue = description.trim().length > 0 || !!instructionsFile || !!existingInstructionsFile
    const isDescriptionSatisfied = hasDescriptionValue || isDraggingFile
    const hasDateRange = startDate !== "" && endDate !== ""
    const isPrimarySeriesStep = !task && activeSeriesTaskIndex === 0
    const canUseInstructionsForCurrentStep = !!task || isPrimarySeriesStep
    const currentSeriesTaskCount = task ? 1 : Math.max(seriesTasks.length, 1)
    const currentSeriesStepNumber = task ? (task.series?.position ?? 1) : activeSeriesTaskIndex + 1

    const requiredTagClass = (met: boolean) =>
        `text-[10px] font-normal text-destructive transition-all duration-200 overflow-hidden whitespace-nowrap pointer-events-none select-none ${met ? "opacity-0 max-w-0 ml-0" : "opacity-100 max-w-[80px] ml-0"}`

    const adjustDescriptionHeight = () => {
        const el = descriptionRef.current
        if (!el) return
        el.style.height = "auto"
        el.style.height = `${el.scrollHeight}px`
    }

    const applyDateQuickAction = (days: number) => {
        const formatDateOnly = (date: Date) => date.toISOString().split("T")[0]

        const startBase = startDate ? new Date(`${startDate}T00:00:00`) : new Date()
        const existingEnd = endDate ? new Date(`${endDate}T00:00:00`) : null
        const nextStart = startDate || formatDateOnly(startBase)
        const endBase = existingEnd || new Date(`${nextStart}T00:00:00`)

        const nextEnd = new Date(endBase)
        nextEnd.setDate(endBase.getDate() + days)

        setStartDate(nextStart)
        setEndDate(formatDateOnly(nextEnd))
    }

    // Validation - assignees are optional
    const isValid = useMemo(() => {
        if (!task) {
            const completeSeriesTasks = getSeriesTaskDraftsWithCurrentStep()
            return completeSeriesTasks.length > 0 && completeSeriesTasks.every((seriesTask, index) => isSeriesTaskValid(seriesTask, index))
        }

        return (
            hasTitle &&
            hasDescriptionValue &&
            hasDateRange
        )
    }, [getSeriesTaskDraftsWithCurrentStep, hasDateRange, hasDescriptionValue, hasTitle, isSeriesTaskValid, task])

    useEffect(() => {
        if (!open) return
        adjustDescriptionHeight()
    }, [description, open])

    const toggleAssignee = (userId: string) => {
        setAssigneeIds(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        )
    }

    const handleHeaderBack = () => {
        if (!task && activeSeriesTaskIndex > 0) {
            goToSeriesTask(activeSeriesTaskIndex - 1)
            return
        }

        onBack?.()
    }

    function handleClose() {
        setError(null)
        if (isControlled && onOpenChange) {
            onOpenChange(false)
        } else {
            setInternalOpen(false)
        }
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setError(null)

        const sanitizedAssigneeIds = sanitizeAssigneeIds(assigneeIds)
        if (sanitizedAssigneeIds.length !== assigneeIds.length) {
            applySanitizedAssignees(assigneeIds, sanitizedAssigneeIds)
        }

        if (!isValid) {
            return
        }

        setIsLoading(true)
        try {
            if (task) {
                const attachmentFolderPayload = (driveConfig?.connected && rootId)
                    ? {
                        attachmentFolderId: folderSelectionChanged ? (selectedFolder?.id || null) : (task.attachmentFolderId || null),
                        attachmentFolderName: folderSelectionChanged ? (selectedFolder?.name || null) : (task.attachmentFolderName || null)
                    }
                    : {}
                const result = await updateTaskDetails(task.id, {
                    title: title.trim(),
                    description: description.trim(),
                    assigneeId: sanitizedAssigneeIds.length > 0 ? sanitizedAssigneeIds[0] : "",
                    assigneeIds: sanitizedAssigneeIds,
                    startDate,
                    endDate,
                    requireAttachment,
                    enableProgress,
                    projectId,
                    ...attachmentFolderPayload
                })

                if (result?.error) {
                    if (result.error === "One or more assignees are not in this workspace") {
                        const refreshedAssigneeIds = Array.from(
                            new Set(
                                assigneeIds.filter((id) => id.trim().length > 0 && workspaceUserIdsRef.current.has(id))
                            )
                        )
                        if (refreshedAssigneeIds.length !== assigneeIds.length) {
                            applySanitizedAssignees(assigneeIds, refreshedAssigneeIds)
                            setError(null)
                        } else {
                            setError(result.error)
                        }
                        setIsLoading(false)
                        return
                    }
                    setError(result.error)
                    setIsLoading(false)
                    return
                }

                // Handle instructions file upload for existing task
                if (instructionsFile) {
                    setIsUploadingInstructions(true)
                    const formData = new FormData()
                    formData.append('file', instructionsFile)
                    const uploadResult = await uploadTaskInstructions(task.id, formData)

                    if (uploadResult?.error) {
                        setError(uploadResult.error)
                        setIsUploadingInstructions(false)
                        setIsLoading(false)
                        return
                    }
                    setIsUploadingInstructions(false)
                } else if (!existingInstructionsFile && task.instructionsFileUrl) {
                    // User removed the instructions file
                    const deleteResult = await deleteTaskInstructions(task.id)
                    if (deleteResult?.error) {
                        setError(deleteResult.error)
                        setIsLoading(false)
                        return
                    }
                }

                if (result.task && onTaskUpdated) {
                    onTaskUpdated(result.task as TaskDialogResultTask)
                }

                handleClose()
            } else {
                const completeSeriesTasks = getSeriesTaskDraftsWithCurrentStep()
                const primaryTask = completeSeriesTasks[0]
                if (!primaryTask) {
                    setError("Add at least one task before creating the series.")
                    setIsLoading(false)
                    return
                }

                const attachmentFolderPayload = (driveConfig?.connected && rootId)
                    ? {
                        attachmentFolderId: selectedFolder?.id || null,
                        attachmentFolderName: selectedFolder?.name || null
                    }
                    : {}
                const result = await createTask({
                    title: primaryTask.title.trim(),
                    description: primaryTask.description.trim(),
                    assigneeId: sanitizedAssigneeIds[0],
                    assigneeIds: sanitizedAssigneeIds,
                    startDate: primaryTask.startDate,
                    endDate: primaryTask.endDate,
                    requireAttachment,
                    enableProgress,
                    columnId: columnId!,
                    projectId,
                    pushId: pushId || undefined,
                    seriesTasks: completeSeriesTasks.slice(1).map((seriesTask) => ({
                        title: seriesTask.title.trim(),
                        description: seriesTask.description.trim() || undefined,
                        startDate: seriesTask.startDate,
                        endDate: seriesTask.endDate,
                    })),
                    ...attachmentFolderPayload
                })

                if (result?.error) {
                    if (result.error === "One or more assignees are not in this workspace") {
                        const refreshedAssigneeIds = Array.from(
                            new Set(
                                assigneeIds.filter((id) => id.trim().length > 0 && workspaceUserIdsRef.current.has(id))
                            )
                        )
                        if (refreshedAssigneeIds.length !== assigneeIds.length) {
                            applySanitizedAssignees(assigneeIds, refreshedAssigneeIds)
                            setError(null)
                        } else {
                            setError(result.error)
                        }
                        setIsLoading(false)
                        return
                    }
                    setError(result.error)
                    setIsLoading(false)
                    return
                }

                // Upload instructions file for new task
                const createdTasks = Array.isArray(result.tasks) && result.tasks.length > 0
                    ? result.tasks as TaskDialogResultTask[]
                    : result.task
                        ? [result.task as TaskDialogResultTask]
                        : []
                const primaryCreatedTask = createdTasks[0] ?? null

                if (instructionsFile && primaryCreatedTask?.id) {
                    setIsUploadingInstructions(true)
                    const formData = new FormData()
                    formData.append('file', instructionsFile)
                    const uploadResult = await uploadTaskInstructions(primaryCreatedTask.id, formData)

                    if (uploadResult?.error) {
                        console.error('Failed to upload instructions file:', uploadResult.error)
                    }
                    setIsUploadingInstructions(false)
                }

                // Create checklist items for new task
                if (enableChecklist && checklistItems.length > 0 && primaryCreatedTask?.id) {
                    for (let i = 0; i < checklistItems.length; i++) {
                        await createChecklistItem(primaryCreatedTask.id, checklistItems[i], i)
                    }
                }

                // Reset form
                setTitle("")
                setDescription("")
                setAssigneeId("")
                setAssigneeIds([])
                setRemovedAssigneeNotice(null)
                setStartDate(today)
                setEndDate("")
                setInstructionsFile(null)
                setEnableChecklist(false)
                setChecklistItems([])
                setNewChecklistItem("")
                setSeriesTasks([createSeriesTaskDraft()])
                setActiveSeriesTaskIndex(0)

                if (createdTasks.length > 0 && onTaskCreated) {
                    onTaskCreated(createdTasks)
                }

                handleClose()
            }
        } catch (err) {
            console.error("Task submission error:", err)
            setError("An unexpected error occurred")
        } finally {
            setIsLoading(false)
        }
    }

    async function handleConfirmDelete() {
        if (!task) return

        setIsLoading(true)
        try {
            const result = await deleteTask(task.id, projectId)
            if (result?.error) {
                setError(result.error)
            } else {
                if (onTaskDeleted) {
                    onTaskDeleted(task.id)
                }
                setShowDeleteConfirm(false)
                handleClose()
            }
        } catch (err) {
            console.error("Delete error:", err)
            setError("Failed to delete task")
        } finally {
            setIsLoading(false)
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!canUseInstructionsForCurrentStep) return
        const item = e.dataTransfer.items?.[0]
        const file = item && item.kind === "file" ? item.getAsFile() : e.dataTransfer.files?.[0]
        if (file?.name) setDragFileName(file.name)
        setIsDraggingFile(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!canUseInstructionsForCurrentStep) return
        // Only reset if we're leaving the form entirely
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDraggingFile(false)
            setDragFileName(null)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!canUseInstructionsForCurrentStep) return
        setIsDraggingFile(false)
        setDragFileName(null)

        const files = e.dataTransfer.files
        if (files && files.length > 0) {
            setInstructionsFile(files[0])
            setExistingInstructionsFile(null)
            descriptionRef.current?.focus()
        }
    }

    return (
        <>
            <Dialog open={open} onOpenChange={isControlled ? onOpenChange : setInternalOpen}>
                {!task && !isControlled && (
                    <DialogTrigger asChild>
                        <Button variant="ghost" className="w-full justify-start text-muted-foreground">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Task
                        </Button>
                    </DialogTrigger>
                )}
                <DialogContent ref={dialogContentRef} className="sm:max-w-[600px] p-0" showOverlay={showOverlay}>
                    <form
                        onSubmit={handleSubmit}
                        className="flex flex-col h-full max-h-[85vh]"
                    >
                        <DialogHeader className="p-6 pb-2">
                            {((!task && activeSeriesTaskIndex > 0) || onBack) ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleHeaderBack}
                                    className="w-fit -ml-2 mb-1 h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                >
                                    <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                                    {!task && activeSeriesTaskIndex > 0 ? "Previous task" : "Back"}
                                </Button>
                            ) : null}
                            <div className="space-y-1">
                                <DialogTitle className="text-xl font-semibold tracking-tight">
                                    {task ? "Edit Task" : "Create New Task"}
                                </DialogTitle>
                                {!task && (
                                    <DialogDescription className="text-sm text-muted-foreground">
                                        {currentSeriesTaskCount > 1
                                            ? `Task ${currentSeriesStepNumber} of ${currentSeriesTaskCount} in this series.`
                                            : "Create a single task or add another task in series from the footer."}
                                    </DialogDescription>
                                )}
                            </div>
                        </DialogHeader>

                        <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-6">
                            {error && (
                                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
                                    <span className="font-medium">Error:</span> {error}
                                </div>
                            )}
                            {removedAssigneeNotice && assigneeIds.length < removedAssigneeNotice.targetAssigneeCount && (
                                <div className="border border-amber-200/80 bg-amber-50/70 text-amber-900/90 text-sm p-3 rounded-md flex items-start gap-2">
                                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700/80" />
                                    <span>
                                        {removedAssigneeNotice.removedCount === 1
                                            ? "A previous assignee was removed from this workspace and has been unassigned."
                                            : `${removedAssigneeNotice.removedCount} previous assignees were removed from this workspace and have been unassigned.`}
                                        {" "}You can leave it open or add a replacement assignee.
                                    </span>
                                </div>
                            )}
                            {task?.series && (
                                <div className="rounded-lg border bg-muted/30 px-3 py-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-medium">
                                                Step {task.series.position} of {task.series.totalCount}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {task.series.isBlocked && task.series.previousTaskTitle
                                                    ? `Blocked until "${task.series.previousTaskTitle}" reaches Done.`
                                                    : "This task is part of a sequential task series."}
                                            </p>
                                        </div>
                                        <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                            Series
                                        </span>
                                    </div>
                                </div>
                            )}
                            {!task && currentSeriesTaskCount > 1 && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                                        {getSeriesTaskDraftsWithCurrentStep().map((seriesTask, index) => {
                                            const isActive = index === activeSeriesTaskIndex
                                            const label = seriesTask.title.trim() || `Task ${index + 1}`

                                            return (
                                                <button
                                                    key={seriesTask.id}
                                                    type="button"
                                                    onClick={() => goToSeriesTask(index)}
                                                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${isActive
                                                        ? "border-foreground/20 bg-foreground text-background"
                                                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                                                        }`}
                                                >
                                                    {label}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    {activeSeriesTaskIndex > 0 && (
                                        <div className="flex justify-end">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                                                onClick={removeActiveSeriesTask}
                                            >
                                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                                                Remove this task
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <Label htmlFor="title" className="sr-only">Task Title</Label>
                                    <div className="relative">
                                        <Input
                                            id="title"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            autoComplete="off"
                                            placeholder="Task Title"
                                            className="h-10 pr-16"
                                        />
                                        <span className={`absolute right-3 top-1/2 -translate-y-1/2 ${requiredTagClass(hasTitle)}`}>
                                            Required
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <Label htmlFor="description" className="sr-only">Description</Label>
                                    <div
                                        className="relative"
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
                                    >
                                        <Textarea
                                            id="description"
                                            ref={descriptionRef}
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            autoComplete="off"
                                            placeholder={canUseInstructionsForCurrentStep
                                                ? (instructionsFile || existingInstructionsFile) && description.trim() === ""
                                                    ? "Type Description"
                                                    : "Type Description or Drag Files"
                                                : "Type Description"}
                                            className={`min-h-[120px] resize-none overflow-hidden pr-24 ${isDraggingFile ? "ring-1 ring-primary/40" : ""}`}
                                        />
                                        <div
                                            className={`absolute top-2 ${instructionsFile || existingInstructionsFile ? "right-8" : "right-2"} flex items-center gap-2 text-[11px] text-muted-foreground pointer-events-none`}
                                        >
                                            <span className={requiredTagClass(canUseInstructionsForCurrentStep ? isDescriptionSatisfied : description.trim().length > 0)}>Required</span>
                                            {canUseInstructionsForCurrentStep && (isDraggingFile ? dragFileName : (instructionsFile?.name || existingInstructionsFile?.name)) && (
                                                <span className="max-w-[160px] truncate pointer-events-none">
                                                    {isDraggingFile ? dragFileName : (instructionsFile?.name || existingInstructionsFile?.name)}
                                                </span>
                                            )}
                                        </div>
                                        {canUseInstructionsForCurrentStep && (instructionsFile || existingInstructionsFile) && (
                                            <button
                                                type="button"
                                                className="absolute top-2.5 right-3 text-muted-foreground hover:text-foreground transition-colors"
                                                onClick={() => {
                                                    setInstructionsFile(null)
                                                    setExistingInstructionsFile(null)
                                                }}
                                            >
                                                <X className="h-2.5 w-2.5" />
                                            </button>
                                        )}
                                    </div>
                                    {!task && !isPrimarySeriesStep && (instructionsFile || existingInstructionsFile || enableChecklist) && (
                                        <p className="text-[11px] text-muted-foreground">
                                            Instructions and checklist settings stay attached to Task 1 in the series.
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-1">
                                    <Label className="sr-only">Assignees</Label>
                                    <div className="relative">
                                        <Popover open={assigneePopoverOpen} onOpenChange={setAssigneePopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    className="w-full justify-between h-10 font-normal px-3 pr-16"
                                                    onMouseEnter={handleAssigneePopoverMouseEnter}
                                                    onMouseLeave={handleAssigneePopoverMouseLeave}
                                                >
                                                    <span className="truncate">
                                                        {assigneeIds.length === 0
                                                            ? "Open task"
                                                            : assigneeIds.length === 1
                                                                ? sortedUsers.find(u => u.id === assigneeIds[0])?.name || "1 selected"
                                                                : `${assigneeIds.length} selected`}
                                                    </span>
                                                </Button>
                                            </PopoverTrigger>
                                        <PopoverContent
                                            className="w-[260px] p-0"
                                            align="start"
                                            onMouseEnter={handleAssigneePopoverMouseEnter}
                                            onMouseLeave={handleAssigneePopoverMouseLeave}
                                        >
                                            <RemoveScroll shards={[dialogContentRef]}>
                                                <div className="max-h-[240px] overflow-y-auto overscroll-contain p-1">
                                                    {sortedUsers.filter(u => u.isProjectMember).map(u => (
                                                        <div
                                                            key={u.id}
                                                            className="flex items-center space-x-2 px-2 py-1.5 hover:bg-accent rounded-sm cursor-pointer"
                                                            onClick={() => toggleAssignee(u.id)}
                                                        >
                                                            <Checkbox
                                                                checked={assigneeIds.includes(u.id)}
                                                            />
                                                            <div className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex-1 flex justify-between">
                                                                <span>{u.name}</span>
                                                                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Member</span>
                                                            </div>
                                                        </div>
                                                    ))}

                                                    {sortedUsers.some(u => !u.isProjectMember) && (
                                                        <>
                                                            <div className="h-px bg-border my-1" />
                                                            <p className="px-2 py-1.5 text-xs text-muted-foreground font-medium">Other Users</p>
                                                            {sortedUsers.filter(u => !u.isProjectMember).map(u => (
                                                                <div
                                                                    key={u.id}
                                                                    className="flex items-center space-x-2 px-2 py-1.5 hover:bg-accent rounded-sm cursor-pointer"
                                                                    onClick={() => toggleAssignee(u.id)}
                                                                >
                                                                    <Checkbox
                                                                        checked={assigneeIds.includes(u.id)}
                                                                    />
                                                                    <div className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex-1">
                                                                        {u.name}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </>
                                                    )}
                                                </div>
                                            </RemoveScroll>
                                        </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <Label htmlFor="taskDates" className="sr-only">Dates</Label>
                                    <div className="relative flex-1">
                                        {!task && (
                                            <div className="absolute right-1 top-0 z-10 flex -translate-y-full items-center gap-2 bg-background px-1 py-0.5">
                                                <button
                                                    type="button"
                                                    className="text-[10px] leading-none font-medium text-muted-foreground hover:text-foreground"
                                                    onClick={() => applyDateQuickAction(1)}
                                                >
                                                    +1 day
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-[10px] leading-none font-medium text-muted-foreground hover:text-foreground"
                                                    onClick={() => applyDateQuickAction(7)}
                                                >
                                                    +1 week
                                                </button>
                                            </div>
                                        )}
                                        <div className="relative">
                                            <DateRangePicker
                                                id="taskDates"
                                                startDate={startDate}
                                                endDate={endDate}
                                                onChange={(start, end) => {
                                                    setStartDate(start)
                                                    setEndDate(end)
                                                }}
                                                className="h-10 pr-16"
                                                placeholder="Select Days"
                                                quickActions={[]}
                                            />
                                            <span className={`absolute right-3 top-1/2 -translate-y-1/2 ${requiredTagClass(hasDateRange)}`}>
                                                Required
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {showDriveSection && (
                                <div className="space-y-1">
                                    <Label className="sr-only">Submission Folder</Label>
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={openFolderPicker}
                                            disabled={driveLoading || !rootId}
                                            className="w-full h-10 flex items-center justify-between gap-2 px-3 bg-background rounded-md border hover:bg-muted/30 transition-colors disabled:opacity-60"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <span className="text-sm font-normal truncate">
                                                    {selectedFolder?.name || "Select a folder"}
                                                </span>
                                            </div>
                                            {driveLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                        Optional: choose a Drive folder for uploads. {selectedFolder ? "This task currently uses Drive." : "This task currently uses blob storage."}
                                    </p>
                                    {selectedFolder && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-[11px] text-muted-foreground"
                                            onClick={() => {
                                                setSelectedFolder(null)
                                                setFolderSelectionChanged(true)
                                            }}
                                        >
                                            Use blob storage instead
                                        </Button>
                                    )}

                                    {/* Folder picker dialog */}
                                    <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
                                        <DialogContent className="sm:max-w-md p-0 gap-0">
                                            <DialogHeader className="px-4 py-3 border-b">
                                                <DialogTitle className="text-sm">Choose upload folder</DialogTitle>
                                            </DialogHeader>

                                            <div className="flex items-center gap-2 px-4 py-2 border-b min-w-0">
                                                {folderStack.length > 0 && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        onClick={backFolder}
                                                        className="h-7 w-7"
                                                    >
                                                        <ArrowLeft className="h-4 w-4" />
                                                    </Button>
                                                )}
                                                <div className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                                                    {currentFolderId === rootId ? rootName : folderMap.get(currentFolderId || "")?.name || "Folder"}
                                                </div>
                                            </div>

                                            <ScrollArea className="h-64">
                                                {loadingFolders ? (
                                                    <div className="flex items-center justify-center py-8">
                                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                                    </div>
                                                ) : children.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center py-8 gap-1">
                                                        <Folder className="h-5 w-5 text-muted-foreground/30" />
                                                        <span className="text-xs text-muted-foreground">No folders here</span>
                                                    </div>
                                                ) : (
                                                    <div className="py-1">
                                                        {children.map((f) => (
                                                            <button
                                                                key={f.id}
                                                                onClick={() => goFolder(f.id)}
                                                                className="w-full flex items-center gap-2.5 px-4 py-2 text-left hover:bg-muted/50 transition-colors group min-w-0"
                                                            >
                                                                <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                                                                <span className="flex-1 min-w-0 text-sm truncate">{f.name}</span>
                                                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 transition-colors" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </ScrollArea>

                                            <div className="border-t px-4 py-3 flex items-center gap-2">
                                                <Button
                                                    onClick={confirmFolder}
                                                    disabled={!currentFolderId}
                                                    size="sm"
                                                    className="flex-1 min-w-0"
                                                >
                                                    <span className="truncate">
                                                        Select {currentFolderId === rootId ? rootName : folderMap.get(currentFolderId || "")?.name || "Folder"}
                                                    </span>
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => setPickerOpen(false)}>
                                                    Cancel
                                                </Button>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            )}

                            {driveConfig?.connected && !rootId && (
                                <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                                    Google Drive is connected but no root folder is set yet. Ask an admin to configure it in Settings → Integrations.
                                </div>
                            )}

                            <div className="pt-2 pb-2 space-y-3">
                                <p className="text-xs font-medium text-muted-foreground">Extra features</p>
                                <div className="flex items-center space-x-2 border p-3 rounded-lg bg-muted/20">
                                    <Checkbox
                                        id="requireAttachment"
                                        checked={requireAttachment}
                                        onCheckedChange={(checked) => setRequireAttachment(checked === true)}
                                    />
                                    <div className="grid gap-1.5 leading-none">
                                        <label
                                            htmlFor="requireAttachment"
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                        >
                                            Require attachment for completion
                                        </label>
                                        <p className="text-xs text-muted-foreground">
                                            Assignees must upload a file before marking this task as done.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2 border p-3 rounded-lg bg-muted/20">
                                    <Checkbox
                                        id="enableProgress"
                                        checked={enableProgress}
                                        onCheckedChange={(checked) => setEnableProgress(checked === true)}
                                    />
                                    <div className="grid gap-1.5 leading-none">
                                        <label
                                            htmlFor="enableProgress"
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                        >
                                            Enable Manual Progress Tracking
                                        </label>
                                        <p className="text-xs text-muted-foreground">
                                            Allow assignees to manually drag a slider to update progress %.
                                        </p>
                                    </div>
                                </div>

                                {/* Checklist Option - Only show when creating new task */}
                                {!task && isPrimarySeriesStep && (
                                    <div className="border p-3 rounded-lg bg-muted/20">
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="enableChecklist"
                                                checked={enableChecklist}
                                                onCheckedChange={(checked) => setEnableChecklist(checked === true)}
                                            />
                                            <div className="grid gap-1.5 leading-none flex-1">
                                                <label
                                                    htmlFor="enableChecklist"
                                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-1.5"
                                                >
                                                    <ListChecks className="h-3.5 w-3.5" />
                                                    Add Checklist
                                                </label>
                                                <p className="text-xs text-muted-foreground">
                                                    Break down this task into sub-steps that can be tracked.
                                                </p>
                                            </div>
                                        </div>

                                        {enableChecklist && (
                                            <div className="mt-3 pt-3 border-t space-y-2">
                                                {checklistItems.map((item, index) => (
                                                    <div
                                                        key={index}
                                                        className="flex items-center gap-2 bg-background rounded-md px-3 py-2 text-sm"
                                                    >
                                                        <span className="text-muted-foreground">{index + 1}.</span>
                                                        <span className="flex-1">{item}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeChecklistItem(index)}
                                                            className="text-muted-foreground hover:text-destructive transition-colors"
                                                        >
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                                <div className="flex gap-2">
                                                    <Input
                                                        value={newChecklistItem}
                                                        onChange={(e) => setNewChecklistItem(e.target.value)}
                                                        autoComplete="off"
                                                        className="h-9 text-sm"
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault()
                                                                addChecklistItem()
                                                            }
                                                        }}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={addChecklistItem}
                                                        disabled={!newChecklistItem.trim()}
                                                        className="h-9 px-3"
                                                    >
                                                        <Plus className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                                {checklistItems.length === 0 && (
                                                    <p className="text-[10px] text-muted-foreground">
                                                        Press Enter or click + to add items
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                        </div>

                        <div className="p-6 pt-2 border-t mt-auto bg-background rounded-b-lg">

                            <DialogFooter className="flex w-full items-center justify-between sm:justify-between gap-2">
                                <div className="flex-1 mr-2 min-w-0">
                                    {task && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            onClick={() => setShowDeleteConfirm(true)}
                                            disabled={isLoading}
                                            className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                                    {!task && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={addSeriesTask}
                                            disabled={isLoading}
                                        >
                                            <Plus className="h-4 w-4 mr-2" />
                                            Add task in series
                                        </Button>
                                    )}
                                    <Button type="submit" disabled={isLoading || !isValid}>
                                        {isLoading
                                            ? 'Saving...'
                                            : task
                                                ? "Save Changes"
                                                : currentSeriesTaskCount > 1
                                                    ? `Create ${currentSeriesTaskCount} Tasks`
                                                    : "Create Task"}
                                    </Button>
                                </div>
                            </DialogFooter>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Task</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this task? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive hover:bg-destructive/90 text-white">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
