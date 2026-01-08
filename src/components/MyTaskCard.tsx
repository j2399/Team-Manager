"use client"

import { useState } from "react"
import { Clock } from "lucide-react"
import Link from "next/link"
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

function getTimeUntilDue(dueDate: Date | string | null): { text: string; isOverdue: boolean; isUrgent: boolean } {
    if (!dueDate) return { text: '', isOverdue: false, isUrgent: false }

    const now = new Date()
    const due = new Date(dueDate)
    const diffMs = due.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    const diffHours = Math.ceil(diffMs / (1000 * 60 * 60))

    if (diffMs < 0) {
        const overdueDays = Math.abs(diffDays)
        if (overdueDays === 0) return { text: 'Due today', isOverdue: true, isUrgent: true }
        if (overdueDays === 1) return { text: '1 day overdue', isOverdue: true, isUrgent: true }
        return { text: `${overdueDays} days overdue`, isOverdue: true, isUrgent: true }
    }

    if (diffHours <= 24) {
        if (diffHours <= 1) return { text: 'Due in <1h', isOverdue: false, isUrgent: true }
        return { text: `Due in ${diffHours}h`, isOverdue: false, isUrgent: true }
    }

    if (diffDays === 1) return { text: 'Due tomorrow', isOverdue: false, isUrgent: true }
    if (diffDays <= 3) return { text: `Due in ${diffDays} days`, isOverdue: false, isUrgent: true }
    if (diffDays <= 7) return { text: `Due in ${diffDays} days`, isOverdue: false, isUrgent: false }

    return { text: `Due in ${diffDays} days`, isOverdue: false, isUrgent: false }
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
                className="group cursor-pointer rounded-lg p-3 transition-all border border-border bg-card hover:bg-accent/50"
            >
                {/* Top row: Title on left, Due time on right */}
                <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                        {task.title}
                    </h4>

                    {dueText && (
                        <span className={`
                            text-[10px] flex items-center gap-1 shrink-0 mt-0.5
                            ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : ''}
                            ${isUrgent && !isOverdue ? 'text-amber-600 dark:text-amber-400' : ''}
                            ${!isUrgent && !isOverdue ? 'text-muted-foreground' : ''}
                        `}>
                            <Clock className="h-3 w-3" />
                            {dueText}
                        </span>
                    )}
                </div>

                {/* Project badge underneath title */}
                {project && (
                    <span
                        className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded truncate max-w-[120px] mt-2"
                        style={{
                            backgroundColor: `${projectColor}15`,
                            color: projectColor
                        }}
                    >
                        {project.name}
                    </span>
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
