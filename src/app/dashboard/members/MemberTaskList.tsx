"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChevronDown, ChevronUp, ExternalLink, Clock, CheckCircle2, Circle, AlertCircle, Calendar, History } from "lucide-react"
import { ProjectRouteLink } from "@/features/projects/ProjectRouteLink"

type Task = {
    id: string
    title: string
    description?: string | null
    dueDate?: Date | string | null
    endDate?: Date | string | null
    startDate?: Date | string | null
    updatedAt?: Date | string | null
    progress?: number | null
    column?: {
        name: string
        board?: {
            project?: { id: string; name: string; color: string | null } | null
        } | null
    } | null
    push?: { name: string; color: string } | null
}

type ActivityLog = {
    id: string
    action: string
    field?: string | null
    taskTitle?: string | null
    createdAt: Date | string
    details?: string | null
}

type MemberTaskListProps = {
    tasks: Task[]
    activityLogs: ActivityLog[]
    userId: string
}

const statusColors: Record<string, string> = {
    'Done': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'In Progress': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'Todo': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    'To Do': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    'Review': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

function formatDate(date: Date | string | null | undefined) {
    if (!date) return null
    const d = new Date(date)
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatTimeAgo(date: Date | string) {
    const now = new Date()
    const then = new Date(date)
    const diffMs = now.getTime() - then.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return formatDate(date)
}

function isOverdue(task: Task) {
    if (task.column?.name === 'Done') return false
    const dueDate = task.dueDate || task.endDate
    if (!dueDate) return false
    return new Date(dueDate) < new Date()
}

function TaskItem({ task }: { task: Task }) {
    const overdue = isOverdue(task)
    const status = task.column?.name || 'Unknown'
    const dueDate = task.dueDate || task.endDate
    const project = task.column?.board?.project

    return (
        <div className={`flex items-center justify-between p-3 rounded-lg border ${overdue ? 'border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20' : 'border-border bg-muted/20'} hover:bg-muted/40 transition-colors group`}>
            <div className="flex items-center gap-3 min-w-0 flex-1">
                {status === 'Done' && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                {status === 'In Progress' && <Clock className="h-4 w-4 text-blue-500 shrink-0" />}
                {(status === 'Todo' || status === 'To Do') && <Circle className="h-4 w-4 text-gray-400 shrink-0" />}
                {status === 'Review' && <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />}

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{task.title}</span>
                        {overdue && (
                            <Badge variant="destructive" className="text-[9px] h-4 px-1 shrink-0">
                                Overdue
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                        {project && (
                            <span
                                className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{
                                    backgroundColor: project.color ? `${project.color}20` : '#3b82f620',
                                    color: project.color || '#3b82f6'
                                }}
                            >
                                {project.name}
                            </span>
                        )}
                        {task.push && (
                            <span
                                className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{
                                    backgroundColor: `${task.push.color}20`,
                                    color: task.push.color
                                }}
                            >
                                {task.push.name}
                            </span>
                        )}
                        {dueDate && (
                            <span className={`text-[10px] flex items-center gap-0.5 ${overdue ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                                <Calendar className="h-3 w-3" />
                                {formatDate(dueDate)}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <Badge className={`text-[10px] h-5 ${statusColors[status] || 'bg-gray-100'}`}>
                    {status}
                </Badge>
                {project && (
                    <ProjectRouteLink
                        href={`/dashboard/projects/${project.id}?task=${task.id}`}
                        projectId={project.id}
                    >
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                    </ProjectRouteLink>
                )}
            </div>
        </div>
    )
}

function ActivityItem({ log }: { log: ActivityLog }) {
    return (
        <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors">
            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <History className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm">
                    <span className="capitalize">{log.action}</span>
                    {log.field && <span className="text-muted-foreground"> {log.field}</span>}
                    {log.taskTitle && (
                        <span className="font-medium"> on &quot;{log.taskTitle}&quot;</span>
                    )}
                </p>
                {log.details && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.details}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">{formatTimeAgo(log.createdAt)}</p>
            </div>
        </div>
    )
}

export function MemberTaskList({ tasks, activityLogs, userId }: MemberTaskListProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [activeTab, setActiveTab] = useState<string>("in-progress")

    const inProgressTasks = tasks.filter(t => t.column?.name === 'In Progress')
    const todoTasks = tasks.filter(t => t.column?.name === 'Todo' || t.column?.name === 'To Do')
    const reviewTasks = tasks.filter(t => t.column?.name === 'Review')
    const completedTasks = tasks.filter(t => t.column?.name === 'Done')
    const overdueTasks = tasks.filter(isOverdue)

    if (tasks.length === 0 && activityLogs.length === 0) {
        return (
            <div className="text-center py-4 text-sm text-muted-foreground">
                No tasks assigned yet
            </div>
        )
    }

    return (
        <div className="border rounded-lg">
            <Button
                variant="ghost"
                className="w-full justify-between p-3 h-auto"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="text-sm font-medium">
                    View Tasks & Activity ({tasks.length} tasks)
                </span>
                {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                ) : (
                    <ChevronDown className="h-4 w-4" />
                )}
            </Button>

            {isExpanded && (
                <div className="border-t p-3">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="w-full justify-start mb-3 h-8">
                            <TabsTrigger value="in-progress" className="text-xs h-7">
                                In Progress ({inProgressTasks.length})
                            </TabsTrigger>
                            <TabsTrigger value="todo" className="text-xs h-7">
                                To Do ({todoTasks.length})
                            </TabsTrigger>
                            <TabsTrigger value="review" className="text-xs h-7">
                                Review ({reviewTasks.length})
                            </TabsTrigger>
                            <TabsTrigger value="completed" className="text-xs h-7">
                                Done ({completedTasks.length})
                            </TabsTrigger>
                            {overdueTasks.length > 0 && (
                                <TabsTrigger value="overdue" className="text-xs h-7 text-red-600">
                                    Overdue ({overdueTasks.length})
                                </TabsTrigger>
                            )}
                            <TabsTrigger value="activity" className="text-xs h-7">
                                Activity
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="in-progress" className="mt-0">
                            <ScrollArea className="h-[300px]">
                                <div className="space-y-2 pr-3">
                                    {inProgressTasks.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-8">No tasks in progress</p>
                                    ) : (
                                        inProgressTasks.map(task => <TaskItem key={task.id} task={task} />)
                                    )}
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="todo" className="mt-0">
                            <ScrollArea className="h-[300px]">
                                <div className="space-y-2 pr-3">
                                    {todoTasks.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-8">No tasks to do</p>
                                    ) : (
                                        todoTasks.map(task => <TaskItem key={task.id} task={task} />)
                                    )}
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="review" className="mt-0">
                            <ScrollArea className="h-[300px]">
                                <div className="space-y-2 pr-3">
                                    {reviewTasks.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-8">No tasks in review</p>
                                    ) : (
                                        reviewTasks.map(task => <TaskItem key={task.id} task={task} />)
                                    )}
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="completed" className="mt-0">
                            <ScrollArea className="h-[300px]">
                                <div className="space-y-2 pr-3">
                                    {completedTasks.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-8">No completed tasks</p>
                                    ) : (
                                        completedTasks.map(task => <TaskItem key={task.id} task={task} />)
                                    )}
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="overdue" className="mt-0">
                            <ScrollArea className="h-[300px]">
                                <div className="space-y-2 pr-3">
                                    {overdueTasks.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-8">No overdue tasks</p>
                                    ) : (
                                        overdueTasks.map(task => <TaskItem key={task.id} task={task} />)
                                    )}
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="activity" className="mt-0">
                            <ScrollArea className="h-[300px]">
                                <div className="space-y-1 pr-3">
                                    {activityLogs.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-8">No recent activity</p>
                                    ) : (
                                        activityLogs.map(log => <ActivityItem key={log.id} log={log} />)
                                    )}
                                </div>
                            </ScrollArea>
                        </TabsContent>
                    </Tabs>
                </div>
            )}
        </div>
    )
}
