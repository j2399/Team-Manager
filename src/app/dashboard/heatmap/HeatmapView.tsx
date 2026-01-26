"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
    AlertTriangle, Clock, HelpCircle, Users, UserX, CheckCircle2,
    ChevronRight, ArrowLeft, TrendingUp, AlertCircle, Loader2,
    Circle, Zap, Target, BarChart3
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

type Task = {
    id: string
    title: string
    columnName: string
    columnId: string | null
    projectId: string
    projectName: string
    projectColor: string
    pushId: string | null
    pushName: string | null
    assigneeIds: string[]
    dueDate: string | null
    isOverdue: boolean
    daysUntilDue: number | null
    daysSinceActivity: number | null
    isStuck: boolean
    isBlockedByHelp: boolean
    isUnassigned: boolean
    helpRequestStatus: string | null
    checklistTotal: number
    checklistCompleted: number
    createdAt: string
    updatedAt: string
}

type UserStat = {
    id: string
    name: string
    avatar: string | null
    role: string
    totalTasks: number
    activeTasks: number
    todoTasks: number
    inProgressTasks: number
    reviewTasks: number
    doneTasks: number
    overdueTasks: number
    stuckTasks: number
    helpRequestTasks: number
    workloadScore: number
    status: 'struggling' | 'available' | 'on-track'
    tasks: Task[]
}

type CriticalIssue = {
    type: string
    severity: 'critical' | 'warning' | 'info'
    message: string
    count: number
    tasks: Task[]
}

type Project = {
    id: string
    name: string
    color: string
    leadName: string | null
}

type HeatmapViewProps = {
    userStats: UserStat[]
    bottlenecks: {
        totalOverdue: number
        totalStuck: number
        totalUnassigned: number
        totalHelpRequests: number
        tasksInReview: number
        overdueThisWeek: number
    }
    criticalIssues: CriticalIssue[]
    projects: Project[]
    overloadedUsers: string[]
    idleUsers: string[]
    allTasks: Task[]
}

function getWorkloadColor(score: number, maxScore: number): string {
    const ratio = score / Math.max(maxScore, 1)
    if (ratio < 0.3) return 'bg-green-100 dark:bg-green-900/30'
    if (ratio < 0.5) return 'bg-green-200 dark:bg-green-800/40'
    if (ratio < 0.7) return 'bg-yellow-100 dark:bg-yellow-900/30'
    if (ratio < 0.85) return 'bg-orange-100 dark:bg-orange-900/30'
    return 'bg-red-100 dark:bg-red-900/30'
}

function getWorkloadTextColor(score: number, maxScore: number): string {
    const ratio = score / Math.max(maxScore, 1)
    if (ratio < 0.5) return 'text-green-700 dark:text-green-400'
    if (ratio < 0.7) return 'text-yellow-700 dark:text-yellow-400'
    if (ratio < 0.85) return 'text-orange-700 dark:text-orange-400'
    return 'text-red-700 dark:text-red-400'
}

