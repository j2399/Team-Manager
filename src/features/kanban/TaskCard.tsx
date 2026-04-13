"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ArrowLeft, ArrowRight, Clock, CalendarDays, Plus } from "lucide-react"
import { cn, getInitials } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { updateTaskDetails } from "@/app/actions/kanban"
import { useMemo, useRef, useState } from "react"

type TaskCardProps = {
    task: {
        id: string
        title: string
        columnId: string | null
        push?: { id: string; name: string; color: string; status: string } | null
        updatedAt?: Date | string | null
        requireAttachment?: boolean
        assignee?: { id?: string; name: string } | null
        assignees?: { user: { id: string; name: string } }[]
        activityLogs?: { changedByName: string; createdAt: Date | string }[]
        comments?: { createdAt: Date | string }[]
        attachments?: { id: string; createdAt: Date | string }[]
        progress?: number
        enableProgress?: boolean
    }
    overlay?: boolean
    onClick?: (task: TaskCardProps['task']) => void
    isReviewColumn?: boolean
    isDoneColumn?: boolean
    isAdmin?: boolean
    isDragDisabled?: boolean
    isHighlighted?: boolean
    domId?: string
    currentUserId?: string | null
    projectId?: string
    validAssigneeUserIds?: string[]
}

const animateLayoutChanges = () => false

function getPendingReviewText(updatedAt?: Date | string | null) {
    if (!updatedAt) return null

    const days = Math.floor((new Date().getTime() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24))
    return days === 0 ? 'Pending today' : `Pending ${days}d`
}

