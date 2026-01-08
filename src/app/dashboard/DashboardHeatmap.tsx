"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
    AlertTriangle, Clock, HelpCircle, UserX, ChevronRight, Loader2,
    Users, Zap, Target, CheckCircle2, BarChart3, ChevronDown, Plus
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"

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

function AssignTasksDialog({
    open,
    onOpenChange,
    user,
    unassignedTasks,
    onAssign
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    user: UserStat | null
    unassignedTasks: Task[]
    onAssign: (taskIds: string[], userId: string) => Promise<void>
}) {
    const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())
    const [isAssigning, setIsAssigning] = useState(false)

    const toggleTask = (taskId: string) => {
        setSelectedTasks(prev => {
            const next = new Set(prev)
            if (next.has(taskId)) next.delete(taskId)
            else next.add(taskId)
            return next
        })
    }

    const handleAssign = async () => {
        if (!user || selectedTasks.size === 0) return
        setIsAssigning(true)
        await onAssign(Array.from(selectedTasks), user.id)
        setIsAssigning(false)
        setSelectedTasks(new Set())
        onOpenChange(false)
    }

    if (!user) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-sm flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Assign Tasks to {user.name}
                    </DialogTitle>
                </DialogHeader>

                <div className="py-2">
                    <p className="text-xs text-muted-foreground mb-3">
                        Select unassigned tasks to assign to {user.name.split(' ')[0]}.
                        Current workload: {user.activeTasks} active tasks.
                    </p>

                    <div className="flex-1 overflow-y-auto max-h-[40vh] space-y-1 border rounded-md p-2">
                        {unassignedTasks.length > 0 ? (
                            unassignedTasks.map(task => (
                                <div
                                    key={task.id}
                                    onClick={() => toggleTask(task.id)}
                                    className={cn(
                                        "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                                        selectedTasks.has(task.id)
                                            ? "bg-primary/10 border border-primary/30"
                                            : "hover:bg-muted/50"
                                    )}
                                >
                                    <Checkbox checked={selectedTasks.has(task.id)} />
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ backgroundColor: task.projectColor }}
                                        />
                                        <span className="text-xs truncate">{task.title}</span>
                                    </div>
                                    <span className="text-[9px] text-muted-foreground shrink-0">
                                        {task.projectName}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <p className="text-xs text-muted-foreground text-center py-8">
                                No unassigned tasks available
                            </p>
                        )}
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleAssign}
                        disabled={selectedTasks.size === 0 || isAssigning}
                    >
                        {isAssigning ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        ) : (
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Assign {selectedTasks.size > 0 ? `(${selectedTasks.size})` : ''}
                    </Button>
                </DialogFooter>
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
    const router = useRouter()
    const [selectedIssue, setSelectedIssue] = useState<CriticalIssue | null>(null)
    const [selectedUser, setSelectedUser] = useState<UserStat | null>(null)
    const [assigningToUser, setAssigningToUser] = useState<UserStat | null>(null)
    const [showAllMembers, setShowAllMembers] = useState(false)

    const maxWorkload = Math.max(...userStats.map(u => u.workloadScore), 1)
    const totalActiveTasks = allTasks.filter(t => t.columnName !== 'Done').length

    // Sort users by workload
    const sortedUsers = [...userStats].sort((a, b) => b.workloadScore - a.workloadScore)
    const displayedUsers = showAllMembers ? sortedUsers : sortedUsers.slice(0, 8)

    const unassignedTasks = allTasks.filter(t => t.isUnassigned)

    const handleAssignTasks = async (taskIds: string[], userId: string) => {
        try {
            for (const taskId of taskIds) {
                await fetch(`/api/tasks/${taskId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ assigneeIds: [userId] })
                })
            }
            router.refresh()
        } catch (error) {
            console.error('Failed to assign tasks:', error)
        }
    }

    if (criticalIssues.length === 0 && userStats.length === 0) {
        return null
    }

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
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Workload Distribution
                    </h3>
                    {sortedUsers.length > 8 && (
                        <button
                            onClick={() => setShowAllMembers(!showAllMembers)}
                            className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                        >
                            {showAllMembers ? 'Show less' : `Show all (${sortedUsers.length})`}
                            <ChevronDown className={cn("h-3 w-3 transition-transform", showAllMembers && "rotate-180")} />
                        </button>
                    )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {displayedUsers.map(user => {
                        const isOverloaded = overloadedUsers.includes(user.id)
                        const isIdle = idleUsers.includes(user.id)

                        return (
                            <div
                                key={user.id}
                                className={cn(
                                    "p-2 rounded-md border transition-all text-left relative group",
                                    getWorkloadColor(user.workloadScore, maxWorkload),
                                    isOverloaded && "ring-2 ring-red-400",
                                    isIdle && "ring-2 ring-blue-400"
                                )}
                            >
                                {/* User header - clickable for view tasks */}
                                <button
                                    onClick={() => setSelectedUser(user)}
                                    className="w-full text-left"
                                >
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                        <div className="w-5 h-5 rounded-full bg-background flex items-center justify-center text-[9px] font-medium shrink-0 border">
                                            {user.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
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

                                {/* Assign button - appears on hover */}
                                {unassignedTasks.length > 0 && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setAssigningToUser(user)
                                        }}
                                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                                        title="Assign tasks"
                                    >
                                        <Plus className="h-3 w-3" />
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>
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
                <div className="flex items-center gap-1 ml-auto">
                    <span className="text-muted-foreground">Hover card + click</span>
                    <Plus className="h-2.5 w-2.5" />
                    <span>to assign</span>
                </div>
            </div>

            {/* Unassigned Tasks Quick View */}
            {unassignedTasks.length > 0 && (
                <div className="mt-4 pt-3 border-t">
                    <h4 className="text-[10px] font-medium text-muted-foreground mb-2 flex items-center gap-1">
                        <UserX className="h-3 w-3" />
                        Unassigned Tasks ({unassignedTasks.length})
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

            {/* Assign Tasks Dialog */}
            <AssignTasksDialog
                open={!!assigningToUser}
                onOpenChange={() => setAssigningToUser(null)}
                user={assigningToUser}
                unassignedTasks={unassignedTasks}
                onAssign={handleAssignTasks}
            />
        </section>
    )
}
