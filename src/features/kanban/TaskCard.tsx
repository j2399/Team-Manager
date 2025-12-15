"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ArrowLeft, ArrowRight, Clock, CalendarDays, CheckCircle2, Lock } from "lucide-react"
import { cn, getInitials } from "@/lib/utils"
import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { updateTaskProgress } from "@/app/actions/kanban"
import { useState, useEffect, useRef } from "react"
// import { useDebounce } from "@/hooks/use-debounce" 

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
    }

    // Calculate time progress and status
    const now = new Date().getTime()
    const startTime = task.startDate ? new Date(task.startDate).getTime() : null
    const endTime = task.endDate ? new Date(task.endDate).getTime() : null

    let timeProgress: number | null = null
    let daysLeft: number | null = null
    let isOverdue = false

    if (startTime && endTime) {
        const totalDuration = endTime - startTime
        const elapsed = now - startTime
        timeProgress = Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100)
        daysLeft = Math.ceil((endTime - now) / (1000 * 60 * 60 * 24))
        isOverdue = daysLeft < 0
    } else if (endTime) {
        daysLeft = Math.ceil((endTime - now) / (1000 * 60 * 60 * 24))
        isOverdue = daysLeft < 0
    }

    // Modern Progress Bar Color
    const getProgressColor = () => {
        if (isOverdue) return 'bg-red-500'
        if (timeProgress && timeProgress > 90) return 'bg-orange-500'
        return 'bg-primary/60'
    }

    // Manual Progress Logic
    const [manualProgress, setManualProgress] = useState(task.progress || 0)
    const [isUpdatingProgress, setIsUpdatingProgress] = useState(false)

    useEffect(() => {
        setManualProgress(task.progress || 0)
    }, [task.progress])

    const handleProgressChange = (value: number[]) => {
        setManualProgress(value[0])
    }

    const [showReviewConfirm, setShowReviewConfirm] = useState(false)

    const handleProgressCommit = async (value: number[]) => {
        if (!task.enableProgress) return

        // If user drags to 100%, show confirmation prompt
        if (value[0] === 100) {
            setShowReviewConfirm(true)
            // Still update the progress locally/server to 100? 
            // Better to wait for confirmation for the move, but save the 100% value.
            // Actually, if they cancel, we might want to keep it at 100 or revert. 
            // Let's assume we save the 100% value first.
            await updateTaskProgress(task.id, 100, projectId || "unknown")
            return
        }

        setIsUpdatingProgress(true)
        await updateTaskProgress(task.id, value[0], projectId || "unknown")
        setIsUpdatingProgress(false)
    }

    const navToReview = async () => {
        // Trigger server action to move to review
        // We can reuse updateTaskProgress but pass a flag, or separate action?
        // Actually, updateTaskProgress previously inferred it. 
        // We will modify updateTaskProgress to accept an explicit 'moveToReview' flag or rely on client call to updateTaskStatus.
        // Let's use updateTaskProgress with a special 'forceReview' flag if we modify it, OR just call updateTaskStatus.
        // But updateTaskStatus requires us to know the review column ID.
        // Easier to let updateTaskProgress handle it via a new argument?
        // Or just let updateTaskProgress handle it if progress is 100 AND we ask it to?

        // Let's modify updateTaskProgress to take a 'moveToReview' boolean. 
        // For now, I'll assume we updated the server action to NOT auto-move unless requested.
        // Wait, I am editing the server action too. I will add `moveToReview` param.

        setIsUpdatingProgress(true)
        const result = await updateTaskProgress(task.id, 100, projectId || "unknown", true)
        if (result.movedToReview) {
            router.refresh()
        }
        setIsUpdatingProgress(false)
        setShowReviewConfirm(false)
    }

    const isAssignee = currentUserId && (
        task.assignee?.id === currentUserId || task.assignee?.name === currentUserId || // fallback if id missing
        task.assignees?.some(a => a.user.id === currentUserId)
    )
    const canUpdateProgress = isAssignee || isAdmin

    const getManualProgressColorClass = (val: number) => {
        if (val < 30) return "bg-red-500"
        if (val < 70) return "bg-yellow-500"
        return "bg-green-500"
    }

    // Render Overlay Card (Action of dragging)
    if (overlay) {
        return (
            <div className="bg-card border rounded-lg shadow-xl cursor-grabbing p-3 w-[260px] rotate-2 scale-105 border-primary/20 ring-1 ring-primary/20">
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
                    "bg-emerald-50/40 border-emerald-100 hover:border-emerald-200 hover:shadow-sm",
                    isDragDisabled ? 'cursor-default' : 'cursor-grab'
                )}
            >
                <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-medium text-emerald-950/80 leading-snug line-clamp-2">
                        {task.title}
                    </h4>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                </div>

                {completedDateStr && (
                    <div className="flex items-center gap-1 text-[10px] text-emerald-600/70">
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
                isReviewColumn ? "border-orange-200 bg-orange-50/10" : "border-border",
                isDragDisabled ? 'cursor-default' : 'cursor-grab'
            )}
        >
            {/* Title */}
            <h4 className="text-sm font-medium leading-snug text-foreground mb-3 line-clamp-2">
                {task.title}
            </h4>

            {/* Meta Row: Date & Avatar */}
            <div className="flex items-center justify-between gap-2 mt-auto">
                <div className="flex items-center gap-1.5 min-w-0">
                    {/* Status / Date Badge */}
                    {daysLeft !== null && (
                        <div className={cn(
                            "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-sm font-medium border truncate max-w-[120px]",
                            isOverdue
                                ? "bg-red-50 text-red-600 border-red-100"
                                : daysLeft <= 2
                                    ? "bg-orange-50 text-orange-600 border-orange-100"
                                    : "bg-muted text-muted-foreground border-transparent"
                        )}>
                            <Clock className="w-3 h-3 shrink-0" />
                            <span className="truncate">
                                {isOverdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Today" : `${daysLeft}d`}
                            </span>
                        </div>
                    )}
                </div>

                {/* Avatar */}
                <Avatar className="h-6 w-6 border text-[10px] shrink-0">
                    <AvatarFallback className="bg-primary/5 text-primary">
                        {getInitials(task.assignee?.name)}
                    </AvatarFallback>
                </Avatar>
            </div>

            {/* Progress Bar (if active) */}
            {(task.enableProgress) ? (
                <div
                    className="mt-3 px-1"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Stop propagation to prevent card drag when interacting with slider */}
                    <TooltipProvider>
                        <Tooltip delayDuration={0}>
                            <TooltipTrigger asChild>
                                <div className={cn("relative flex items-center gap-2", !canUpdateProgress && "opacity-80")}>
                                    <Slider
                                        disabled={!canUpdateProgress}
                                        value={[manualProgress]}
                                        max={100}
                                        step={5}
                                        onValueChange={handleProgressChange}
                                        onValueCommit={handleProgressCommit}
                                        className="h-4"
                                        rangeClassName={getManualProgressColorClass(manualProgress)}
                                    />
                                    <span className="text-[10px] font-medium min-w-[3ch] text-muted-foreground">{manualProgress}%</span>
                                </div>
                            </TooltipTrigger>
                            {!canUpdateProgress && (
                                <TooltipContent side="top" className="text-[10px] bg-muted text-muted-foreground border shadow-sm px-2 py-1">
                                    <p>Only assignees can update progress</p>
                                </TooltipContent>
                            )}
                        </Tooltip>
                    </TooltipProvider>
                </div>
            ) : (
                timeProgress !== null && !isReviewColumn && (
                    <div className="mt-3 h-1 w-full bg-muted rounded-full overflow-hidden">
                        <div
                            className={cn("h-full rounded-full transition-all duration-300", getProgressColor())}
                            style={{ width: `${Math.min(timeProgress, 100)}%` }}
                        />
                    </div>
                )
            )}

            {/* Review Actions Footer */}
            {isReviewColumn && (
                <div className="mt-3 pt-2.5 border-t border-orange-100 flex items-center justify-between gap-2">
                    {isAdmin ? (
                        <>
                            <div className="flex items-center gap-1 text-[10px] font-medium text-red-500/80 group-hover:text-red-600 transition-colors">
                                <ArrowLeft className="w-3 h-3" /> Reject
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-medium text-emerald-600/80 group-hover:text-emerald-700 transition-colors">
                                Approve <ArrowRight className="w-3 h-3" />
                            </div>
                        </>
                    ) : (
                        <div className="w-full text-center text-[10px] font-medium text-orange-600/70 flex items-center justify-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                            Pending Review
                        </div>
                    )}
                </div>
            )}

            {isHighlighted && (
                <div className="absolute inset-0 z-10 rounded-lg border-2 border-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)] pointer-events-none animate-highlight-fade" />
            )}

            <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                <AlertDialog open={showReviewConfirm} onOpenChange={setShowReviewConfirm}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Task Completed?</AlertDialogTitle>
                            <AlertDialogDescription>
                                You've marked this task as 100% complete. Would you like to move it to the <strong>Review</strong> column?
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>No, keep here</AlertDialogCancel>
                            <AlertDialogAction onClick={navToReview}>Yes, move to Review</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    )
}
