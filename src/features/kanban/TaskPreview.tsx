"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { acceptReviewTask, denyReviewTask } from "@/app/actions/kanban"
import {
    Pencil, Calendar, User, Clock,
    Send, FileText, Upload, Reply, X, Download, Maximize2, Trash2, CheckCircle, XCircle, ListChecks
} from "lucide-react"
import { getInitials } from "@/lib/utils"
import { TaskChecklist } from "@/components/TaskChecklist"
import { HelpRequest } from "@/components/HelpRequest"

type Task = {
    id: string
    title: string
    description?: string | null
    status?: string
    startDate?: Date | string | null
    endDate?: Date | string | null
    dueDate?: Date | string | null
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
    createdAt: string
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
    createdAt: string
    storageProvider?: string
    externalId?: string | null
}

type TaskPreviewProps = {
    task: Task
    open: boolean
    onOpenChange: (open: boolean) => void
    onEdit: () => void
    projectId: string
    onTaskUpdated?: (task: Task) => void
}

const formatTimeAgo = (date: string) => {
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
    if (attachment.storageProvider === 'google' && attachment.externalId) {
        return {
            preview: `https://drive.google.com/uc?export=view&id=${attachment.externalId}`,
            download: `https://drive.google.com/uc?export=download&id=${attachment.externalId}`
        }
    }
    return { preview: attachment.url, download: attachment.url }
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

const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return '—'
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

export function TaskPreview({ task, open, onOpenChange, onEdit, projectId, onTaskUpdated }: TaskPreviewProps) {
    const [comments, setComments] = useState<Comment[]>([])
    const [attachments, setAttachments] = useState<Attachment[]>([])
    const [newComment, setNewComment] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isLoadingComments, setIsLoadingComments] = useState(false)
    const [commentError, setCommentError] = useState<string | null>(null)
    const [replyingTo, setReplyingTo] = useState<Comment | null>(null)
    const [enlargedImage, setEnlargedImage] = useState<{ url: string; name: string } | null>(null)
    const [userRole, setUserRole] = useState<string>('Member')
    const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null)
    const [isProcessingReview, setIsProcessingReview] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [instructionsFile, setInstructionsFile] = useState<{ url: string; name: string } | null>(null)
    const [showInstructionsFullscreen, setShowInstructionsFullscreen] = useState(false)
    const commentsEndRef = useRef<HTMLDivElement>(null)
    const [uploadProgress, setUploadProgress] = useState<number | null>(null)
    const [uploadingFileName, setUploadingFileName] = useState<string | null>(null)
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
    const deleteTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map())
    const [checklistCount, setChecklistCount] = useState<number>(0)

    // Scroll to bottom on new comments
    useEffect(() => {
        if (commentsEndRef.current) {
            commentsEndRef.current.scrollIntoView({ behavior: "smooth" })
        }
    }, [comments.length])

    // Fetch user role and info
    useEffect(() => {
        if (open) {
            fetch('/api/auth/role')
                .then(res => res.json())
                .then(data => {
                    setUserRole(data.role || 'Member')
                    if (data.id) {
                        setCurrentUser({ id: data.id, name: data.name })
                    }
                })
                .catch(() => {
                    setUserRole('Member')
                    setCurrentUser(null)
                })
        }
    }, [open])

    // Track last comment time for incremental polling
    const lastCommentTime = useRef<string | null>(null)
    const commentCount = useRef<number>(0)

    // Full fetch - get all comments
    const fetchComments = async () => {
        if (!task.id) return
        setIsLoadingComments(true)
        setCommentError(null)
        try {
            const res = await fetch(`/api/tasks/${task.id}/comments`)
            if (res.ok) {
                const data = await res.json()
                const newComments = Array.isArray(data.comments) ? data.comments : (Array.isArray(data) ? data : [])
                setComments(newComments)
                commentCount.current = newComments.length
                if (newComments.length > 0) {
                    lastCommentTime.current = newComments[newComments.length - 1].createdAt
                }
            } else {
                setCommentError('Failed to load comments')
            }
        } catch (err) {
            console.error('Failed to fetch comments:', err)
            setCommentError('Failed to load comments')
        } finally {
            setIsLoadingComments(false)
        }
    }

    // Lightweight poll - check for new comments
    const checkNewComments = async () => {
        if (!task.id || !lastCommentTime.current) return
        try {
            const since = encodeURIComponent(lastCommentTime.current)
            const res = await fetch(`/api/tasks/${task.id}/comments?since=${since}`)
            if (res.ok) {
                const data = await res.json()
                if (data.hasNew && data.comments?.length > 0) {
                    // Append new comments
                    setComments(prev => {
                        const newOnes = data.comments.filter(
                            (c: Comment) => !prev.some(p => p.id === c.id)
                        )
                        if (newOnes.length > 0) {
                            const updated = [...prev, ...newOnes]
                            lastCommentTime.current = updated[updated.length - 1].createdAt
                            commentCount.current = updated.length
                            return updated
                        }
                        return prev
                    })
                }
            }
        } catch (err) {
            // Silent fail
        }
    }

    const fetchAttachments = async () => {
        if (!task.id) return
        try {
            const res = await fetch(`/api/tasks/${task.id}/attachments`)
            if (res.ok) {
                const data = await res.json()
                setAttachments(Array.isArray(data) ? data : [])
            }
        } catch (err) {
            console.error('Failed to fetch attachments:', err)
        }
    }

    const fetchInstructions = async () => {
        if (!task.id) return
        try {
            const res = await fetch(`/api/tasks/${task.id}/instructions`)
            if (res.ok) {
                const data = await res.json()
                if (data.url && data.name) {
                    setInstructionsFile({ url: data.url, name: data.name })
                } else {
                    setInstructionsFile(null)
                }
            }
        } catch (err) {
            console.error('Failed to fetch instructions:', err)
        }
    }

    const fetchChecklistCount = async () => {
        if (!task.id) return
        try {
            const res = await fetch(`/api/tasks/${task.id}/checklist`)
            if (res.ok) {
                const data = await res.json()
                setChecklistCount(Array.isArray(data) ? data.length : 0)
            }
        } catch (err) {
            console.error('Failed to fetch checklist:', err)
        }
    }

    useEffect(() => {
        if (open && task.id) {
            // Initial full fetch
            fetchComments()
            fetchAttachments()
            fetchInstructions()
            fetchChecklistCount()

            // Smart polling - check for new comments every 3 seconds (lightweight)
            const interval = setInterval(() => {
                checkNewComments()
            }, 3000)

            return () => clearInterval(interval)
        } else {
            // Reset state when dialog closes
            setComments([])
            setAttachments([])
            setNewComment("")
            setCommentError(null)
            setReplyingTo(null)
            setInstructionsFile(null)
            setShowInstructionsFullscreen(false)
            lastCommentTime.current = null
            commentCount.current = 0
            setChecklistCount(0)
        }
    }, [open, task.id])

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

            const res = await fetch(`/api/tasks/${task.id}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: newComment,
                    replyToId: replyingTo?.id || null
                })
            })



            let responseText = ''
            let data: Comment | { error?: string, message?: string, details?: string, id?: string } | null = null

            try {
                responseText = await res.text()

                if (responseText) {
                    data = JSON.parse(responseText)
                } else {
                    console.warn('Empty response body')
                    data = {}
                }
            } catch (parseError: unknown) {
                console.error('Failed to parse response:', parseError)
                console.error('Response text that failed to parse:', responseText)
                setCommentError(`Invalid response from server: ${(parseError as Error)?.message || 'Parse error'}`)
                setIsSubmitting(false)
                return
            }

            if (res.ok) {
                if (data && 'id' in data && typeof data.id === 'string') {
                    const comment = data as Comment
                    setComments(prev => [...prev, comment])
                    setNewComment("")
                    setReplyingTo(null)
                    setCommentError(null)
                    return // Success!
                }
            }

            // More descriptive error for debugging
            const errorData = data as { error?: string, message?: string, details?: string } | null
            const errorMessage = errorData?.error || errorData?.message || errorData?.details || `Server error (${res?.status || 'unknown'} ${res?.statusText || ''})`
            console.error('[COMMENT ERROR]', { status: res.status, data });
            setCommentError(errorMessage)
        } catch (err: unknown) {
            console.error('Failed to add comment:', err)
            setCommentError((err as Error)?.message || 'Network error. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const uploadFile = async (file: File) => {
        if (file.size > 4.5 * 1024 * 1024) {
            setCommentError(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds Vercel's 4.5MB free tier limit.`)
            return
        }
        setIsSubmitting(true)
        setCommentError(null)
        setUploadProgress(0)
        setUploadingFileName(file.name)

        try {
            const formData = new FormData()
            formData.append('file', file)

            // Use XMLHttpRequest for progress tracking
            const xhr = new XMLHttpRequest()

            const uploadPromise = new Promise<Attachment>((resolve, reject) => {
                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        const progress = Math.round((event.loaded / event.total) * 100)
                        setUploadProgress(progress)
                    }
                })

                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const response = JSON.parse(xhr.responseText)
                            resolve(response)
                        } catch {
                            reject(new Error('Failed to parse response'))
                        }
                    } else {
                        try {
                            const error = JSON.parse(xhr.responseText)
                            reject(new Error(error.error || 'Failed to upload file'))
                        } catch {
                            reject(new Error('Failed to upload file'))
                        }
                    }
                })

                xhr.addEventListener('error', () => reject(new Error('Network error')))
                xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')))

                xhr.open('POST', `/api/tasks/${task.id}/attachments`)
                xhr.send(formData)
            })

            const attachment = await uploadPromise
            setAttachments(prev => [...prev, attachment])
            // Refresh attachments list to get proper order
            fetchAttachments()
        } catch (err: unknown) {
            console.error('Upload error:', err)
            setCommentError((err as Error).message || 'Failed to upload file. Please try again.')
        } finally {
            setIsSubmitting(false)
            setUploadProgress(null)
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
                const res = await fetch(`/api/tasks/${task.id}/attachments?attachmentId=${attachmentId}`, {
                    method: 'DELETE'
                })
                if (res.ok) {
                    setAttachments(prev => prev.filter(a => a.id !== attachmentId))
                    // Remove from deleting set
                    setDeletingIds(prev => {
                        const next = new Set(prev)
                        next.delete(attachmentId)
                        return next
                    })
                } else {
                    const error = await res.json().catch(() => ({ error: 'Failed to delete file' }))
                    setCommentError(error.error || 'Failed to delete file')
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
            const res = await fetch(`/api/tasks/${task.id}/comments?commentId=${commentId}`, {
                method: 'DELETE'
            })

            if (res.ok) {
                // Optimistically remove from UI
                const removeFromTree = (nodes: CommentWithReplies[]): CommentWithReplies[] => {
                    return nodes.filter(node => {
                        if (node.id === commentId) return false
                        if (node.replies.length > 0) {
                            node.replies = removeFromTree(node.replies)
                        }
                        return true
                    })
                }
                // Refresh comments to be sure
                fetchComments()
            }
        } catch (err) {
            console.error('Failed to delete comment:', err)
        }
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
    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.column?.name !== 'Done'
    const isReviewColumn = task.column?.name === 'Review'
    const isAdminOrLead = userRole === 'Admin' || userRole === 'Team Lead'
    const showReviewButtons = isReviewColumn && isAdminOrLead

    const handleAccept = async () => {
        if (!projectId) return

        setIsProcessingReview(true)
        try {
            // Find the Done column
            const response = await fetch(`/api/projects/${projectId}/columns`)
            if (!response.ok) throw new Error('Failed to fetch columns')

            const columns = await response.json()
            const doneColumn = columns.find((c: { name: string }) => c.name === 'Done')

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
            // Find the In Progress column
            const response = await fetch(`/api/projects/${projectId}/columns`)
            if (!response.ok) throw new Error('Failed to fetch columns')

            const columns = await response.json()
            const inProgressColumn = columns.find((c: { name: string }) => c.name === 'In Progress')

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
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] md:max-w-2xl h-[90vh] flex flex-col p-0 gap-0" showCloseButton={false}>
                <div
                    className="flex flex-col h-full w-full relative"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {/* Header */}
                    {/* Header */}
                    <DialogHeader className="px-3 py-2 border-b shrink-0">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <DialogTitle className="text-sm font-semibold">{task.title}</DialogTitle>
                                    {task.column?.name && (
                                        <span className="text-[9px] text-muted-foreground/50 shrink-0">{task.column.name}</span>
                                    )}
                                    {isOverdue && <Badge variant="destructive" className="text-[9px] h-4">Overdue</Badge>}
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={onEdit} className="shrink-0 h-6 w-6 border-0">
                                <Pencil className="h-3 w-3" />
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
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-medium">
                                        Files ({attachments.length})
                                    </span>
                                    {attachments.length > 0 && (
                                        <button
                                            onClick={downloadAllAttachments}
                                            className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
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
                                            const { preview, download } = getAttachmentUrls(a)
                                            if (deletingIds.has(a.id)) {
                                                return (
                                                    <div key={a.id} className="relative group bg-muted/80 rounded overflow-hidden border border-border shrink-0 w-24 h-24 flex flex-col items-center justify-center gap-1.5">
                                                        <span className="text-[10px] text-muted-foreground font-medium">Removing...</span>
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
                                                        />
                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 z-20">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    setEnlargedImage({ url: preview, name: a.name })
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
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-medium flex items-center gap-1">
                                            <ListChecks className="h-3 w-3" />
                                            Checklist
                                        </span>
                                    </div>
                                    <TaskChecklist taskId={task.id} isEditable={true} />
                                </div>
                            )}

                            {/* Comments Section */}
                            <div className="border-t pt-2 flex flex-col min-h-0">
                                {isLoadingComments && (
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
                                ) : !isLoadingComments && (
                                    <div className="text-[9px] text-muted-foreground italic py-4 text-center shrink-0">
                                        No comments yet. Be the first to comment!
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Footer with Help Request (left) and Task Info (right) */}
                    <div className="border-t px-3 py-2 shrink-0 flex items-center justify-between text-[10px] text-muted-foreground">
                        <HelpRequest
                            taskId={task.id}
                            taskTitle={task.title}
                            currentUserId={currentUser?.id}
                            userRole={userRole}
                        />
                        <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1" suppressHydrationWarning>
                                <Clock className="h-2.5 w-2.5" />
                                {daysActive}d active
                            </span>
                            <span className="text-muted-foreground/30">•</span>
                            <span className="flex items-center gap-1" suppressHydrationWarning>
                                <Calendar className="h-2.5 w-2.5" />
                                {formatDate(task.startDate)} → {formatDate(task.endDate)}
                            </span>
                            <span className="text-muted-foreground/30">•</span>
                            <span className="flex items-center gap-1">
                                <User className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate max-w-[120px]">
                                    {task.assignees && task.assignees.length > 0
                                        ? task.assignees.map(a => a?.user?.name || 'Unknown').join(', ')
                                        : (task.assignee?.name || 'Unassigned')}
                                </span>
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
    )
}
