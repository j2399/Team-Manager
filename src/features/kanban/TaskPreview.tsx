"use client"

import { useMemo, useState, useEffect, useRef } from "react"
import { useQuery } from "convex/react"
import { api } from "@convex/_generated/api"

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { acceptReviewTask, denyReviewTask, deleteTask } from "@/app/actions/kanban"
import { createTaskComment, deleteTaskComment } from "@/app/actions/task-comments"
import { deleteTaskAttachment, uploadTaskAttachment } from "@/app/actions/task-attachments"
import {
    Pencil, Clock,
    Send, FileText, Upload, Reply, X, Download, Maximize2, Trash2, CheckCircle, XCircle, ListChecks
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { getInitials } from "@/lib/utils"
import { MAX_ATTACHMENT_SIZE } from "@/lib/attachments"
import { TaskChecklist } from "@/components/TaskChecklist"
import { useDashboardUser } from "@/components/DashboardUserProvider"

type Task = {
    id: string
    title: string
    description?: string | null
    status?: string
    requireAttachment?: boolean
    enableProgress?: boolean
    attachmentFolderId?: string | null
    attachmentFolderName?: string | null
    instructionsFileUrl?: string | null
    instructionsFileName?: string | null
    assignee?: { id?: string; name: string } | null
    column?: { name: string } | null
    columnId: string | null
    createdAt?: Date | string | null
    updatedAt?: Date | string | null
    assignees?: { user: { id: string; name: string } }[]
}

type ReplyTo = {
    id: string
    content: string
    authorName: string
}

type Comment = {
    id: string
    content: string
    authorId: string
    authorName: string
    createdAt: string | number
    replyToId: string | null
    replyTo: ReplyTo | null
}

type CommentWithReplies = Comment & {
    replies: CommentWithReplies[]
}

type Attachment = {
    id: string
    name: string
    url: string
    size: number
    type: string
    uploadedBy?: string
    createdAt: string | number
    storageProvider?: string
    externalId?: string | null
}

type DriveConfig = {
    connected: boolean
    folderId: string | null
    folderName: string | null
}

type DriveFolderNode = {
    id: string
    name: string
    parents: string[]
}

type TaskPreviewProps = {
    task: Task
    open: boolean
    onOpenChange: (open: boolean) => void
    onEdit: () => void
    projectId: string
    onTaskUpdated?: (task: Task) => void
    onTaskDeleted?: (taskId: string) => void
}

const formatTimeAgo = (date: string | number) => {
    const diff = new Date().getTime() - new Date(date).getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'Just now'
}

const getAttachmentUrls = (attachment: Attachment) => {
    return {
        preview: attachment.url,
        download: `${attachment.url}?download=1`
    }
}

type CommentNodeProps = {
    comment: CommentWithReplies
    depth?: number
    userRole: string
    currentUserId?: string
    onReply: (comment: CommentWithReplies) => void
    onDelete: (commentId: string) => void
}

const CommentNode = ({ comment, depth = 0, userRole, currentUserId, onReply, onDelete }: CommentNodeProps) => {
    const isReply = depth > 0
    const isOwner = userRole === 'Admin' || userRole === 'Team Lead' || comment.authorId === currentUserId

    return (
        <div className={`flex flex-col ${isReply ? 'mt-3 pl-8 relative' : 'mt-4'}`}>
            {isReply && (
                <div className="absolute top-0 left-3 bottom-0 w-px bg-border -z-10 h-full" />
            )}
            {isReply && (
                <div className="absolute top-3 left-3 w-4 h-px bg-border" />
            )}

            <div className="group flex gap-3">
                <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium text-primary ring-2 ring-background z-10">
                    {getInitials(comment.authorName)}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-0.5">
                        <span className="text-[11px] font-medium text-foreground">{comment.authorName || 'Unknown'}</span>
                        <span className="text-[9px] text-muted-foreground">{formatTimeAgo(comment.createdAt)}</span>
                    </div>

                    <div className="text-[11px] text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
                        {comment.content.split(/(https?:\/\/[^\s]+|@\w+(?:\s+\w+)?)/g).map((part, i) => {
                            if (part.match(/^https?:\/\//)) {
                                return (
                                    <a
                                        key={i}
                                        href={part}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline break-all"
                                    >
                                        {part}
                                    </a>
                                )
                            }
                            if (part.match(/^@\w+/)) {
                                return (
                                    <span
                                        key={i}
                                        className="text-primary font-medium bg-primary/10 px-1 rounded"
                                    >
                                        {part}
                                    </span>
                                )
                            }
                            return <span key={i}>{part}</span>
                        })}
                    </div>

                    <div className="flex items-center gap-3 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={() => onReply(comment)}
                            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors cursor-pointer p-0 bg-transparent border-0"
                        >
                            <Reply className="w-3 h-3" />
                            Reply
                        </button>

                        {isOwner && (
                            <button
                                onClick={() => onDelete(comment.id)}
                                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer p-0 bg-transparent border-0"
                                title="Delete comment"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {comment.replies.length > 0 && (
                <div className="w-full">
                    {comment.replies.map(reply => (
                        <CommentNode
                            key={reply.id}
                            comment={reply}
                            depth={depth + 1}
                            userRole={userRole}
                            currentUserId={currentUserId}
                            onReply={onReply}
                            onDelete={onDelete}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const isImageFile = (filename: string) => {
    const ext = filename.toLowerCase().split('.').pop()
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '')
}

const isSvgFile = (filename: string) => {
    const ext = filename.toLowerCase().split('.').pop()
    return ext === 'svg'
}

const isPdfFile = (filename: string) => {
    const ext = filename.toLowerCase().split('.').pop()
    return ext === 'pdf'
}

// Build comment tree structure
const buildCommentTree = (comments: Comment[]): CommentWithReplies[] => {
    const commentMap = new Map<string, CommentWithReplies>()
    const rootComments: CommentWithReplies[] = []

    // First pass: create map of all comments with empty replies array
    comments.forEach(comment => {
        // Break references to avoid mutation issues if comments are reused
        // and ensure we don't accidentally create cycles if IDs are messy

        commentMap.set(comment.id, { ...comment, replies: [] })
    })

    // Second pass: build tree structure
    comments.forEach(comment => {
        const commentWithReplies = commentMap.get(comment.id)!
        // Prevent self-referencing loops
        if (comment.replyToId && comment.replyToId !== comment.id && commentMap.has(comment.replyToId)) {
            // This is a reply, add it to parent's replies
            const parent = commentMap.get(comment.replyToId)!
            // Check if parent is not already a child of this comment (simple cycle check)
            // For deep cycle check we'd need more logic, but this covers 1-level cycles
            if (!parent.replyToId || parent.replyToId !== comment.id) {
                parent.replies.push(commentWithReplies)
            } else {
                // Fallback for immediate cycle: treat as root
                rootComments.push(commentWithReplies)
            }
        } else {
            // This is a root comment
            rootComments.push(commentWithReplies)
        }
    })

    return rootComments
}

export function TaskPreview({ task, open, onOpenChange, onEdit, projectId, onTaskUpdated, onTaskDeleted }: TaskPreviewProps) {
    const dashboardUser = useDashboardUser()
    const workspaceId = dashboardUser?.workspaceId ?? null
    const [newComment, setNewComment] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [commentError, setCommentError] = useState<string | null>(null)
    const [replyingTo, setReplyingTo] = useState<Comment | null>(null)
    const [enlargedImage, setEnlargedImage] = useState<{ url: string; name: string } | null>(null)
    const [isProcessingReview, setIsProcessingReview] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [showInstructionsFullscreen, setShowInstructionsFullscreen] = useState(false)
    const commentsEndRef = useRef<HTMLDivElement>(null)
    const [uploadProgress, setUploadProgress] = useState<number | null>(null)
    const [uploadingFileName, setUploadingFileName] = useState<string | null>(null)
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
    const deleteTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map())
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [folderTree, setFolderTree] = useState<DriveFolderNode[]>([])
    const [uploadsPath, setUploadsPath] = useState<string>("")
    const liveComments = useQuery(
        api.tasks.getComments,
        open && task.id ? { taskId: task.id } : "skip"
    ) as Comment[] | undefined
    const liveAttachments = useQuery(
        api.tasks.getAttachments,
        open && task.id ? { taskId: task.id } : "skip"
    ) as Attachment[] | undefined
    const liveChecklistItems = useQuery(
        api.tasks.getChecklistItems,
        open && task.id ? { taskId: task.id } : "skip"
    )
    const liveTaskRecord = useQuery(
        api.tasks.getTaskById,
        open && task.id ? { taskId: task.id } : "skip"
    )
    const projectColumns = useQuery(
        api.projectsAdmin.getProjectColumns,
        open && projectId ? { projectId } : "skip"
    )
    const driveConfigRecord = useQuery(
        api.settings.getWorkspaceDriveConfig,
        workspaceId ? { workspaceId } : "skip"
    )
    const driveConfig: DriveConfig | null = driveConfigRecord === undefined
        ? null
        : {
            connected: !!driveConfigRecord?.refreshToken,
            folderId: driveConfigRecord?.folderId || null,
            folderName: driveConfigRecord?.folderName || null,
        }
    const userRole = dashboardUser?.role ?? 'Member'
    const currentUser = dashboardUser
        ? { id: dashboardUser.id, name: dashboardUser.name }
        : null
    const comments = useMemo(() => (liveComments ?? []) as Comment[], [liveComments])
    const attachments = useMemo(() => (liveAttachments ?? []) as Attachment[], [liveAttachments])
    const checklistCount = liveChecklistItems?.length ?? 0
    const instructionsFile = useMemo(() => {
        const url = liveTaskRecord?.instructionsFileUrl ?? task.instructionsFileUrl
        const name = liveTaskRecord?.instructionsFileName ?? task.instructionsFileName
        return url && name ? { url, name } : null
    }, [
        liveTaskRecord?.instructionsFileName,
        liveTaskRecord?.instructionsFileUrl,
        task.instructionsFileName,
        task.instructionsFileUrl,
    ])

    // Scroll to bottom on new comments
    useEffect(() => {
        if (commentsEndRef.current) {
            commentsEndRef.current.scrollIntoView({ behavior: "smooth" })
        }
    }, [comments.length])

    useEffect(() => {
        if (!open || !driveConfig?.connected || !driveConfig.folderId) return
        const rootId = driveConfig.folderId
        const cacheKey = `driveFolderTree:${rootId}`
        const cacheTimeKey = `${cacheKey}:ts`
        const ttlMs = 30 * 60 * 1000
        let cancelled = false

        const readCache = () => {
            try {
                const raw = sessionStorage.getItem(cacheKey)
                if (!raw) return null
                const parsed = JSON.parse(raw)
                return Array.isArray(parsed) ? (parsed as DriveFolderNode[]) : null
            } catch {
                return null
            }
        }

        const readCacheTime = () => {
            try {
                const raw = sessionStorage.getItem(cacheTimeKey)
                const ts = raw ? Number(raw) : 0
                return Number.isFinite(ts) ? ts : 0
            } catch {
                return 0
            }
        }

        const cached = readCache()
        const cachedAt = readCacheTime()
        const isStale = !cachedAt || Date.now() - cachedAt > ttlMs
        if (cached && cached.length > 0) {
            setFolderTree(cached)
        }

        const loadTree = async () => {
            try {
                const res = await fetch(`/api/google-drive/folders/tree?rootId=${rootId}`)
                if (!res.ok) return
                const data = await res.json()
                const nextTree = Array.isArray(data.folders) ? data.folders : []
                if (cancelled) return
                setFolderTree(nextTree)
            } catch {
                // ignore
            }
        }

        if (!cached || isStale) {
            loadTree()
        }
        return () => { cancelled = true }
    }, [open, driveConfig?.connected, driveConfig?.folderId])

    useEffect(() => {
        if (!open) return
        if (!task.attachmentFolderId) {
            setUploadsPath("Blob storage")
            return
        }

        const rootName = driveConfig?.folderName || "Drive"
        const rootId = driveConfig?.folderId || null
        const targetId = task.attachmentFolderId
        const fallbackName = task.attachmentFolderName || "Drive Folder"

        if (!rootId) {
            setUploadsPath(fallbackName)
            return
        }

        if (targetId === rootId) {
            setUploadsPath(rootName)
            return
        }

        const map = new Map<string, DriveFolderNode>()
        folderTree.forEach((node) => map.set(node.id, node))

        const visited = new Set<string>()
        const findPath = (currentId: string): string[] | null => {
            if (currentId === rootId) return [rootName]
            if (visited.has(currentId)) return null
            visited.add(currentId)
            const node = map.get(currentId)
            const parents = node?.parents || []
            for (const parentId of parents) {
                const parentPath = findPath(parentId)
                if (parentPath) {
                    const name = node?.name || fallbackName
                    return [...parentPath, name]
                }
            }
            return null
        }

        const pathParts = findPath(targetId)
        if (pathParts && pathParts.length > 0) {
            setUploadsPath(pathParts.join(" / "))
        } else {
            setUploadsPath(`${rootName} / ${fallbackName}`)
        }
    }, [open, driveConfig?.folderId, driveConfig?.folderName, folderTree, task.attachmentFolderId, task.attachmentFolderName])

    useEffect(() => {
        if (!open) {
            // Reset state when dialog closes
            setNewComment("")
            setCommentError(null)
            setReplyingTo(null)
            setShowInstructionsFullscreen(false)
        }
    }, [open])

    const handleAddComment = async () => {
        if (!newComment.trim() || isSubmitting) return

        if (!task?.id) {
            console.error('Cannot create comment: No task ID')
            setCommentError('Task ID is missing. Please refresh the page.')
            return
        }

        setIsSubmitting(true)
        setCommentError(null)

        try {
            const result = await createTaskComment({
                taskId: task.id,
                content: newComment,
                replyToId: replyingTo?.id || null,
            })
            if (result?.success && result.comment) {
                setNewComment("")
                setReplyingTo(null)
                setCommentError(null)
                return
            }
            setCommentError(result?.error || 'Failed to add comment')
        } catch (err: unknown) {
            console.error('Failed to add comment:', err)
            setCommentError((err as Error)?.message || 'Network error. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const uploadFile = async (file: File) => {
        if (file.size > MAX_ATTACHMENT_SIZE) {
            setCommentError(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the 50MB upload limit.`)
            return
        }
        setIsSubmitting(true)
        setCommentError(null)
        setUploadProgress(15)
        setUploadingFileName(file.name)

        try {
            const formData = new FormData()
            formData.append('file', file)
            const result = await uploadTaskAttachment(task.id, formData)
            if (result?.error) {
                throw new Error(result.error)
            }
            setUploadProgress(100)
        } catch (err: unknown) {
            console.error('Upload error:', err)
            setCommentError((err as Error).message || 'Failed to upload file. Please try again.')
        } finally {
            window.setTimeout(() => setUploadProgress(null), 150)
            setIsSubmitting(false)
            setUploadingFileName(null)
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        await uploadFile(file)
        e.target.value = ''
    }

    const fileInputRef = useRef<HTMLInputElement>(null)
    const handleClickUpload = () => {
        fileInputRef.current?.click()
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) {
            await uploadFile(files[0])
        }
    }

    const handleDeleteAttachment = async (attachmentId: string) => {
        // Optimistically mark as deleting
        setDeletingIds(prev => new Set(prev).add(attachmentId))

        // clear existing timeout if any (shouldn't happen but for safety)
        if (deleteTimeouts.current.has(attachmentId)) {
            clearTimeout(deleteTimeouts.current.get(attachmentId)!)
        }

        const timeout = setTimeout(async () => {
            // Actual delete after delay
            setIsSubmitting(true)
            try {
                const result = await deleteTaskAttachment(task.id, attachmentId)
                if (result?.success) {
                    // Remove from deleting set
                    setDeletingIds(prev => {
                        const next = new Set(prev)
                        next.delete(attachmentId)
                        return next
                    })
                } else {
                    setCommentError(result?.error || 'Failed to delete file')
                    // Revert deleting state
                    setDeletingIds(prev => {
                        const next = new Set(prev)
                        next.delete(attachmentId)
                        return next
                    })
                }
            } catch (err) {
                console.error('Delete error:', err)
                setCommentError('Failed to delete file. Please try again.')
                // Revert deleting state
                setDeletingIds(prev => {
                    const next = new Set(prev)
                    next.delete(attachmentId)
                    return next
                })
            } finally {
                setIsSubmitting(false)
                deleteTimeouts.current.delete(attachmentId)
            }
        }, 4000) // 4 seconds undo window

        deleteTimeouts.current.set(attachmentId, timeout)
    }

    const handleUndoDelete = (attachmentId: string) => {
        if (deleteTimeouts.current.has(attachmentId)) {
            clearTimeout(deleteTimeouts.current.get(attachmentId)!)
            deleteTimeouts.current.delete(attachmentId)
            setDeletingIds(prev => {
                const next = new Set(prev)
                next.delete(attachmentId)
                return next
            })
        }
    }



    const handleDeleteComment = async (commentId: string) => {
        try {
            const result = await deleteTaskComment(task.id, commentId)
            if (result?.success) {
                setReplyingTo((current) => (current?.id === commentId ? null : current))
            } else {
                setCommentError(result?.error || 'Failed to delete comment')
            }
        } catch (err) {
            console.error('Failed to delete comment:', err)
            setCommentError('Failed to delete comment')
        }
    }

    function handleConfirmDeleteTask() {
        onOpenChange(false)
        onTaskDeleted?.(task.id)
        deleteTask(task.id, projectId).catch((err) => {
            console.error("Delete task error:", err)
        })
    }

    // Force download helper (works with cross-origin URLs like Vercel Blob)
    const forceDownload = async (url: string, filename: string) => {
        try {
            const response = await fetch(url)
            const blob = await response.blob()
            const blobUrl = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = blobUrl
            link.download = filename
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            window.URL.revokeObjectURL(blobUrl)
        } catch (err) {
            console.error('Download failed:', err)
            // Fallback: open in new tab
            window.open(url, '_blank')
        }
    }

    const downloadAllAttachments = async () => {
        for (const attachment of attachments) {
            const { download } = getAttachmentUrls(attachment)
            await forceDownload(download, attachment.name)
            // Small delay between downloads
            await new Promise(resolve => setTimeout(resolve, 300))
        }
    }

    const daysActive = task.createdAt
        ? Math.floor((new Date().getTime() - new Date(task.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0
    const isReviewColumn = task.column?.name === 'Review'
    const isAdminOrLead = userRole === 'Admin' || userRole === 'Team Lead'
    const showReviewButtons = isReviewColumn && isAdminOrLead
    const assigneeUsers =
        task.assignees && task.assignees.length > 0
            ? task.assignees.map(a => a.user)
            : task.assignee?.name
                ? [{ id: task.assignee.id ?? 'legacy', name: task.assignee.name }]
                : []

    const handleAccept = async () => {
        if (!projectId) return

        setIsProcessingReview(true)
        try {
            const doneColumn = (projectColumns ?? []).find((c: { name: string }) => c.name === 'Done')

            if (!doneColumn) {
                alert('Done column not found')
                setIsProcessingReview(false)
                return
            }

            const result = await acceptReviewTask(task.id, doneColumn.id, projectId)
            if (result.error) {
                alert(result.error)
            } else {
                if (result.task && onTaskUpdated) {
                    onTaskUpdated(result.task)
                }
                onOpenChange(false)
            }
        } catch (error) {
            console.error('Failed to accept task:', error)
            alert('Failed to accept task')
        } finally {
            setIsProcessingReview(false)
        }
    }

    const handleDeny = async () => {
        if (!projectId) return

        setIsProcessingReview(true)
        try {
            const inProgressColumn = (projectColumns ?? []).find((c: { name: string }) => c.name === 'In Progress')

            if (!inProgressColumn) {
                alert('In Progress column not found')
                setIsProcessingReview(false)
                return
            }

            const result = await denyReviewTask(task.id, inProgressColumn.id, projectId)
            if (result.error) {
                alert(result.error)
            } else {
                if (result.task && onTaskUpdated) {
                    onTaskUpdated(result.task)
                }
                onOpenChange(false)
            }
        } catch (error) {
            console.error('Failed to deny task:', error)
            alert('Failed to deny task')
        } finally {
            setIsProcessingReview(false)
        }
    }

    return (
        <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] md:max-w-2xl h-[90vh] flex flex-col p-0 gap-0" showCloseButton={false}>
                <div
                    className="flex flex-col h-full w-full relative"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {/* Header */}
                    <DialogHeader className="px-3 py-2 border-b shrink-0">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <DialogTitle className="text-sm font-semibold">{task.title}</DialogTitle>
                                    {task.column?.name && (
                                        <span className="text-[9px] text-muted-foreground/50 shrink-0">{task.column.name}</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-1.5">
                                    {assigneeUsers.length > 0 ? (
                                        <>
                                            <div className="flex -space-x-[5px]">
                                                {assigneeUsers.map((u, i) => (
                                                    <Avatar
                                                        key={u.id}
                                                        className="relative h-6 w-6 shrink-0 bg-background text-[10px] ring-2 ring-background"
                                                        title={u.name}
                                                        style={{ zIndex: 30 - i }}
                                                    >
                                                        <AvatarFallback className="bg-primary/5 text-primary">
                                                            {getInitials(u.name)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                ))}
                                            </div>
                                            <span className="text-[10px] text-muted-foreground truncate">
                                                {assigneeUsers.map(u => u.name).join(', ')}
                                            </span>
                                        </>
                                    ) : (
                                        <span className="text-[10px] text-muted-foreground">Unassigned</span>
                                    )}
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={onEdit} className="shrink-0 h-6 w-6 border-0 text-muted-foreground hover:text-foreground">
                                <Pencil className="h-3 w-3" />
                            </Button>
                            {showDeleteConfirm && (
                                <button
                                    onClick={handleConfirmDeleteTask}
                                    className="shrink-0 h-6 px-2 rounded text-[10px] font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 transition-colors border-0 cursor-pointer"
                                >
                                    Confirm?
                                </button>
                            )}
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setShowDeleteConfirm(prev => !prev)}
                                className="shrink-0 h-6 w-6 border-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    </DialogHeader>

                    {/* Main Content - Native Scrollable Div */}
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        <div className="p-3 space-y-3">
                            {/* Task Details - Description and Instructions */}
                            {(task.description || instructionsFile) && (
                                <div className="space-y-3 pt-1">
                                    <div className="rounded-lg bg-muted/30 p-3 space-y-3">
                                        {/* Description */}
                                        {task.description && (
                                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                                <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
                                                    {task.description.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
                                                        if (part.match(/^https?:\/\//)) {
                                                            return (
                                                                <a
                                                                    key={i}
                                                                    href={part}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-primary hover:underline break-all"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    {part}
                                                                </a>
                                                            )
                                                        }
                                                        return <span key={i}>{part}</span>
                                                    })}
                                                </p>
                                            </div>
                                        )}

                                        {/* Separator if both exist */}
                                        {task.description && instructionsFile && (
                                            <div className="h-px bg-border/50" />
                                        )}

                                        {/* Instructions File */}
                                        {instructionsFile && (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                                        <FileText className="h-3.5 w-3.5" />
                                                        Instructions File
                                                    </span>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            forceDownload(instructionsFile.url, instructionsFile.name)
                                                        }}
                                                        className="h-6 text-[10px] gap-1 px-2.5 inline-flex items-center bg-background border rounded-full hover:bg-muted transition-colors shadow-sm"
                                                        title="Download"
                                                    >
                                                        <Download className="h-3 w-3" />
                                                        Download
                                                    </button>
                                                </div>
                                                <div
                                                    className="bg-background rounded-md border overflow-hidden cursor-pointer hover:ring-2 ring-primary/20 transition-all shadow-sm group/preview"
                                                    onClick={() => setShowInstructionsFullscreen(true)}
                                                >
                                                    {isImageFile(instructionsFile.name) ? (
                                                        <div className="relative">
                                                            <img
                                                                src={instructionsFile.url}
                                                                alt="Instructions"
                                                                className={`w-full max-h-48 object-contain bg-muted/20 ${isSvgFile(instructionsFile.name) ? 'dark:bg-white p-2' : ''}`}
                                                            />
                                                            <div className="absolute inset-0 bg-black/0 group-hover/preview:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover/preview:opacity-100">
                                                                <span className="bg-background/90 text-foreground text-[10px] font-medium px-2 py-1 rounded shadow-sm">
                                                                    Click to expand
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ) : isPdfFile(instructionsFile.name) ? (
                                                        <div className="h-40 flex items-center justify-center bg-white relative">
                                                            <div className="absolute inset-0 bg-transparent z-10" /> {/* Click overlay */}
                                                            <iframe
                                                                src={instructionsFile.url}
                                                                className="w-full h-full opacity-60"
                                                                title="Instructions PDF"
                                                            />
                                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                                <div className="bg-white/90 px-3 py-1.5 rounded-full shadow-sm text-xs font-medium text-slate-700 flex items-center gap-1.5">
                                                                    <Maximize2 className="h-3 w-3" />
                                                                    Preview PDF
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="p-4 text-center bg-muted/10">
                                                            <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                                                            <p className="text-sm font-medium truncate px-4">{instructionsFile.name}</p>
                                                            <p className="text-[10px] text-muted-foreground mt-1">Click to download</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Files Section */}
                            <div className="border-t pt-2">
                                <div className="flex items-center justify-between mb-1.5 gap-2">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className="text-[10px] font-medium shrink-0">
                                            Files ({attachments.length})
                                        </span>
                                        <div className="text-[10px] text-muted-foreground whitespace-nowrap overflow-x-auto scrollbar-none">
                                            Uploads go to: {uploadsPath || (task.attachmentFolderId ? (task.attachmentFolderName || "Drive Folder") : "Blob storage")}
                                        </div>
                                    </div>
                                    {attachments.length > 0 && (
                                        <button
                                            onClick={downloadAllAttachments}
                                            className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted transition-colors shrink-0"
                                        >
                                            <Download className="h-2.5 w-2.5" />
                                            Download All
                                        </button>
                                    )}
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                    disabled={isSubmitting}
                                />
                                {/* Upload Progress Bar */}
                                {uploadProgress !== null && (
                                    <div className="mb-2 animate-in fade-in">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                                                Uploading: {uploadingFileName}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">{uploadProgress}%</span>
                                        </div>
                                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary transition-all duration-200 ease-out"
                                                style={{ width: `${uploadProgress}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                                {/* Unified Attachments List */}
                                <div className="w-full overflow-x-auto overflow-y-hidden custom-scrollbar -mx-3 px-3">
                                    <div className="flex gap-2 pb-2 min-w-max">
                                        {/* Render all attachments */}
                                        {attachments.map(a => {
                                            const { preview, fallbackPreview, download } = getAttachmentUrls(a) as { preview: string; download: string; fallbackPreview?: string }
                                            const enlargeUrl = fallbackPreview || preview
                                            if (deletingIds.has(a.id)) {
                                                return (
                                                    <div key={a.id} className="relative group bg-muted/80 rounded overflow-hidden border border-border shrink-0 w-24 h-24 flex flex-col items-center justify-center gap-1.5">
                                                        <span className="text-[10px] text-muted-foreground font-medium">Removed</span>
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            className="h-6 text-[10px] px-3"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                handleUndoDelete(a.id)
                                                            }}
                                                        >
                                                            Undo
                                                        </Button>
                                                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary/60 origin-left animate-[shrink_4s_linear]" style={{ animationDuration: '4s' }} />
                                                    </div>
                                                )
                                            }
                                            if (isImageFile(a.name)) {
                                                return (
                                                    <div key={a.id} className={`relative group bg-muted/50 rounded overflow-hidden border border-muted shrink-0 w-24 h-24 flex-shrink-0 ${isSvgFile(a.name) ? 'dark:bg-white' : ''}`}>
                                                        <img
                                                            src={preview}
                                                            alt={a.name}
                                                            className="w-full h-full object-cover pointer-events-none select-none"
                                                            loading="lazy"
                                                            onError={(e) => {
                                                                if (fallbackPreview && e.currentTarget.src !== fallbackPreview) {
                                                                    e.currentTarget.src = fallbackPreview
                                                                    return
                                                                }
                                                                if (download && e.currentTarget.src !== download) {
                                                                    e.currentTarget.src = download
                                                                }
                                                            }}
                                                        />
                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 z-20">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    setEnlargedImage({ url: enlargeUrl, name: a.name })
                                                                }}
                                                                className="p-1.5 bg-background/90 rounded hover:bg-background shadow-sm"
                                                                title="Enlarge"
                                                            >
                                                                <Maximize2 className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    handleDeleteAttachment(a.id)
                                                                }}
                                                                className="p-1.5 bg-background/90 rounded hover:bg-destructive/20 shadow-sm"
                                                                title="Delete"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                                            </button>
                                                        </div>
                                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-[7px] px-1 py-1 pointer-events-none">
                                                            <div className="truncate font-medium">{a.name}</div>
                                                        </div>
                                                    </div>
                                                )
                                            } else {
                                                // PDF & Files
                                                return (
                                                    <div key={a.id} className="relative group w-24 h-24 bg-muted/50 rounded border border-muted flex flex-col items-center justify-center text-center p-2 shrink-0">
                                                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex gap-1">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    forceDownload(download, a.name)
                                                                }}
                                                                className="p-1 bg-background/90 rounded hover:bg-background shadow-sm"
                                                                title="Download"
                                                            >
                                                                <Download className="w-3 h-3" />
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    handleDeleteAttachment(a.id)
                                                                }}
                                                                className="p-1 bg-background/90 rounded hover:bg-destructive/20 shadow-sm"
                                                                title="Delete"
                                                            >
                                                                <Trash2 className="w-3 h-3 text-destructive" />
                                                            </button>
                                                        </div>

                                                        <a
                                                            href={download}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex flex-col items-center justify-center w-full h-full gap-1 group-hover:opacity-50 transition-opacity"
                                                        >
                                                            <FileText className={`h-8 w-8 ${isPdfFile(a.name) ? 'text-red-400' : 'text-blue-400'}`} />
                                                            <div className="w-full overflow-hidden">
                                                                <p className="text-[9px] font-medium truncate w-full px-1">{a.name}</p>
                                                                <p className="text-[8px] text-muted-foreground">{formatFileSize(a.size)}</p>
                                                            </div>
                                                        </a>
                                                    </div>
                                                )
                                            }
                                        })}

                                        {/* Upload Box */}
                                        <div
                                            onClick={handleClickUpload}
                                            className="w-24 h-24 border-2 border-dashed rounded flex flex-col items-center justify-center cursor-pointer transition-colors border-muted bg-muted/30 hover:bg-muted/50 shrink-0"
                                        >
                                            <Upload className="h-4 w-4 text-muted-foreground" />
                                            <p className="text-[8px] text-muted-foreground mt-0.5">Add</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Checklist Section - Only shown if task has checklist items */}
                            {checklistCount > 0 && (
                                <div className="border-t pt-3">
                                    <TaskChecklist taskId={task.id} isEditable={true} />
                                </div>
                            )}

                            {/* Comments Section */}
                            <div className="border-t pt-2 flex flex-col min-h-0">
                                {liveComments === undefined && (
                                    <div className="mb-1.5 shrink-0">
                                        <span className="text-[8px] text-muted-foreground">Loading...</span>
                                    </div>
                                )}

                                {commentError && (
                                    <div className="mb-2 p-1.5 bg-destructive/10 border border-destructive/20 rounded text-[9px] text-destructive shrink-0">
                                        {commentError}
                                    </div>
                                )}

                                {/* Reply Preview */}
                                {replyingTo && (
                                    <div className="flex items-center gap-1.5 bg-primary/10 rounded px-2 py-1 mb-1.5 border-l-2 border-primary shrink-0">
                                        <Reply className="w-3 h-3 text-primary shrink-0" />
                                        <span className="text-[9px] text-muted-foreground">Replying to</span>
                                        <span className="text-[9px] text-primary font-medium">@{replyingTo.authorName || 'Unknown'}</span>
                                        <span className="text-[9px] text-muted-foreground truncate flex-1 min-w-0">{replyingTo.content}</span>
                                        <button
                                            onClick={() => setReplyingTo(null)}
                                            className="p-0.5 hover:bg-background rounded shrink-0"
                                        >
                                            <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                                        </button>
                                    </div>
                                )}

                                {/* Add Comment */}
                                <div className="flex gap-1.5 mb-2 shrink-0">
                                    <Textarea
                                        ref={textareaRef}
                                        placeholder={replyingTo ? `Reply to ${replyingTo.authorName || 'Unknown'}...` : "Write a comment..."}
                                        value={newComment}
                                        onChange={e => {
                                            setNewComment(e.target.value)
                                            setCommentError(null)
                                        }}
                                        className="text-[10px] min-h-[32px] max-h-[80px] resize-none flex-1 min-w-0"
                                        disabled={isSubmitting}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault()
                                                handleAddComment()
                                            }
                                            if (e.key === 'Escape' && replyingTo) {
                                                setReplyingTo(null)
                                            }
                                        }}
                                    />
                                    <Button
                                        size="sm"
                                        onClick={handleAddComment}
                                        disabled={!newComment.trim() || isSubmitting}
                                        className="shrink-0 h-auto px-2"
                                    >
                                        <Send className={`h-3 w-3 ${isSubmitting ? 'opacity-50' : ''}`} />
                                    </Button>
                                </div>

                                {/* Comments List - Scrollable */}
                                {comments.length > 0 ? (
                                    <div className="flex-1 min-h-0 max-h-[400px]">
                                        <div className="h-full overflow-y-auto overflow-x-hidden custom-scrollbar pr-2">
                                            <div className="pb-4">
                                                {(() => {
                                                    try {
                                                        const tree = buildCommentTree(comments)
                                                        return tree.map(comment => (
                                                            <CommentNode
                                                                key={comment.id}
                                                                comment={comment}
                                                                userRole={userRole}
                                                                currentUserId={currentUser?.id}
                                                                onReply={(c) => {
                                                                    setReplyingTo(c)
                                                                    textareaRef.current?.focus()
                                                                }}
                                                                onDelete={handleDeleteComment}
                                                            />
                                                        ))
                                                    } catch (e) {
                                                        console.error("Error building comment tree:", e)
                                                        return <div className="text-destructive text-[10px]">Error loading comments.</div>
                                                    }
                                                })()}
                                                <div ref={commentsEndRef} />
                                            </div>
                                        </div>
                                    </div>
                                ) : liveComments !== undefined && (
                                    <div className="text-[9px] text-muted-foreground italic py-4 text-center shrink-0">
                                        No comments yet. Be the first to comment!
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="border-t px-3 py-2 shrink-0 flex items-center justify-end text-[10px] text-muted-foreground">
                        <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1" suppressHydrationWarning>
                                <Clock className="h-2.5 w-2.5" />
                                {daysActive}d active
                            </span>
                            {showReviewButtons && (
                                <>
                                    <span className="text-muted-foreground/30">•</span>
                                    <Button
                                        onClick={handleAccept}
                                        disabled={isProcessingReview}
                                        size="sm"
                                        className="h-6 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white"
                                    >
                                        <CheckCircle className="h-3 w-3 mr-1" />
                                        Accept
                                    </Button>
                                    <Button
                                        onClick={handleDeny}
                                        disabled={isProcessingReview}
                                        size="sm"
                                        className="h-6 text-[10px] bg-red-600 hover:bg-red-700 text-white"
                                    >
                                        <XCircle className="h-3 w-3 mr-1" />
                                        Deny
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>

                    {isDragging && (
                        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center border-2 border-dashed border-primary m-4 rounded-lg pointer-events-none">
                            <div className="text-center">
                                <Upload className="h-10 w-10 text-primary mx-auto mb-2" />
                                <p className="text-sm font-medium">Drop files to upload</p>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>

            {/* Image Enlargement Modal */}
            {enlargedImage && (
                <Dialog open={!!enlargedImage} onOpenChange={() => setEnlargedImage(null)}>
                    <DialogContent className="max-w-4xl max-h-[90vh] p-0">
                        <DialogHeader className="sr-only">
                            <DialogTitle>Enlarged Image</DialogTitle>
                        </DialogHeader>
                        <div className={`relative ${isSvgFile(enlargedImage.name) ? 'dark:bg-white dark:rounded-lg dark:p-2' : ''}`}>
                            <img
                                src={enlargedImage.url}
                                alt="Enlarged"
                                className="w-full h-auto max-h-[85vh] object-contain"
                            />
                            <div className="absolute top-2 right-2 flex gap-2">
                                <button
                                    onClick={() => forceDownload(enlargedImage.url, enlargedImage.name)}
                                    className="p-2 bg-background/80 rounded hover:bg-background"
                                    title="Download"
                                >
                                    <Download className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setEnlargedImage(null)}
                                    className="p-2 bg-background/80 rounded hover:bg-background"
                                    title="Close"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {/* Instructions File Fullscreen Modal */}
            {showInstructionsFullscreen && instructionsFile && (
                <Dialog open={showInstructionsFullscreen} onOpenChange={() => setShowInstructionsFullscreen(false)}>
                    <DialogContent className="max-w-5xl max-h-[95vh] p-0 overflow-hidden flex flex-col">
                        <DialogHeader className="p-4 border-b shrink-0">
                            <DialogTitle className="flex items-center gap-2 pr-8">
                                <FileText className="h-5 w-5" />
                                Instructions: {instructionsFile.name}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="flex-1 min-h-0 overflow-auto bg-muted/30">
                            {isImageFile(instructionsFile.name) ? (
                                <div className={`p-4 flex items-center justify-center min-h-full ${isSvgFile(instructionsFile.name) ? 'dark:bg-white dark:rounded-lg dark:m-4' : ''}`}>
                                    <img
                                        src={instructionsFile.url}
                                        alt="Instructions"
                                        className="max-w-full max-h-[calc(95vh-80px)] object-contain"
                                    />
                                </div>
                            ) : isPdfFile(instructionsFile.name) ? (
                                <iframe
                                    src={instructionsFile.url}
                                    className="w-full h-[calc(95vh-80px)]"
                                    title="Instructions PDF"
                                />
                            ) : (
                                <div className="p-8 text-center">
                                    <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                                    <p className="text-lg font-medium mb-2">{instructionsFile.name}</p>
                                    <p className="text-sm text-muted-foreground mb-4">
                                        This file type cannot be previewed directly.
                                    </p>
                                    <button
                                        onClick={() => forceDownload(instructionsFile.url, instructionsFile.name)}
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
                                    >
                                        <Download className="w-4 h-4" />
                                        Download File
                                    </button>
                                </div>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            )}

        </Dialog>

        </>
    )
}