export function TaskCard({ task, overlay, onClick, isReviewColumn, isDoneColumn, isAdmin, isDragDisabled, isHighlighted, domId, currentUserId, projectId, validAssigneeUserIds = [] }: TaskCardProps) {
    const {
        setNodeRef,
        attributes,
        listeners,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: task.id,
        data: { type: "Task", task },
        disabled: isDragDisabled,
        animateLayoutChanges
    })

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1,
        position: 'relative' as const,
        zIndex: 10,
        touchAction: isDragDisabled ? 'auto' : 'none',
        WebkitUserSelect: 'none' as const,
        userSelect: 'none' as const,
    }

    const reviewPendingText = isReviewColumn ? getPendingReviewText(task.updatedAt) : null

    const assigneeUsers =
        task.assignees && task.assignees.length > 0
            ? task.assignees.map((a) => a.user)
            : task.assignee?.name
                ? [{ id: task.assignee.id ?? "legacy", name: task.assignee.name }]
                : []

    const validAssigneeIdSet = useMemo(() => new Set(validAssigneeUserIds), [validAssigneeUserIds])

    const maxVisibleAssignees = 3
    const visibleAssignees = assigneeUsers.slice(0, maxVisibleAssignees)
    const extraAssigneeCount = Math.max(assigneeUsers.length - visibleAssignees.length, 0)

    const [assignPopoverOpen, setAssignPopoverOpen] = useState(false)
    const [isAssigning, setIsAssigning] = useState(false)

    const handleAssignSelf = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!currentUserId) return
        setIsAssigning(true)
        try {
            await updateTaskDetails(task.id, { assigneeIds: [currentUserId] })
        } finally {
            setIsAssigning(false)
            setAssignPopoverOpen(false)
        }
    }

    // Render Overlay Card (Action of dragging)
    if (overlay) {
        return (
            <div
                className="bg-card border rounded-lg shadow-xl cursor-grabbing p-3 w-[260px] rotate-2 scale-105 border-primary/20 ring-1 ring-primary/20"
                style={{ position: 'relative', zIndex: 100 }}
            >
                <h4 className="text-sm font-medium leading-normal">{task.title}</h4>
                <div className="mt-3 flex justify-between items-center opacity-50">
                    <div className="h-1.5 w-16 bg-muted rounded-full" />
                    <div className="h-6 w-6 rounded-full bg-muted" />
                </div>
            </div>
        )
    }

    // ----------------------------------------------------------------------
    // DONE COLUMN VARIANT
    // ----------------------------------------------------------------------
    if (isDoneColumn) {
        const completionLog = task.activityLogs && task.activityLogs.length > 0 ? task.activityLogs[0] : null
        const completedDate = completionLog?.createdAt ? new Date(completionLog.createdAt) : null
        const completedDateStr = completedDate ? completedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null

        return (
            <div
                ref={setNodeRef}
                id={domId}
                style={style}
                {...attributes}
                {...(isDragDisabled ? {} : listeners)}
                onClick={() => onClick?.(task)}
                className={cn(
                    "group relative isolate flex flex-col gap-1.5 p-3 rounded-lg border transition-colors transition-shadow duration-200 overflow-visible",
                    "bg-emerald-50/40 border-emerald-100 hover:border-emerald-200 hover:shadow-sm dark:bg-emerald-900/10 dark:border-emerald-900/30 dark:hover:border-emerald-800/50",
                    isDragDisabled ? 'cursor-default' : 'cursor-grab'
                )}
            >
                <div className="flex items-start gap-2">
                    <h4 className="text-xs font-medium text-emerald-950/80 dark:text-emerald-100/80 leading-snug line-clamp-2">
                        {task.title}
                    </h4>
                </div>

                {completedDateStr && (
                    <div className="flex items-center gap-1 text-[10px] text-emerald-600/70 dark:text-emerald-400/60">
                        <CalendarDays className="w-3 h-3" />
                        <span>Completed {completedDateStr}</span>
                    </div>
                )}
            </div>
        )
    }

    // ----------------------------------------------------------------------
    // STANDARD / REVIEW CARD
    // ----------------------------------------------------------------------
    return (
        <div
            ref={setNodeRef}
            id={domId}
            style={style}
            {...attributes}
            {...(isDragDisabled ? {} : listeners)}
            onClick={() => onClick?.(task)}
            className={cn(
                "group relative isolate flex flex-col rounded-lg border bg-card p-3 shadow-sm transition-colors transition-shadow duration-200 overflow-visible",
                "hover:shadow-md hover:border-primary/20",
                "border-border",
                isDragDisabled ? 'cursor-default' : 'cursor-grab',
                isHighlighted && 'animate-highlight-bulge'
            )}
        >
            {/* Title */}
            <h4 className="text-sm font-medium leading-snug text-foreground mb-2 line-clamp-2">
                {task.title}
            </h4>

            {/* Meta Row */}
            <div className="flex items-center justify-between gap-2 mt-auto">
                <div className="flex items-center gap-1.5 min-w-0">
                    {isReviewColumn && (
                        reviewPendingText && (
                            <div
                                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-sm font-medium border truncate max-w-[120px] tag-shimmer"
                                style={{
                                    background: 'linear-gradient(to right, rgba(156, 163, 175, 0.15), transparent)',
                                    borderColor: 'rgba(156, 163, 175, 0.3)',
                                    color: 'rgb(107, 114, 128)',
                                    '--tag-color': 'rgba(156, 163, 175, 0.15)'
                                } as React.CSSProperties}
                            >
                                <Clock className="w-3 h-3 shrink-0" />
                                <span className="truncate">{reviewPendingText}</span>
                            </div>
                        )
                    )}
                </div>

                {/* Assignees */}
                <div className="flex items-center justify-end">
                    <div className="flex -space-x-[5px]">
                        {visibleAssignees.map((u, index) => (
                            (() => {
                                const isStaleAssignee = !!u.id && !validAssigneeIdSet.has(u.id)
                                return (
                                    <Avatar
                                        key={u.id ?? u.name}
                                        className={cn(
                                            "relative h-6 w-6 shrink-0 bg-background text-[10px] ring-2 ring-background",
                                            isStaleAssignee && "ring-red-200"
                                        )}
                                        title={isStaleAssignee ? `${u.name} (removed from workspace)` : u.name}
                                        style={{ zIndex: 30 - index }}
                                    >
                                        <AvatarFallback className={cn(
                                            "bg-primary/5 text-primary",
                                            isStaleAssignee && "bg-red-100 text-red-700"
                                        )}>
                                            {getInitials(u.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                )
                            })()
                        ))}
                        {extraAssigneeCount > 0 && (
                            <Avatar
                                className="relative h-6 w-6 shrink-0 bg-background text-[10px] ring-2 ring-background"
                                title={assigneeUsers
                                    .slice(maxVisibleAssignees)
                                    .map((u) => u.name)
                                    .join(", ")}
                                style={{ zIndex: 0 }}
                            >
                                <AvatarFallback className="bg-muted text-muted-foreground font-medium">
                                    +{extraAssigneeCount}
                                </AvatarFallback>
                            </Avatar>
                        )}
                        {assigneeUsers.length === 0 && (
                            <Popover open={assignPopoverOpen} onOpenChange={setAssignPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <button
                                        className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/5 text-primary ring-2 ring-background hover:bg-primary/15 transition-colors cursor-pointer"
                                        title="Unassigned — click to assign yourself"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Plus className="h-3 w-3" />
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent
                                    className="w-auto p-2"
                                    onClick={(e) => e.stopPropagation()}
                                    align="end"
                                >
                                    <button
                                        onClick={handleAssignSelf}
                                        disabled={isAssigning || !currentUserId}
                                        className="flex items-center gap-1.5 text-[11px] font-medium text-foreground hover:text-primary transition-colors disabled:opacity-50 px-1.5 py-1 rounded hover:bg-muted w-full whitespace-nowrap"
                                    >
                                        <Plus className="h-3 w-3 shrink-0" />
                                        Assign to me
                                    </button>
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>
                </div>
            </div>

            {/* Review Actions Footer (Admin/Lead Only) */}
            {isReviewColumn && isAdmin && (
                <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 text-[10px] font-medium text-red-500/80 group-hover:text-red-600 transition-colors">
                        <ArrowLeft className="w-3 h-3" /> Reject
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-medium text-emerald-600/80 group-hover:text-emerald-700 transition-colors">
                        Approve <ArrowRight className="w-3 h-3" />
                    </div>
                </div>
            )}
        </div>
    )
}
