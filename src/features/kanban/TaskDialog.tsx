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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Plus, Trash2, ChevronDown, FileText, Upload, X, ListChecks } from "lucide-react"
import { useState, useTransition, useEffect, useMemo, useRef } from "react"
import { createTask, updateTaskDetails, deleteTask } from "@/app/actions/kanban"
import { RemoveScroll } from "react-remove-scroll"

type TaskType = {
    id: string
    title: string
    description?: string | null
    assigneeId?: string | null
    assignees?: { user: { id: string; name: string } }[]
    requireAttachment?: boolean
    enableProgress?: boolean
    instructionsFileUrl?: string | null
    instructionsFileName?: string | null
    startDate?: Date | string | null
    endDate?: Date | string | null
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

export function TaskDialog({ columnId, projectId, pushId, users, task, open: externalOpen, onOpenChange, onTaskCreated, onTaskUpdated, onTaskDeleted }: {
    columnId?: string
    projectId: string
    pushId?: string | null
    users: { id: string; name: string; isProjectMember?: boolean }[]
    task?: TaskType | null
    open?: boolean
    onOpenChange?: (open: boolean) => void
    onTaskCreated?: (task: any) => void
    onTaskUpdated?: (task: any) => void
    onTaskDeleted?: (taskId: string) => void
}) {
    const [internalOpen, setInternalOpen] = useState(false)
    const isControlled = externalOpen !== undefined
    const open = isControlled ? externalOpen : internalOpen
    const dialogContentRef = useRef<HTMLDivElement | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    const today = useMemo(() => new Date().toISOString().split('T')[0], [])

    // Sort users: project members first, then alphabetical
    const sortedUsers = useMemo(() => {
        return [...users].sort((a, b) => {
            if (a.isProjectMember && !b.isProjectMember) return -1
            if (!a.isProjectMember && b.isProjectMember) return 1
            return a.name.localeCompare(b.name)
        })
    }, [users])

    const [title, setTitle] = useState(task?.title || "")
    const [description, setDescription] = useState(task?.description || "")
    const [assigneeId, setAssigneeId] = useState<string>(task?.assigneeId || "")
    const [assigneeIds, setAssigneeIds] = useState<string[]>([])
    const [startDate, setStartDate] = useState<string>(formatDate(task?.startDate) || today)
    const [endDate, setEndDate] = useState<string>(formatDate(task?.endDate) || "")
    const [requireAttachment, setRequireAttachment] = useState<boolean>(task?.requireAttachment !== undefined ? task.requireAttachment : true)
    const [enableProgress, setEnableProgress] = useState<boolean>(task?.enableProgress !== undefined ? task.enableProgress : false)
    const [instructionsFile, setInstructionsFile] = useState<File | null>(null)
    const [existingInstructionsFile, setExistingInstructionsFile] = useState<{ url: string; name: string } | null>(null)
    const [isUploadingInstructions, setIsUploadingInstructions] = useState(false)
    const instructionsFileRef = useRef<HTMLInputElement>(null)
    const [isDraggingFile, setIsDraggingFile] = useState(false)

    // Checklist state
    const [enableChecklist, setEnableChecklist] = useState(false)
    const [checklistItems, setChecklistItems] = useState<string[]>([])
    const [newChecklistItem, setNewChecklistItem] = useState("")

    // Reset form when task changes or dialog opens
    useEffect(() => {
        if (open) {
            setError(null)
            if (task) {
                setTitle(task.title || "")
                setDescription(task.description || "")
                setAssigneeId(task.assigneeId || "")
                // Load assigneeIds from task.assignees if available, otherwise fall back to assigneeId
                if (task.assignees && task.assignees.length > 0) {
                    setAssigneeIds(task.assignees.map(ta => ta.user.id))
                } else if (task.assigneeId) {
                    setAssigneeIds([task.assigneeId])
                } else {
                    setAssigneeIds([])
                }
                setStartDate(formatDate(task.startDate) || today)
                setEndDate(formatDate(task.endDate) || "")
                setRequireAttachment(task.requireAttachment !== undefined ? task.requireAttachment : true)
                setEnableProgress(task.enableProgress !== undefined ? task.enableProgress : false)
                if (task.instructionsFileUrl && task.instructionsFileName) {
                    setExistingInstructionsFile({ url: task.instructionsFileUrl, name: task.instructionsFileName })
                } else {
                    setExistingInstructionsFile(null)
                }
                setInstructionsFile(null)
            } else {
                setInstructionsFile(null)
                setExistingInstructionsFile(null)
                setTitle("")
                setDescription("")
                setAssigneeId("")
                setAssigneeIds([])
                setStartDate(today)
                setEndDate("")
                setRequireAttachment(true)
                setEnableProgress(false)
                setEnableChecklist(false)
                setChecklistItems([])
                setNewChecklistItem("")
            }
        }
    }, [task, today, open])

    const addChecklistItem = () => {
        if (newChecklistItem.trim()) {
            setChecklistItems(prev => [...prev, newChecklistItem.trim()])
            setNewChecklistItem("")
        }
    }

    const removeChecklistItem = (index: number) => {
        setChecklistItems(prev => prev.filter((_, i) => i !== index))
    }

    const [isLoading, setIsLoading] = useState(false)

    // Validation - all fields required
    const isValid = useMemo(() => {
        return (
            title.trim().length > 0 &&
            description.trim().length > 0 &&
            assigneeIds.length > 0 &&
            startDate !== "" &&
            endDate !== ""
        )
    }, [title, description, assigneeIds, startDate, endDate])

    // Validation errors for display
    const getValidationErrors = () => {
        const errors: string[] = []
        if (!title.trim()) errors.push("Title")
        if (!description.trim()) errors.push("Description")
        if (assigneeIds.length === 0) errors.push("Assignee")
        if (!startDate) errors.push("Start Date")
        if (!endDate) errors.push("Due Date")
        return errors
    }

    const toggleAssignee = (userId: string) => {
        setAssigneeIds(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        )
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

        if (!isValid) {
            return
        }

        setIsLoading(true)
        try {
            if (task) {
                const result = await updateTaskDetails(task.id, {
                    description: description.trim(),
                    assigneeId: assigneeIds.length > 0 ? assigneeIds[0] : "",
                    assigneeIds: assigneeIds,
                    startDate,
                    endDate,
                    requireAttachment,
                    enableProgress,
                    projectId
                })

                if (result?.error) {
                    setError(result.error)
                    setIsLoading(false)
                    return
                }

                // Handle instructions file upload for existing task
                if (instructionsFile) {
                    setIsUploadingInstructions(true)
                    const formData = new FormData()
                    formData.append('file', instructionsFile)

                    const uploadRes = await fetch(`/api/tasks/${task.id}/instructions`, {
                        method: 'POST',
                        body: formData
                    })

                    if (!uploadRes.ok) {
                        const err = await uploadRes.json().catch(() => ({}))
                        setError(err.error || 'Failed to upload instructions file')
                        setIsUploadingInstructions(false)
                        setIsLoading(false)
                        return
                    }
                    setIsUploadingInstructions(false)
                } else if (!existingInstructionsFile && task.instructionsFileUrl) {
                    // User removed the instructions file
                    await fetch(`/api/tasks/${task.id}/instructions`, {
                        method: 'DELETE'
                    })
                }

                if (result.task && onTaskUpdated) {
                    onTaskUpdated(result.task)
                }

                handleClose()
            } else {
                const result = await createTask({
                    title: title.trim(),
                    description: description.trim(),
                    assigneeId: assigneeIds.length > 0 ? assigneeIds[0] : "",
                    assigneeIds: assigneeIds,
                    startDate,
                    endDate,
                    requireAttachment,
                    enableProgress,
                    columnId: columnId!,
                    projectId,
                    pushId: pushId || undefined
                })

                if (result?.error) {
                    setError(result.error)
                    setIsLoading(false)
                    return
                }

                // Upload instructions file for new task
                if (instructionsFile && result.task?.id) {
                    setIsUploadingInstructions(true)
                    const formData = new FormData()
                    formData.append('file', instructionsFile)

                    const uploadRes = await fetch(`/api/tasks/${result.task.id}/instructions`, {
                        method: 'POST',
                        body: formData
                    })

                    if (!uploadRes.ok) {
                        console.error('Failed to upload instructions file')
                    }
                    setIsUploadingInstructions(false)
                }

                // Create checklist items for new task
                if (enableChecklist && checklistItems.length > 0 && result.task?.id) {
                    for (let i = 0; i < checklistItems.length; i++) {
                        await fetch(`/api/tasks/${result.task.id}/checklist`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ content: checklistItems[i], order: i })
                        })
                    }
                }

                // Reset form
                setTitle("")
                setDescription("")
                setAssigneeId("")
                setAssigneeIds([])
                setStartDate(today)
                setEndDate("")
                setInstructionsFile(null)
                setEnableChecklist(false)
                setChecklistItems([])
                setNewChecklistItem("")

                if (result.task && onTaskCreated) {
                    onTaskCreated(result.task)
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
        setIsDraggingFile(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        // Only reset if we're leaving the form entirely
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDraggingFile(false)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDraggingFile(false)

        const files = e.dataTransfer.files
        if (files && files.length > 0) {
            setInstructionsFile(files[0])
        }
    }

    const handleAddDay = () => {
        const base = endDate ? new Date(endDate) : (startDate ? new Date(startDate) : new Date(today))
        const next = new Date(base)
        next.setDate(base.getDate() + 1)
        setEndDate(next.toISOString().split('T')[0])
    }

    const handleAddWeek = () => {
        const base = endDate ? new Date(endDate) : (startDate ? new Date(startDate) : new Date(today))
        const next = new Date(base)
        next.setDate(base.getDate() + 7)
        setEndDate(next.toISOString().split('T')[0])
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
                <DialogContent ref={dialogContentRef} className="sm:max-w-[600px] p-0">
                    <form
                        onSubmit={handleSubmit}
                        className="flex flex-col h-full max-h-[85vh]"
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <DialogHeader className="p-6 pb-2">
                            <DialogTitle className="text-xl font-semibold tracking-tight">
                                {task ? "Edit Task" : "Create New Task"}
                            </DialogTitle>
                            <DialogDescription className="text-muted-foreground mt-1.5">
                                {task ? "Make changes to the task details below." : "Fill in the details to create a new task."}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-6">
                            {error && (
                                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
                                    <span className="font-medium">Error:</span> {error}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="title" className="text-sm font-medium">Task Title</Label>
                                    <Input
                                        id="title"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="e.g., Implement User Authentication"
                                        className="h-10"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="description" className="text-sm font-medium">Description</Label>
                                    <Textarea
                                        id="description"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="Detailed explanation of the task..."
                                        className="min-h-[100px] resize-y"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">Assignees</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className="w-full justify-between h-10 font-normal px-3"
                                            >
                                                <span className="truncate">
                                                    {assigneeIds.length === 0
                                                        ? "Select assignee..."
                                                        : assigneeIds.length === 1
                                                            ? users.find(u => u.id === assigneeIds[0])?.name || "1 selected"
                                                            : `${assigneeIds.length} selected`}
                                                </span>
                                                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[260px] p-0" align="start">
                                            <RemoveScroll shards={[dialogContentRef]}>
                                                <div className="max-h-[240px] overflow-y-auto overscroll-contain p-1">
                                                    {users.filter(u => u.isProjectMember).map(u => (
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

                                                    {users.some(u => !u.isProjectMember) && (
                                                        <>
                                                            <div className="h-px bg-border my-1" />
                                                            <p className="px-2 py-1.5 text-xs text-muted-foreground font-medium">Other Users</p>
                                                            {users.filter(u => !u.isProjectMember).map(u => (
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

                                <div className="space-y-2">
                                    <Label htmlFor="startDate" className="text-sm font-medium">Start Date</Label>
                                    <Input
                                        id="startDate"
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="h-10"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="endDate" className="text-sm font-medium">Due Date</Label>
                                    {!task && startDate && (
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                className="text-xs text-primary hover:underline font-medium"
                                                onClick={handleAddDay}
                                            >
                                                + 1 Day
                                            </button>
                                            <button
                                                type="button"
                                                className="text-xs text-primary hover:underline font-medium"
                                                onClick={handleAddWeek}
                                            >
                                                + 7 Days
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <Input
                                    id="endDate"
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    min={startDate}
                                    className="h-10"
                                />
                            </div>

                            <div className="pt-2 pb-2 space-y-3">
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
                                {!task && (
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
                                                        placeholder="Add a checklist item..."
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

                            <div className="space-y-3">
                                <Label className="text-sm font-medium flex items-center gap-2">
                                    Instructions File
                                    <span className="text-xs font-normal text-muted-foreground">(Optional)</span>
                                </Label>
                                <input
                                    ref={instructionsFileRef}
                                    type="file"
                                    className="hidden"
                                    accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) setInstructionsFile(file)
                                    }}
                                />

                                {(instructionsFile || existingInstructionsFile) ? (
                                    <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg border">
                                        <div className="h-8 w-8 rounded bg-background border flex items-center justify-center shrink-0">
                                            <FileText className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">
                                                {instructionsFile?.name || existingInstructionsFile?.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {instructionsFile ? "Ready to upload" : "Attached"}
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                            onClick={() => {
                                                setInstructionsFile(null)
                                                setExistingInstructionsFile(null)
                                                if (instructionsFileRef.current) {
                                                    instructionsFileRef.current.value = ''
                                                }
                                            }}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <div
                                        onClick={() => instructionsFileRef.current?.click()}
                                        className={`border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer flex flex-col items-center justify-center text-center gap-2 ${isDraggingFile ? 'border-primary bg-primary/10' : 'hover:bg-muted/30 border-muted-foreground/30'}`}
                                    >
                                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                            <Upload className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium">Click or drag & drop to upload</p>
                                            <p className="text-xs text-muted-foreground">PDF, Word, Images up to 10MB</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-6 pt-2 border-t mt-auto bg-background">
                            {!isValid && (
                                <div className="mb-4 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-md border border-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50">
                                    Please fill in all required fields: {getValidationErrors().join(", ")}
                                </div>
                            )}
                            <DialogFooter className="gap-2 sm:gap-0">
                                {task && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setShowDeleteConfirm(true)}
                                        disabled={isLoading}
                                        className="mr-auto text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                )}
                                <div className="flex gap-2 w-full sm:w-auto justify-end">
                                    <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                                    <Button type="submit" disabled={isLoading || !isValid}>
                                        {isLoading ? 'Saving...' : (task ? "Save Changes" : "Create Task")}
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
