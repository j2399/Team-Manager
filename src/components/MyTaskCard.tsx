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

function getTimeUntilDue(dueDate: Date | string | null): { text: string; isOverdue: boolean } {
    if (!dueDate) return { text: '', isOverdue: false }

    const now = new Date()
    const due = new Date(dueDate)
    const diffMs = due.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    const diffHours = Math.ceil(diffMs / (1000 * 60 * 60))

    if (diffMs < 0) {
        const overdueDays = Math.abs(diffDays)
        if (overdueDays === 0) return { text: 'Today', isOverdue: true }
        if (overdueDays === 1) return { text: '1d overdue', isOverdue: true }
        return { text: `${overdueDays}d overdue`, isOverdue: true }
    }

    if (diffHours <= 24) return { text: 'Today', isOverdue: false }
    if (diffDays === 1) return { text: 'Tomorrow', isOverdue: false }
    if (diffDays <= 7) return { text: `${diffDays}d`, isOverdue: false }
    return { text: `${diffDays}d`, isOverdue: false }
}

export function MyTaskCard({ task }: MyTaskCardProps) {
    const [showTaskPreview, setShowTaskPreview] = useState(false)

    const project = task.column?.board?.project
    const projectColor = project?.color || '#6b7280'
    const effectiveDueDate = task.endDate || task.dueDate
    const { text: dueText, isOverdue } = task.column?.name !== 'Done'
        ? getTimeUntilDue(effectiveDueDate)
        : { text: '', isOverdue: false }

    return (
        <>
            <div
                onClick={() => setShowTaskPreview(true)}
                className="group cursor-pointer rounded-md p-2.5 border border-border/60 bg-card hover:border-border hover:shadow-sm active:scale-[0.99] transition-all duration-150"
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <h4 className="text-[13px] font-medium leading-snug line-clamp-2">
                            {task.title}
                        </h4>
                        {project && (
                            <span
                                className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mt-1.5"
                                style={{
                                    backgroundColor: `${projectColor}12`,
                                    color: projectColor
                                }}
                            >
                                {project.name}
                            </span>
                        )}
                    </div>

                    {dueText && (
                        <span className={`
                            text-[10px] shrink-0 flex items-center gap-1 mt-0.5
                            ${isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}
                        `}>
                            <Clock className="h-3 w-3" />
                            {dueText}
                        </span>
                    )}
                </div>
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
                    onOpenChange={setShowTaskPreview}
                    onEdit={() => { }}
                    projectId={project?.id || ''}
                />
            )}
        </>
    )
}
