"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ExternalLink } from "lucide-react"
import Link from "next/link"

interface Task {
    id: string
    title: string
    status: string
    dueDate?: Date | string | null
    projectId?: string | null
    projectName?: string | null
}

interface TaskInfoProps {
    tasks: Task[]
}

export function TaskInfo({ tasks }: TaskInfoProps) {
    const sortedTasks = [...tasks].sort((a, b) => {
        const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
        const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
        return dateA - dateB
    })

    const pendingTasks = sortedTasks.filter(t => t.status !== 'Done')
    const completedCount = tasks.filter(t => t.status === 'Done').length

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="pb-2 px-3 pt-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">My Tasks</CardTitle>
                    <span className="text-xs text-muted-foreground">{pendingTasks.length} pending</span>
                </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-0">
                <ScrollArea className="h-[120px] px-3 pb-2">
                    <div className="space-y-1">
                        {pendingTasks.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2">No pending tasks.</p>
                        ) : (
                            pendingTasks.slice(0, 8).map(task => {
                                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date()
                                return (
                                    <div 
                                        key={task.id} 
                                        className="flex items-center justify-between gap-2 py-1 group"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium line-clamp-1">{task.title}</p>
                                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                                {task.projectName && <span>{task.projectName}</span>}
                                                {task.dueDate && (
                                                    <span className={isOverdue ? "text-red-500" : ""}>
                                                        {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {task.projectId && (
                                            <Link 
                                                href={`/dashboard/projects/${task.projectId}`}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
                                                title="Jump to division"
                                            >
                                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                            </Link>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    )
}
