"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FileText, Eye, Clock, ArrowUpRight } from "lucide-react"
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
                }
            }
        } | null
        createdAt: Date | string | null
        updatedAt: Date | string | null
    }
}

export function MyTaskCard({ task }: MyTaskCardProps) {
    const [showTaskPreview, setShowTaskPreview] = useState(false)

    const getStatusColor = (columnName: string | undefined) => {
        switch (columnName) {
            case 'In Progress': return 'bg-blue-500'
            case 'Review': return 'bg-orange-500'
            case 'Done': return 'bg-emerald-500'
            default: return 'bg-gray-400'
        }
    }

    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.column?.name !== 'Done'

    return (
        <>
            <div className={`border rounded-lg bg-card hover:bg-accent/50 transition-colors ${isOverdue ? 'border-red-300 bg-red-50/50 dark:border-red-900/50 dark:bg-red-900/10' : ''}`}>
                {/* Header with title */}
                <div className="p-3 pb-2 flex items-start gap-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium leading-tight line-clamp-2">{task.title}</h4>
                    </div>
                </div>

                {/* Description */}
                {task.description && (
                    <div className="px-3 pb-2 pl-8">
                        <p className="text-xs text-muted-foreground line-clamp-2">
                            {task.description}
                        </p>
                    </div>
                )}

                {/* Footer with project and status */}
                <div className="px-3 pb-2 pl-8 flex flex-wrap items-center justify-between gap-y-1 gap-x-2 text-[10px]">
                    <div className="flex items-center gap-2 text-muted-foreground min-w-0 max-w-full">
                        {task.column?.board?.project && (
                            <span className="truncate shrink-1">{task.column.board.project.name}</span>
                        )}
                        <div className="flex items-center gap-1 shrink-0">
                            <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(task.column?.name)}`} />
                            <span className="whitespace-nowrap">{task.column?.name || 'Todo'}</span>
                        </div>
                    </div>
                    {isOverdue && (
                        <Badge variant="destructive" className="text-[9px] h-4 px-1 shrink-0 ml-auto dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/50">
                            <Clock className="w-2.5 h-2.5 mr-0.5" />
                            Overdue
                        </Badge>
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
            </div >

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
            )
            }
        </>
    )
}
