"use client"

import { useState } from "react"
import { Clock } from "lucide-react"
import { TaskPreview } from "@/features/kanban/TaskPreview"

type MyTaskCardProps = {
    task: {
        id: string
        title: string
        description: string | null
        startDate: Date | string | null
        endDate: Date | string | null
        dueDate: Date | string | null
        assignee: { id: string; name: string } | null
        column: {
            name: string
            board: {
                project: {
                    id: string
                    name: string
                    color?: string | null
                }
            }
        } | null
        createdAt: Date | string | null
        updatedAt: Date | string | null
    }
}

/**
 * Returns a human-readable string for time until due.
 * Optimized for dashboard card usage.
 */
function getTimeUntilDue(dueDate: Date | string | null): { text: string; isOverdue: boolean; isUrgent: boolean } {
    if (!dueDate) return { text: '', isOverdue: false, isUrgent: false }

    const now = new Date()
    const due = new Date(dueDate)

    // Calculate difference in milliseconds
    const diffMs = due.getTime() - now.getTime()

    // Calculate partials
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMinutes = Math.floor(diffMs / (1000 * 60))

    if (diffMs < 0) {
        const absDiffDays = Math.abs(diffDays)
        if (absDiffDays === 0) return { text: 'Due today', isOverdue: true, isUrgent: true }
        if (absDiffDays === 1) return { text: '1d overdue', isOverdue: true, isUrgent: true }
        return { text: `${absDiffDays}d overdue`, isOverdue: true, isUrgent: true }
    }

    // Due in less than 1 hour
    if (diffMinutes < 60) {
        if (diffMinutes <= 0) return { text: 'Due now', isOverdue: false, isUrgent: true }
        return { text: `${diffMinutes}m left`, isOverdue: false, isUrgent: true }
    }

    // Due in less than 24 hours
    if (diffHours < 24) {
        return { text: `${diffHours}h left`, isOverdue: false, isUrgent: true }
    }

    // Due tomorrow
    if (diffDays === 1) {
        return { text: 'Tomorrow', isOverdue: false, isUrgent: true }
    }

    // Due within current week (<= 7 days)
    if (diffDays <= 7) {
        return { text: `${diffDays}d left`, isOverdue: false, isUrgent: diffDays <= 3 }
    }

    // Longer term
    return { text: `${diffDays}d left`, isOverdue: false, isUrgent: false }
}

export function MyTaskCard({ task }: MyTaskCardProps) {
    const [showTaskPreview, setShowTaskPreview] = useState(false)

    const project = task.column?.board?.project
    const projectColor = project?.color || '#6b7280'
    const { text: dueText, isOverdue, isUrgent } = task.column?.name !== 'Done'
        ? getTimeUntilDue(task.dueDate)
        : { text: '', isOverdue: false, isUrgent: false }

    return (
        <>
            <div
                onClick={() => setShowTaskPreview(true)}
                className="group relative flex flex-col gap-1.5 cursor-pointer rounded-lg border border-border bg-card p-3 transition-all hover:bg-accent/50 overflow-hidden"
            >
                {/* 
                  Grid layout for top row: 
                  - Title takes as much space as possible but will not push the due date out.
                  - Due date takes exactly what it needs and stays on the right.
                */}
                <div className="grid grid-cols-[1fr_auto] items-start gap-2">
                    <h4 className="text-sm font-medium leading-snug line-clamp-2 transition-colors group-hover:text-primary min-w-0 break-words">
                        {task.title}
                    </h4>

                    {dueText && (
                        <div className={`
                            flex items-center gap-1 shrink-0 text-[11px] font-semibold mt-0.5
                            ${isOverdue ? 'text-red-500' : ''}
                            ${isUrgent && !isOverdue ? 'text-amber-500' : ''}
                            ${!isUrgent && !isOverdue ? 'text-muted-foreground' : ''}
                        `}>
                            <Clock className="h-3.5 w-3.5" />
                            <span className="whitespace-nowrap">{dueText}</span>
                        </div>
                    )}
                </div>

                {/* Description - subdued and truncated to 1 line */}
                {task.description && (
                    <p className="text-[11px] leading-tight text-muted-foreground/50 truncate pr-2">
                        {task.description}
                    </p>
                )}

                {/* Project Badge - no left border on card, just this identifier */}
                {project && (
                    <div className="flex items-center mt-1">
                        <span
                            className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tight truncate max-w-[150px]"
                            style={{
                                backgroundColor: `${projectColor}15`,
                                color: projectColor
                            }}
                        >
                            {project.name}
                        </span>
                    </div>
                )}
            </div>

            {showTaskPreview && (
                <TaskPreview
                    task={{
                        id: task.id,
                        title: task.title,
                        description: task.description,
                        startDate: task.startDate,
                        endDate: task.endDate,
                        dueDate: task.dueDate,
                        assignee: task.assignee,
                        column: task.column,
                        columnId: null,
                        createdAt: task.createdAt || undefined,
                        updatedAt: task.updatedAt || undefined
                    }}
                    open={showTaskPreview}
                    onOpenChange={(open) => {
                        setShowTaskPreview(open)
                    }}
                    onEdit={() => { }}
                    projectId={task.column?.board?.project?.id || ''}
                />
            )}
        </>
    )
}
