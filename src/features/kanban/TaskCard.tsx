"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ArrowLeft, ArrowRight, Clock, CalendarDays, CheckCircle2, Lock } from "lucide-react"
import { cn, getInitials } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useRef } from "react"

type TaskCardProps = {
    task: {
        id: string
        title: string
        columnId: string | null
        push?: { id: string; name: string; color: string; status: string } | null
        startDate?: Date | string | null
        endDate?: Date | string | null
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
}

const animateLayoutChanges = () => false

import { useRouter } from "next/navigation"

export function TaskCard({ task, overlay, onClick, isReviewColumn, isDoneColumn, isAdmin, isDragDisabled, isHighlighted, domId, currentUserId, projectId }: TaskCardProps) {
    const router = useRouter()
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
        zIndex: 10, // Ensure card renders above confetti (z-index: 1)
    }

    // Calculate due date status
    const now = new Date().getTime()
    const endTime = task.endDate ? new Date(task.endDate).getTime() : null

    let daysLeft: number | null = null
    let isOverdue = false

    if (endTime) {
        daysLeft = Math.ceil((endTime - now) / (1000 * 60 * 60 * 24))
        isOverdue = daysLeft < 0
    }

    const assigneeUsers =
        task.assignees && task.assignees.length > 0
            ? task.assignees.map((a) => a.user)
            : task.assignee?.name
                ? [{ id: task.assignee.id ?? "legacy", name: task.assignee.name }]
                : []

    const maxVisibleAssignees = 3
    const visibleAssignees = assigneeUsers.slice(0, maxVisibleAssignees)
    const extraAssigneeCount = Math.max(assigneeUsers.length - visibleAssignees.length, 0)

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
                    "group relative flex flex-col gap-1.5 p-3 rounded-lg border transition-colors transition-shadow duration-200",
                    "bg-emerald-50/40 border-emerald-100 hover:border-emerald-200 hover:shadow-sm dark:bg-emerald-900/10 dark:border-emerald-900/30 dark:hover:border-emerald-800/50",
                    isDragDisabled ? 'cursor-default' : 'cursor-grab'
                )}
            >
                <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-medium text-emerald-950/80 dark:text-emerald-100/80 leading-snug line-clamp-2">
                        {task.title}
                    </h4>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
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
                "group relative flex flex-col rounded-lg border bg-card p-3 shadow-sm transition-colors transition-shadow duration-200",
                "hover:shadow-md hover:border-primary/20",
                "border-border",
                isDragDisabled ? 'cursor-default' : 'cursor-grab',
                isHighlighted && 'animate-highlight-bulge'
            )}
        >
            {/* Title */}
            <h4 className="text-sm font-medium leading-snug text-foreground mb-3 line-clamp-2">
                {task.title}
            </h4>

            {/* Meta Row: Date & Avatar */}
            <div className="flex items-center justify-between gap-2 mt-auto">
                <div className="flex items-center gap-1.5 min-w-0">
                    {/* Status / Date Badge - Show pending time for Review, due date for others */}
                    {isReviewColumn ? (
                        task.updatedAt && (
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
                                <span className="truncate">
                                    {(() => {
                                        const days = Math.floor((Date.now() - new Date(task.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
                                        return days === 0 ? 'Pending today' : `Pending ${days}d`
                                    })()}
                                </span>
                            </div>
                        )
                    ) : (
                        daysLeft !== null && (
                            <div
                                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-sm font-medium border truncate max-w-[120px] tag-shimmer"
                                style={isOverdue ? {
                                    background: 'linear-gradient(to right, rgba(239, 68, 68, 0.15), transparent)',
                                    borderColor: 'rgba(239, 68, 68, 0.3)',
                                    color: 'rgb(220, 38, 38)',
                                    '--tag-color': 'rgba(239, 68, 68, 0.15)'
                                } as React.CSSProperties : {
                                    background: 'linear-gradient(to right, rgba(156, 163, 175, 0.15), transparent)',
                                    borderColor: 'rgba(156, 163, 175, 0.3)',
                                    color: 'rgb(107, 114, 128)',
                                    '--tag-color': 'rgba(156, 163, 175, 0.15)'
                                } as React.CSSProperties}
                            >
                                <Clock className="w-3 h-3 shrink-0" />
                                <span className="truncate">
                                    {isOverdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Today" : `${daysLeft}d`}
                                </span>
                            </div>
                        )
                    )}
                </div>

                {/* Assignees */}
                <div className="flex items-center justify-end">
                    <div className="flex -space-x-[5px]">
                        {visibleAssignees.map((u, index) => (
                            <Avatar
                                key={u.id ?? u.name}
                                className="relative h-6 w-6 shrink-0 bg-background text-[10px] ring-2 ring-background"
                                title={u.name}
                                style={{ zIndex: 30 - index }}
                            >
                                <AvatarFallback className="bg-primary/5 text-primary">
                                    {getInitials(u.name)}
                                </AvatarFallback>
                            </Avatar>
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
                            <Avatar className="h-6 w-6 shrink-0 bg-background text-[10px] ring-2 ring-background" title="Unassigned">
                                <AvatarFallback className="bg-muted text-muted-foreground">—</AvatarFallback>
                            </Avatar>
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
