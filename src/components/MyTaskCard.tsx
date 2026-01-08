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

    // Safety check for invalid dates
    if (isNaN(due.getTime())) return { text: '', isOverdue: false, isUrgent: false }

    const diffMs = due.getTime() - now.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMs < 0) {
        const absDays = Math.abs(diffDays)
        if (absDays === 0) return { text: 'Due today', isOverdue: true, isUrgent: true }
        return { text: `${absDays}d overdue`, isOverdue: true, isUrgent: true }
    }

    if (diffMins < 60) {
        if (diffMins <= 0) return { text: 'Due now', isOverdue: false, isUrgent: true }
        return { text: `${diffMins}m left`, isOverdue: false, isUrgent: true }
    }

    if (diffHours < 24) {
        return { text: `${diffHours}h left`, isOverdue: false, isUrgent: true }
    }

    if (diffDays === 1) return { text: 'Tomorrow', isOverdue: false, isUrgent: true }
    if (diffDays <= 7) return { text: `${diffDays}d left`, isOverdue: false, isUrgent: diffDays <= 3 }

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
                className="group relative flex flex-col gap-2 cursor-pointer rounded-lg border border-border bg-card p-3 transition-all hover:bg-accent/50 overflow-hidden"
            >
                {/* Row 1: Title and Due Time */}
                <div className="grid grid-cols-[1fr_auto] items-start gap-4">
                    <h4 className="text-sm font-medium leading-tight group-hover:text-primary transition-colors line-clamp-2 min-w-0">
                        {task.title}
                    </h4>

                    {dueText && (
                        <div className={`
                            flex items-center gap-1 shrink-0 text-[11px] font-bold mt-0.5
                            ${isOverdue ? 'text-red-500' : ''}
                            ${isUrgent && !isOverdue ? 'text-amber-500' : ''}
                            ${!isUrgent && !isOverdue ? 'text-muted-foreground' : ''}
                        `}>
                            <Clock className="h-3.5 w-3.5" />
                            <span className="whitespace-nowrap">{dueText}</span>
                        </div>
                    )}
                </div>

                {/* Row 2: Project Badge (Directly underneath title) */}
                {project && (
                    <div className="flex items-center">
                        <span
                            className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter truncate max-w-[140px]"
                            style={{
                                backgroundColor: `${projectColor}15`,
                                color: projectColor
                            }}
                        >
                            {project.name}
                        </span>
                    </div>
                )}

                {/* Row 3: Description (Underneath project badge) */}
                {task.description && (
                    <p className="text-[11px] leading-snug text-muted-foreground/50 truncate">
                        {task.description}
                    </p>
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
