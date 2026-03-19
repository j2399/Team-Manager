"use client"

import { useState } from "react"
import { useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import { Eye, Check, X, Clock, Loader2, Paperclip, MessageSquare, Download, ExternalLink } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"

type Attachment = {
    id: string
    name: string
    url: string
    size: number
    type: string
    createdAt: string | number
}

type Comment = {
    id: string
    content: string
    authorName: string
    createdAt: string | number
}

type ApprovalPreviewProps = {
    task: {
        id: string
        title: string
        description: string | null
        projectId: string
        projectName: string
        projectColor: string
        assignedTo: string[]
        submittedAt: string | null
        commentsCount: number
        attachmentsCount: number
        doneColumnId: string
        inProgressColumnId: string
    }
    onApproved?: () => void
    onDenied?: () => void
}

const getInitials = (name: string) => {
    const parts = name.split(' ')
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    return name.slice(0, 2).toUpperCase()
}

const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatTimeAgo = (date: string | number) => {
    const now = new Date()
    const then = new Date(date)
    const diffMs = now.getTime() - then.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
}

const isImageFile = (filename: string) => {
    return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filename)
}

export function ApprovalPreviewButton({ task, onApproved, onDenied }: ApprovalPreviewProps) {
    const [open, setOpen] = useState(false)
    const [isApproving, setIsApproving] = useState(false)
    const [isDenying, setIsDenying] = useState(false)
    const attachments = useQuery(api.tasks.getAttachments, open ? { taskId: task.id } : "skip") as Attachment[] | undefined
    const comments = useQuery(api.tasks.getComments, open ? { taskId: task.id } : "skip") as Comment[] | undefined
    const { toast } = useToast()

    const pendingText = task.submittedAt ? (() => {
        const days = Math.floor((Date.now() - new Date(task.submittedAt).getTime()) / (1000 * 60 * 60 * 24))
        return days === 0 ? 'Pending today' : `Pending ${days}d`
    })() : null

    const handleApprove = async () => {
        setIsApproving(true)
        try {
            const { acceptReviewTask } = await import("@/app/actions/kanban")
            const result = await acceptReviewTask(task.id, task.doneColumnId, task.projectId)
            if (result?.error) {
                toast({
                    title: "Failed to approve",
                    description: result.error,
                    variant: "destructive"
                })
            } else {
                toast({
                    title: "Task approved",
                    description: "Task moved to Done"
                })
                setOpen(false)
                onApproved?.()
            }
        } catch (error) {
            toast({
                title: "Failed to approve",
                description: "An error occurred",
                variant: "destructive"
            })
        } finally {
            setIsApproving(false)
        }
    }

    const handleDeny = async () => {
        setIsDenying(true)
        try {
            const { denyReviewTask } = await import("@/app/actions/kanban")
            const result = await denyReviewTask(task.id, task.inProgressColumnId, task.projectId)
            if (result?.error) {
                toast({
                    title: "Failed to deny",
                    description: result.error,
                    variant: "destructive"
                })
            } else {
                toast({
                    title: "Task sent back",
                    description: "Task moved back to In Progress"
                })
                setOpen(false)
                onDenied?.()
            }
        } catch (error) {
            toast({
                title: "Failed to deny",
                description: "An error occurred",
                variant: "destructive"
            })
        } finally {
            setIsDenying(false)
        }
    }

    return (
        <>
            <button
                onClick={(e) => {
                    e.stopPropagation()
                    setOpen(true)
                }}
                className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
                title="Preview task"
            >
                <Eye className="h-3.5 w-3.5" />
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
                    <DialogHeader className="shrink-0">
                        <DialogTitle className="text-base font-semibold leading-snug pr-6">
                            {task.title}
                        </DialogTitle>
                        <div className="flex items-center gap-2 mt-2">
                            <div
                                className="text-[10px] px-2 py-0.5 rounded-sm font-medium text-muted-foreground"
                                style={{ background: `linear-gradient(to right, ${task.projectColor}20, transparent)` }}
                            >
                                {task.projectName}
                            </div>
                            {pendingText && (
                                <div className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-sm font-medium bg-muted text-muted-foreground">
                                    <Clock className="w-3 h-3" />
                                    {pendingText}
                                </div>
                            )}
                        </div>
                    </DialogHeader>

                    <ScrollArea className="flex-1 -mx-6 px-6">
                        {/* Description */}
                        {task.description && (
                            <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                                {task.description}
                            </div>
                        )}

                        {/* Assigned To */}
                        {task.assignedTo.length > 0 && (
                            <div className="mt-4">
                                <div className="text-xs font-medium text-muted-foreground mb-2">Submitted by</div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {task.assignedTo.map((name, index) => (
                                        <div key={name + index} className="flex items-center gap-1.5">
                                            <Avatar className="h-5 w-5 text-[9px]">
                                                <AvatarFallback className="bg-primary/5 text-primary">
                                                    {getInitials(name)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <span className="text-xs">{name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {attachments === undefined || comments === undefined ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <>
                                {/* Attachments */}
                                {(attachments ?? []).length > 0 && (
                                    <div className="mt-4">
                                        <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                            <Paperclip className="h-3 w-3" />
                                            Attachments ({(attachments ?? []).length})
                                        </div>
                                        <div className="space-y-2">
                                            {(attachments ?? []).map(attachment => (
                                                <div
                                                    key={attachment.id}
                                                    className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                                                >
                                                    {isImageFile(attachment.name) ? (
                                                        <img
                                                            src={attachment.url}
                                                            alt={attachment.name}
                                                            className="h-10 w-10 object-cover rounded"
                                                        />
                                                    ) : (
                                                        <div className="h-10 w-10 flex items-center justify-center bg-muted rounded">
                                                            <Paperclip className="h-4 w-4 text-muted-foreground" />
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs font-medium truncate">{attachment.name}</div>
                                                        <div className="text-[10px] text-muted-foreground">
                                                            {formatFileSize(attachment.size)}
                                                        </div>
                                                    </div>
                                                    <a
                                                        href={attachment.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                    </a>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Comments */}
                                {(comments ?? []).length > 0 && (
                                    <div className="mt-4">
                                        <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                            <MessageSquare className="h-3 w-3" />
                                            Comments ({(comments ?? []).length})
                                        </div>
                                        <div className="space-y-2">
                                            {(comments ?? []).map(comment => (
                                                <div key={comment.id} className="p-2 rounded-lg bg-muted/30">
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <Avatar className="h-4 w-4 text-[8px]">
                                                            <AvatarFallback className="bg-primary/5 text-primary">
                                                                {getInitials(comment.authorName)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <span className="text-[10px] font-medium">{comment.authorName}</span>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {formatTimeAgo(comment.createdAt)}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground pl-5">
                                                        {comment.content}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {(attachments ?? []).length === 0 && (comments ?? []).length === 0 && !task.description && (
                                    <div className="text-center py-6 text-xs text-muted-foreground">
                                        No additional details
                                    </div>
                                )}
                            </>
                        )}
                    </ScrollArea>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-4 border-t shrink-0">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDeny}
                            disabled={isDenying || isApproving}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                            {isDenying ? (
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            ) : (
                                <X className="h-4 w-4 mr-1.5" />
                            )}
                            Deny
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleApprove}
                            disabled={isApproving || isDenying}
                            className="bg-emerald-600 hover:bg-emerald-700"
                        >
                            {isApproving ? (
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            ) : (
                                <Check className="h-4 w-4 mr-1.5" />
                            )}
                            Approve
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