function TaskListDialog({
    open,
    onOpenChange,
    title,
    tasks
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    tasks: Task[]
}) {
    const router = useRouter()
    const [navigating, setNavigating] = useState<string | null>(null)

    const handleClick = (task: Task) => {
        setNavigating(task.id)
        let url = `/dashboard/projects/${task.projectId}?task=${task.id}`
        if (task.pushId) url += `&push=${task.pushId}`
        router.push(url)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[70vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-sm">{title}</DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-1">
                    {tasks.map(task => (
                        <button
                            key={task.id}
                            onClick={() => handleClick(task)}
                            disabled={navigating === task.id}
                            className="w-full flex items-center justify-between p-2 rounded-md border hover:bg-muted/50 transition-colors text-left"
                        >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: task.projectColor }}
                                />
                                <span className="text-xs truncate">{task.title}</span>
                                <span className="text-[9px] text-muted-foreground shrink-0">
                                    {task.columnName}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {task.isOverdue && (
                                    <span className="text-[9px] text-red-500">Overdue</span>
                                )}
                                {task.isStuck && (
                                    <span className="text-[9px] text-amber-500">Stuck</span>
                                )}
                                {task.isBlockedByHelp && (
                                    <HelpCircle className="h-3 w-3 text-amber-500" />
                                )}
                                {navigating === task.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                ) : (
                                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                )}
                            </div>
                        </button>
                    ))}
                    {tasks.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">No tasks</p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

export function HeatmapView({
    userStats,
    bottlenecks,
    criticalIssues,
    projects,
    overloadedUsers,
    idleUsers,
    allTasks
}: HeatmapViewProps) {
    const [selectedIssue, setSelectedIssue] = useState<CriticalIssue | null>(null)
    const [selectedUser, setSelectedUser] = useState<UserStat | null>(null)

    const maxWorkload = Math.max(...userStats.map(u => u.workloadScore), 1)
    const totalActiveTasks = allTasks.filter(t => t.columnName !== 'Done').length
    const availableUsers = userStats.filter(user => user.status === 'available')

    // Sort users by workload
    const sortedUsers = [...userStats].sort((a, b) => b.workloadScore - a.workloadScore)

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="shrink-0 border-b bg-background p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-lg font-semibold flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-primary" />
                            Work Distribution
                        </h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {totalActiveTasks} active tasks across {userStats.length} team members
                        </p>
                    </div>
                    <Link href="/dashboard">
                        <Button variant="ghost" size="sm" className="h-8 text-xs">
                            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                            Back
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Critical Issues Alert Bar */}
                {criticalIssues.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        {criticalIssues.slice(0, 4).map((issue, i) => (
                            <button
                                key={i}
                                onClick={() => issue.tasks.length > 0 && setSelectedIssue(issue)}
                                className={cn(
                                    "p-3 rounded-lg border text-left transition-colors",
                                    issue.severity === 'critical' && "bg-red-50 border-red-200 hover:bg-red-100 dark:bg-red-950/30 dark:border-red-900/50",
                                    issue.severity === 'warning' && "bg-amber-50 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-900/50",
                                    issue.severity === 'info' && "bg-blue-50 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/30 dark:border-blue-900/50"
                                )}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    {issue.type === 'overdue' && <Clock className="h-4 w-4 text-red-500" />}
                                    {issue.type === 'stuck' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                                    {issue.type === 'help' && <HelpCircle className="h-4 w-4 text-amber-500" />}
                                    {issue.type === 'unassigned' && <UserX className="h-4 w-4 text-blue-500" />}
                                    {issue.type === 'review_queue' && <Target className="h-4 w-4 text-amber-500" />}
                                    {issue.type === 'overloaded' && <Zap className="h-4 w-4 text-amber-500" />}
                                    <span className={cn(
                                        "text-lg font-bold",
                                        issue.severity === 'critical' && "text-red-600",
                                        issue.severity === 'warning' && "text-amber-600",
                                        issue.severity === 'info' && "text-blue-600"
                                    )}>
                                        {issue.count}
                                    </span>
                                </div>
                                <p className="text-[10px] text-muted-foreground line-clamp-2">
                                    {issue.message}
                                </p>
                            </button>
                        ))}
                    </div>
                )}

                {/* Workload Heatmap Grid */}
                <div className="border rounded-lg p-3">

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {sortedUsers.map(user => {
                            const status = user.status

                            return (
                                <button
                                    key={user.id}
                                    onClick={() => setSelectedUser(user)}
                                    className={cn(
                                        "p-3 rounded-lg border transition-all hover:shadow-md",
                                        getWorkloadColor(user.workloadScore, maxWorkload),
                                        status === 'struggling' && "ring-2 ring-red-400",
                                        status === 'available' && "ring-2 ring-blue-400"
                                    )}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-xs font-medium shrink-0 border">
                                            {user.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 text-left">
                                            <p className="text-xs font-medium truncate">{user.name}</p>
                                            <p className="text-[9px] text-muted-foreground">{user.role}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-4 gap-1 text-center">
                                        <div className="bg-background/50 rounded p-1">
                                            <p className="text-[9px] text-muted-foreground">To Do</p>
                                            <p className="text-xs font-bold">{user.todoTasks}</p>
                                        </div>
                                        <div className="bg-background/50 rounded p-1">
                                            <p className="text-[9px] text-muted-foreground">Active</p>
                                            <p className="text-xs font-bold">{user.inProgressTasks}</p>
                                        </div>
                                        <div className="bg-background/50 rounded p-1">
                                            <p className="text-[9px] text-muted-foreground">Review</p>
                                            <p className="text-xs font-bold">{user.reviewTasks}</p>
                                        </div>
                                        <div className="bg-background/50 rounded p-1">
                                            <p className="text-[9px] text-muted-foreground">Done</p>
                                            <p className="text-xs font-bold text-green-600">{user.doneTasks}</p>
                                        </div>
                                    </div>

                                    {/* Issue indicators */}
                                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                                        {user.overdueTasks > 0 && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/50">
                                                {user.overdueTasks} overdue
                                            </span>
                                        )}
                                        {user.stuckTasks > 0 && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 dark:bg-amber-900/50">
                                                {user.stuckTasks} stuck
                                            </span>
                                        )}
                                        {user.helpRequestTasks > 0 && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 dark:bg-amber-900/50">
                                                {user.helpRequestTasks} help
                                            </span>
                                        )}
                                        <span
                                            className={cn(
                                                "text-[9px] px-1.5 py-0.5 rounded",
                                                status === 'struggling' && "bg-red-100 text-red-600 dark:bg-red-900/50",
                                                status === 'available' && "bg-blue-100 text-blue-600 dark:bg-blue-900/50",
                                                status === 'on-track' && "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50"
                                            )}
                                        >
                                            {status === 'struggling' ? 'Struggling' : status === 'available' ? 'Available' : 'On track'}
                                        </span>
                                    </div>

                                    {/* Workload bar */}
                                    <div className="mt-2">
                                        <div className="h-1 bg-background rounded-full overflow-hidden">
                                            <div
                                                className={cn(
                                                    "h-full rounded-full transition-all",
                                                    user.workloadScore / maxWorkload < 0.5 ? "bg-green-500" :
                                                        user.workloadScore / maxWorkload < 0.75 ? "bg-yellow-500" :
                                                            user.workloadScore / maxWorkload < 0.9 ? "bg-orange-500" : "bg-red-500"
                                                )}
                                                style={{ width: `${Math.min((user.workloadScore / maxWorkload) * 100, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </button>
                            )
                        })}
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-4 mt-4 pt-4 border-t text-[10px] text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-green-200 dark:bg-green-800/40" />
                            <span>Low workload</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-yellow-100 dark:bg-yellow-900/30" />
                            <span>Medium</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-orange-100 dark:bg-orange-900/30" />
                            <span>High</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-red-100 dark:bg-red-900/30" />
                            <span>Overloaded</span>
                        </div>
                        <div className="flex items-center gap-1.5 ml-4">
                            <div className="w-3 h-3 rounded border-2 border-blue-400" />
                            <span>Available for work</span>
                        </div>
                    </div>
                </div>

                {/* Bottleneck Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Unassigned Tasks */}
                    {bottlenecks.totalUnassigned > 0 && (
                        <div className="border rounded-lg p-4">
                            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                                <UserX className="h-4 w-4 text-muted-foreground" />
                                Unassigned Tasks ({bottlenecks.totalUnassigned})
                            </h3>
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                                {allTasks.filter(t => t.isUnassigned).slice(0, 10).map(task => (
                                    <Link
                                        key={task.id}
                                        href={`/dashboard/projects/${task.projectId}?task=${task.id}`}
                                        className="flex items-center justify-between p-2 rounded hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div
                                                className="w-2 h-2 rounded-full shrink-0"
                                                style={{ backgroundColor: task.projectColor }}
                                            />
                                            <span className="text-xs truncate">{task.title}</span>
                                        </div>
                                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Available Team Members */}
                    {availableUsers.length > 0 && (
                        <div className="border rounded-lg p-4">
                            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                Available for Work ({availableUsers.length})
                            </h3>
                            <div className="space-y-2">
                                {availableUsers.map(user => (
                                    <div
                                        key={user.id}
                                        className="flex items-center gap-2 p-2 rounded bg-green-50 dark:bg-green-950/30"
                                    >
                                        <div className="w-6 h-6 rounded-full bg-background flex items-center justify-center text-[10px] font-medium border">
                                            {user.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium">{user.name}</p>
                                            <p className="text-[9px] text-muted-foreground">
                                                {user.doneTasks} tasks completed
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Task List Dialog for Issues */}
            <TaskListDialog
                open={!!selectedIssue}
                onOpenChange={() => setSelectedIssue(null)}
                title={selectedIssue?.message || ''}
                tasks={selectedIssue?.tasks || []}
            />

            {/* User Tasks Dialog */}
            <TaskListDialog
                open={!!selectedUser}
                onOpenChange={() => setSelectedUser(null)}
                title={`${selectedUser?.name}'s Tasks (${selectedUser?.activeTasks} active)`}
                tasks={selectedUser?.tasks.filter(t => t.columnName !== 'Done') || []}
            />
        </div>
    )
}
