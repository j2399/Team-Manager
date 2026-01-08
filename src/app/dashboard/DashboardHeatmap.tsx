"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
    AlertTriangle, Clock, HelpCircle, UserX, ChevronRight, Loader2,
    Users, Zap, Target, CheckCircle2, BarChart3
} from "lucide-react"
import { cn } from "@/lib/utils"
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
    projectId: string
    projectName: string
    projectColor: string
    pushId: string | null
    assigneeIds: string[]
    isOverdue: boolean
    isStuck: boolean
    isBlockedByHelp: boolean
    isUnassigned: boolean
}

type UserStat = {
    id: string
    name: string
    avatar: string | null
    role: string
    activeTasks: number
    todoTasks: number
    inProgressTasks: number
    reviewTasks: number
    doneTasks: number
    overdueTasks: number
    stuckTasks: number
    helpRequestTasks: number
    workloadScore: number
    tasks: Task[]
}

type CriticalIssue = {
    type: string
    severity: 'critical' | 'warning' | 'info'
    message: string
    count: number
    tasks: Task[]
}

type DashboardHeatmapProps = {
    userStats: UserStat[]
    criticalIssues: CriticalIssue[]
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

export function DashboardHeatmap({
    userStats,
    criticalIssues,
    overloadedUsers,
    idleUsers,
    allTasks
}: DashboardHeatmapProps) {
    const [selectedIssue, setSelectedIssue] = useState<CriticalIssue | null>(null)
    const [selectedUser, setSelectedUser] = useState<UserStat | null>(null)

    const maxWorkload = Math.max(...userStats.map(u => u.workloadScore), 1)
    const totalActiveTasks = allTasks.filter(t => t.columnName !== 'Done').length

    // Sort users by workload
    const sortedUsers = [...userStats].sort((a, b) => b.workloadScore - a.workloadScore)

    if (criticalIssues.length === 0 && userStats.length === 0) {
        return null
    }

    const unassignedTasks = allTasks.filter(t => t.isUnassigned)

    return (
        <section className="border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium flex items-center gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                    Team Heatmap
                </h2>
                <span className="text-[10px] text-muted-foreground">
                    {totalActiveTasks} active tasks
                </span>
            </div>

            {/* Critical Issues Alert Cards */}
            {criticalIssues.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
                    {criticalIssues.slice(0, 4).map((issue, i) => (
                        <button
                            key={i}
                            onClick={() => issue.tasks.length > 0 && setSelectedIssue(issue)}
                            className={cn(
                                "p-2 rounded-md border text-left transition-colors",
                                issue.severity === 'critical' && "bg-red-50 border-red-200 hover:bg-red-100 dark:bg-red-950/30 dark:border-red-900/50",
                                issue.severity === 'warning' && "bg-amber-50 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-900/50",
                                issue.severity === 'info' && "bg-blue-50 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/30 dark:border-blue-900/50"
                            )}
                        >
                            <div className="flex items-center gap-1.5">
                                {issue.type === 'overdue' && <Clock className="h-3.5 w-3.5 text-red-500" />}
                                {issue.type === 'stuck' && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                                {issue.type === 'help' && <HelpCircle className="h-3.5 w-3.5 text-amber-500" />}
                                {issue.type === 'unassigned' && <UserX className="h-3.5 w-3.5 text-blue-500" />}
                                {issue.type === 'review_queue' && <Target className="h-3.5 w-3.5 text-amber-500" />}
                                {issue.type === 'overloaded' && <Zap className="h-3.5 w-3.5 text-amber-500" />}
                                <span className={cn(
                                    "text-sm font-bold",
                                    issue.severity === 'critical' && "text-red-600",
                                    issue.severity === 'warning' && "text-amber-600",
                                    issue.severity === 'info' && "text-blue-600"
                                )}>
                                    {issue.count}
                                </span>
                            </div>
                            <p className="text-[9px] text-muted-foreground mt-0.5 line-clamp-1">
                                {issue.type === 'overdue' && 'overdue tasks'}
                                {issue.type === 'stuck' && 'stuck (3+ days)'}
                                {issue.type === 'help' && 'need help'}
                                {issue.type === 'unassigned' && 'unassigned'}
                                {issue.type === 'review_queue' && 'in review'}
                                {issue.type === 'overloaded' && 'overloaded'}
                            </p>
                        </button>
                    ))}
                </div>
            )}

            {/* Workload Distribution Grid */}
            <div className="mb-4">
                <h3 className="text-[10px] font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    Workload Distribution
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {sortedUsers.slice(0, 8).map(user => {
                        const isOverloaded = overloadedUsers.includes(user.id)
                        const isIdle = idleUsers.includes(user.id)

                        return (
                            <button
                                key={user.id}
                                onClick={() => setSelectedUser(user)}
                                className={cn(
                                    "p-2 rounded-md border transition-all hover:shadow-sm text-left",
                                    getWorkloadColor(user.workloadScore, maxWorkload),
                                    isOverloaded && "ring-2 ring-red-400",
                                    isIdle && "ring-2 ring-blue-400"
                                )}
                            >
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <div className="w-5 h-5 rounded-full bg-background flex items-center justify-center text-[9px] font-medium shrink-0 border">
                                        {user.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-medium truncate">{user.name.split(' ')[0]}</p>
                                    </div>
                                </div>

                                {/* Task counts */}
                                <div className="grid grid-cols-4 gap-0.5 text-center mb-1.5">
                                    <div className="bg-background/50 rounded px-0.5 py-0.5">
                                        <p className="text-[8px] text-muted-foreground">TD</p>
                                        <p className="text-[10px] font-bold">{user.todoTasks}</p>
                                    </div>
                                    <div className="bg-background/50 rounded px-0.5 py-0.5">
                                        <p className="text-[8px] text-muted-foreground">IP</p>
                                        <p className="text-[10px] font-bold">{user.inProgressTasks}</p>
                                    </div>
                                    <div className="bg-background/50 rounded px-0.5 py-0.5">
                                        <p className="text-[8px] text-muted-foreground">RV</p>
                                        <p className="text-[10px] font-bold">{user.reviewTasks}</p>
                                    </div>
                                    <div className="bg-background/50 rounded px-0.5 py-0.5">
                                        <p className="text-[8px] text-muted-foreground">DN</p>
                                        <p className="text-[10px] font-bold text-green-600">{user.doneTasks}</p>
                                    </div>
                                </div>

                                {/* Issue badges */}
                                <div className="flex items-center gap-1 flex-wrap">
                                    {user.overdueTasks > 0 && (
                                        <span className="text-[8px] px-1 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/50">
                                            {user.overdueTasks} late
                                        </span>
                                    )}
                                    {user.stuckTasks > 0 && (
                                        <span className="text-[8px] px-1 py-0.5 rounded bg-amber-100 text-amber-600 dark:bg-amber-900/50">
                                            {user.stuckTasks} stuck
                                        </span>
                                    )}
                                    {user.helpRequestTasks > 0 && (
                                        <span className="text-[8px] px-1 py-0.5 rounded bg-amber-100 text-amber-600 dark:bg-amber-900/50">
                                            {user.helpRequestTasks} help
                                        </span>
                                    )}
                                    {isIdle && (
                                        <span className="text-[8px] px-1 py-0.5 rounded bg-blue-100 text-blue-600 dark:bg-blue-900/50">
                                            Free
                                        </span>
                                    )}
                                </div>

                                {/* Workload bar */}
                                <div className="mt-1.5">
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
                {sortedUsers.length > 8 && (
                    <p className="text-[9px] text-muted-foreground text-center mt-2">
                        +{sortedUsers.length - 8} more team members
                    </p>
                )}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 pt-3 border-t text-[9px] text-muted-foreground flex-wrap">
                <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded bg-green-200 dark:bg-green-800/40" />
                    <span>Low</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded bg-yellow-100 dark:bg-yellow-900/30" />
                    <span>Medium</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded bg-orange-100 dark:bg-orange-900/30" />
                    <span>High</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded bg-red-100 dark:bg-red-900/30" />
                    <span>Overloaded</span>
                </div>
                <div className="flex items-center gap-1 ml-2">
                    <div className="w-2.5 h-2.5 rounded border-2 border-blue-400" />
                    <span>Available</span>
                </div>
            </div>

            {/* Bottom row: Unassigned + Available */}
            {(unassignedTasks.length > 0 || idleUsers.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 pt-3 border-t">
                    {/* Unassigned Tasks */}
                    {unassignedTasks.length > 0 && (
                        <div>
                            <h4 className="text-[10px] font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                <UserX className="h-3 w-3" />
                                Unassigned ({unassignedTasks.length})
                            </h4>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                {unassignedTasks.slice(0, 5).map(task => (
                                    <Link
                                        key={task.id}
                                        href={`/dashboard/projects/${task.projectId}?task=${task.id}`}
                                        className="flex items-center justify-between p-1.5 rounded hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <div
                                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                                style={{ backgroundColor: task.projectColor }}
                                            />
                                            <span className="text-[10px] truncate">{task.title}</span>
                                        </div>
                                        <ChevronRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                                    </Link>
                                ))}
                                {unassignedTasks.length > 5 && (
                                    <p className="text-[9px] text-muted-foreground text-center">
                                        +{unassignedTasks.length - 5} more
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Available Team Members */}
                    {idleUsers.length > 0 && (
                        <div>
                            <h4 className="text-[10px] font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                                Available ({idleUsers.length})
                            </h4>
                            <div className="space-y-1">
                                {userStats.filter(u => idleUsers.includes(u.id)).slice(0, 4).map(user => (
                                    <div
                                        key={user.id}
                                        className="flex items-center gap-2 p-1.5 rounded bg-green-50 dark:bg-green-950/30"
                                    >
                                        <div className="w-4 h-4 rounded-full bg-background flex items-center justify-center text-[8px] font-medium border">
                                            {user.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-medium truncate">{user.name}</p>
                                            <p className="text-[8px] text-muted-foreground">
                                                {user.doneTasks} completed
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

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
        </section>
    )
}
