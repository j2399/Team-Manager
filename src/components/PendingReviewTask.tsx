"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { User, Eye, Clock, ArrowUpRight } from "lucide-react"
import Link from "next/link"
import { TaskPreview } from "@/features/kanban/TaskPreview"

type PendingReviewTaskProps = {
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
                }
            }
        } | null
        createdAt: Date | string | null
        updatedAt: Date | string | null
        reviewSince: Date | string | null
    }
}

function formatWaitTime(date: Date | string | null): string {
    if (!date) return "Unknown"

    const now = new Date()
    const reviewDate = new Date(date)
    const diffMs = now.getTime() - reviewDate.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) {
        return `${diffMins}m`
    } else if (diffHours < 24) {
        return `${diffHours}h`
    } else {
        return `${diffDays}d`
    }
}

export function PendingReviewTask({ task }: PendingReviewTaskProps) {
    const router = useRouter()
    const [showTaskPreview, setShowTaskPreview] = useState(false)

    return (
        <>
            <div className="border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                {/* Title - Full width, wraps naturally */}
                <div className="p-3 pb-2">
                    <h4 className="text-sm font-semibold leading-snug break-words">
                        {task.title}
                    </h4>
                </div>

                {/* Description if exists */}
                {task.description && (
                    <div className="px-3 pb-2">
                        <p className="text-xs text-muted-foreground leading-relaxed break-words">
                            {task.description.length > 80
                                ? task.description.slice(0, 80) + '...'
                                : task.description}
                        </p>
                    </div>
                )}

                {/* Meta info row */}
                <div className="px-3 pb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                    {task.assignee && (
                        <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {task.assignee.name}
                        </span>
                    )}
                    {task.column?.board?.project && (
                        <span>{task.column.board.project.name}</span>
                    )}
                    {task.reviewSince && (
                        <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400">
                            <Clock className="h-3 w-3" />
                            Waiting {formatWaitTime(task.reviewSince)}
                        </span>
                    )}
                </div>

                {/* Action buttons */}
                <div className="px-3 pb-3 pt-1 border-t flex items-center gap-2">
                    <Button
                        onClick={() => setShowTaskPreview(true)}
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 text-xs"
                    >
                        <Eye className="h-3 w-3 mr-1.5" />
                        Details
                    </Button>
                    {task.column?.board?.project && (
                        <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                            title="Go to Tasks Board"
                        >
                            <Link
                                href={`/dashboard/projects/${task.column.board.project.id}?highlight=${task.id}`}
                            >
                                <ArrowUpRight className="h-3.5 w-3.5" />
                            </Link>
                        </Button>
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
                        createdAt: task.createdAt || undefined,
                        updatedAt: task.updatedAt || undefined
                    }}
                    open={showTaskPreview}
                    onOpenChange={(open) => {
                        setShowTaskPreview(open)
                        if (!open) {
                            router.refresh()
                        }
                    }}
                    onEdit={() => { }}
                    projectId={task.column?.board?.project?.id || ''}
                />
            )}
        </>
    )
}
