"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
    ChevronRight, Loader2, Plus, UserX, TrendingUp, TrendingDown,
    Calendar, Clock, CheckCircle2, AlertCircle, HelpCircle, X
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

type WorkloadHistory = {
    date: string
    submitted: number
    approved: number
}

// Stacked task cards visual indicator
function TaskStack({ count }: { count: number }) {
    if (count === 0) {
        return (
            <div className="h-6 flex items-center">
                <span className="text-[8px] text-muted-foreground">No tasks</span>
            </div>
        )
    }

    const displayCount = Math.min(count, 6)

    return (
        <div className="relative h-6 flex items-end">
            {Array.from({ length: displayCount }).map((_, idx) => (
                <div
                    key={idx}
                    className="absolute bottom-0 h-5 w-8 rounded-sm bg-muted border border-border shadow-sm flex items-center justify-center"
                    style={{
                        left: `${idx * 6}px`,
                        zIndex: displayCount - idx
                    }}
                >
                    <span className="text-[6px] text-muted-foreground/50 font-medium">task</span>
                </div>
            ))}
        </div>
    )
}

// Workload history sparkline chart
function WorkloadSparkline({ history }: { history: WorkloadHistory[] }) {
    if (history.length === 0) {
        return (
            <div className="h-12 flex items-center justify-center text-[9px] text-muted-foreground/60 italic">
                No activity data yet
            </div>
        )
    }

    const width = 200
    const height = 40
    const padding = { top: 4, right: 4, bottom: 12, left: 4 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    // Calculate cumulative values
    let cumSubmitted = 0
    let cumApproved = 0
    const data = history.map(h => {
        cumSubmitted += h.submitted
        cumApproved += h.approved
        return {
            date: new Date(h.date),
            submitted: cumSubmitted,
            approved: cumApproved
        }
    })

    const maxValue = Math.max(...data.map(d => Math.max(d.submitted, d.approved)), 1)
    const minDate = data[0].date.getTime()
    const maxDate = data[data.length - 1].date.getTime()
    const dateRange = maxDate - minDate || 1

    const getX = (date: Date) => padding.left + ((date.getTime() - minDate) / dateRange) * chartWidth
    const getY = (value: number) => padding.top + chartHeight - (value / maxValue) * chartHeight

    // Build paths
    let submittedPath = `M ${getX(data[0].date)} ${getY(data[0].submitted)}`
    let approvedPath = `M ${getX(data[0].date)} ${getY(data[0].approved)}`

    data.slice(1).forEach(d => {
        submittedPath += ` L ${getX(d.date)} ${getY(d.submitted)}`
        approvedPath += ` L ${getX(d.date)} ${getY(d.approved)}`
    })

    return (
        <svg width={width} height={height} className="overflow-visible">
            {/* Submitted line */}
            <path
                d={submittedPath}
                fill="none"
                className="stroke-blue-400"
                strokeWidth={1.5}
                strokeLinecap="round"
            />
            {/* Approved line */}
            <path
                d={approvedPath}
                fill="none"
                className="stroke-emerald-400"
                strokeWidth={1.5}
                strokeLinecap="round"
            />
            {/* End points */}
            <circle cx={getX(data[data.length - 1].date)} cy={getY(data[data.length - 1].submitted)} r={2} className="fill-blue-500" />
            <circle cx={getX(data[data.length - 1].date)} cy={getY(data[data.length - 1].approved)} r={2} className="fill-emerald-500" />

            {/* Labels */}
            <text x={width - padding.right} y={getY(data[data.length - 1].submitted) - 3} className="text-[7px] fill-blue-500" textAnchor="end">
                {data[data.length - 1].submitted}
            </text>
            <text x={width - padding.right} y={getY(data[data.length - 1].approved) + 8} className="text-[7px] fill-emerald-500" textAnchor="end">
                {data[data.length - 1].approved}
            </text>
        </svg>
    )
}

// Detailed user profile dialog
function UserDetailDialog({
    open,
    onOpenChange,
    user,
    unassignedTasks,
    onAssignClick,
    onAssignTasks
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    user: UserStat | null
    unassignedTasks: Task[]
    onAssignClick: () => void
    onAssignTasks: (taskIds: string[], userId: string) => Promise<void>
}) {
    const router = useRouter()
    const [workloadHistory, setWorkloadHistory] = useState<WorkloadHistory[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)

    useEffect(() => {
        if (open && user) {
            fetchWorkloadHistory(user.id)
        }
    }, [open, user])

    const fetchWorkloadHistory = async (userId: string) => {
        setLoadingHistory(true)
        try {
            const res = await fetch(`/api/users/${userId}/workload-history`)
            if (res.ok) {
                const data = await res.json()
                setWorkloadHistory(data.history || [])
            }
        } catch (error) {
            console.error('Failed to fetch workload history:', error)
        } finally {
            setLoadingHistory(false)
        }
    }

    if (!user) return null

    const handleTaskClick = (task: Task) => {
        let url = `/dashboard/projects/${task.projectId}?highlight=${task.id}`
        if (task.pushId) url += `&push=${task.pushId}`
        router.push(url)
        onOpenChange(false)
    }

    // Group tasks by status
    const todoTasks = user.tasks.filter(t => t.columnName === 'To Do')
    const inProgressTasks = user.tasks.filter(t => t.columnName === 'In Progress')
    const reviewTasks = user.tasks.filter(t => t.columnName === 'Review')
    const doneTasks = user.tasks.filter(t => t.columnName === 'Done')

    // Calculate stats
    const completionRate = user.tasks.length > 0
        ? Math.round((doneTasks.length / user.tasks.length) * 100)
        : 0

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
                {/* Header */}
                <div className="p-6 pb-4 border-b bg-muted/30">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            {user.avatar ? (
                                <img
                                    src={user.avatar}
                                    alt={user.name}
                                    className="w-12 h-12 rounded-full border-2 border-background shadow-md"
                                />
                            ) : (
                                <div className="w-12 h-12 rounded-full bg-primary/10 border-2 border-background shadow-md flex items-center justify-center text-lg font-bold text-primary">
                                    {user.name.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div>
                                <h2 className="text-base font-semibold">{user.name}</h2>
                                <p className="text-xs text-muted-foreground">{user.role}</p>
                            </div>
                        </div>

                        {/* Stats inline */}
                        <div className="flex items-center gap-5">
                            <div className="text-center">
                                <p className="text-lg font-bold">{user.activeTasks}</p>
                                <p className="text-[9px] text-muted-foreground">Active</p>
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-bold">{doneTasks.length}</p>
                                <p className="text-[9px] text-muted-foreground">Done</p>
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-bold">{completionRate}%</p>
                                <p className="text-[9px] text-muted-foreground">Rate</p>
                            </div>
                            <div className="text-center">
                                {user.overdueTasks > 0 ? (
                                    <>
                                        <p className="text-lg font-bold">{user.overdueTasks}</p>
                                        <p className="text-[9px] text-muted-foreground">Overdue</p>
                                    </>
                                ) : user.stuckTasks > 0 ? (
                                    <>
                                        <p className="text-lg font-bold">{user.stuckTasks}</p>
                                        <p className="text-[9px] text-muted-foreground">Stuck</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-lg font-bold">✓</p>
                                        <p className="text-[9px] text-muted-foreground">On Track</p>
                                    </>
                                )}
                            </div>

                            {unassignedTasks.length > 0 && (
                                <Button size="sm" onClick={onAssignClick} className="ml-2">
                                    <Plus className="h-4 w-4 mr-1" />
                                    Assign
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    {/* Workload History */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-medium">Activity Over Time</h3>
                            <div className="flex items-center gap-3 text-[9px]">
                                <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                                    Submitted
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                    Approved
                                </span>
                            </div>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-4 border">
                            {loadingHistory ? (
                                <div className="h-12 flex items-center justify-center">
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </div>
                            ) : (
                                <WorkloadSparkline history={workloadHistory} />
                            )}
                        </div>
                    </div>

                    {/* Kanban Board */}
                    <h3 className="text-sm font-medium mb-3">Current Tasks</h3>
                    <div className="grid grid-cols-4 gap-3">
                        {/* To Do */}
                        <div className="border rounded-lg overflow-hidden">
                            <div className="bg-muted/50 px-2 py-1.5 flex items-center justify-between border-b">
                                <span className="text-[10px] font-medium">To Do</span>
                                <span className="text-[9px] text-muted-foreground">{todoTasks.length}</span>
                            </div>
                            <div className="p-1.5 space-y-1.5 max-h-[280px] overflow-auto">
                                {todoTasks.length > 0 ? todoTasks.map(task => (
                                    <button
                                        key={task.id}
                                        onClick={() => handleTaskClick(task)}
                                        className="w-full text-left p-2 rounded border bg-background hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-start gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1" style={{ backgroundColor: task.projectColor }} />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[11px] font-medium leading-snug line-clamp-2">{task.title}</p>
                                                <p className="text-[9px] text-muted-foreground mt-0.5">{task.projectName}</p>
                                            </div>
                                        </div>
                                        {task.isOverdue && (
                                            <div className="flex items-center gap-1 mt-1.5 text-[9px] text-red-500">
                                                <AlertCircle className="h-2.5 w-2.5" />
                                                Overdue
                                            </div>
                                        )}
                                    </button>
                                )) : (
                                    <p className="text-[9px] text-muted-foreground text-center py-6">No tasks</p>
                                )}
                            </div>
                        </div>

                        {/* In Progress */}
                        <div className="border rounded-lg overflow-hidden">
                            <div className="bg-muted/50 px-2 py-1.5 flex items-center justify-between border-b">
                                <span className="text-[10px] font-medium">In Progress</span>
                                <span className="text-[9px] text-muted-foreground">{inProgressTasks.length}</span>
                            </div>
                            <div className="p-1.5 space-y-1.5 max-h-[280px] overflow-auto">
                                {inProgressTasks.length > 0 ? inProgressTasks.map(task => (
                                    <button
                                        key={task.id}
                                        onClick={() => handleTaskClick(task)}
                                        className="w-full text-left p-2 rounded border bg-background hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-start gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1" style={{ backgroundColor: task.projectColor }} />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[11px] font-medium leading-snug line-clamp-2">{task.title}</p>
                                                <p className="text-[9px] text-muted-foreground mt-0.5">{task.projectName}</p>
                                            </div>
                                        </div>
                                        {(task.isStuck || task.isBlockedByHelp) && (
                                            <div className="flex items-center gap-1 mt-1.5 text-[9px] text-amber-600">
                                                {task.isStuck && <><Clock className="h-2.5 w-2.5" /> Stuck</>}
                                                {task.isBlockedByHelp && <><HelpCircle className="h-2.5 w-2.5" /> Needs help</>}
                                            </div>
                                        )}
                                    </button>
                                )) : (
                                    <p className="text-[9px] text-muted-foreground text-center py-6">No tasks</p>
                                )}
                            </div>
                        </div>

                        {/* Review */}
                        <div className="border rounded-lg overflow-hidden">
                            <div className="bg-muted/50 px-2 py-1.5 flex items-center justify-between border-b">
                                <span className="text-[10px] font-medium">Review</span>
                                <span className="text-[9px] text-muted-foreground">{reviewTasks.length}</span>
                            </div>
                            <div className="p-1.5 space-y-1.5 max-h-[280px] overflow-auto">
                                {reviewTasks.length > 0 ? reviewTasks.map(task => (
                                    <button
                                        key={task.id}
                                        onClick={() => handleTaskClick(task)}
                                        className="w-full text-left p-2 rounded border bg-background hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-start gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1" style={{ backgroundColor: task.projectColor }} />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[11px] font-medium leading-snug line-clamp-2">{task.title}</p>
                                                <p className="text-[9px] text-muted-foreground mt-0.5">{task.projectName}</p>
                                            </div>
                                        </div>
                                    </button>
                                )) : (
                                    <p className="text-[9px] text-muted-foreground text-center py-6">No tasks</p>
                                )}
                            </div>
                        </div>

                        {/* Done */}
                        <div className="border rounded-lg overflow-hidden">
                            <div className="bg-muted/50 px-2 py-1.5 flex items-center justify-between border-b">
                                <span className="text-[10px] font-medium">Done</span>
                                <span className="text-[9px] text-muted-foreground">{doneTasks.length}</span>
                            </div>
                            <div className="p-1.5 space-y-1.5 max-h-[280px] overflow-auto">
                                {doneTasks.length > 0 ? doneTasks.slice(0, 8).map(task => (
                                    <button
                                        key={task.id}
                                        onClick={() => handleTaskClick(task)}
                                        className="w-full text-left p-2 rounded border bg-background/50 hover:bg-muted/50 transition-colors opacity-70"
                                    >
                                        <div className="flex items-start gap-1.5">
                                            <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[11px] font-medium leading-snug line-through line-clamp-2">{task.title}</p>
                                                <p className="text-[9px] text-muted-foreground mt-0.5">{task.projectName}</p>
                                            </div>
                                        </div>
                                    </button>
                                )) : (
                                    <p className="text-[9px] text-muted-foreground text-center py-6">No completed</p>
                                )}
                                {doneTasks.length > 8 && (
                                    <p className="text-[8px] text-muted-foreground text-center py-1">
                                        +{doneTasks.length - 8} more
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// Assign tasks dialog
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
                        Select tasks to assign. Current workload: {user.activeTasks} active tasks.
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
    const [selectedUser, setSelectedUser] = useState<UserStat | null>(null)
    const [assigningToUser, setAssigningToUser] = useState<UserStat | null>(null)

    const totalActiveTasks = allTasks.filter(t => t.columnName !== 'Done').length
    const unassignedTasks = allTasks.filter(t => t.isUnassigned)

    // Sort users by workload (most active first)
    const sortedUsers = [...userStats].sort((a, b) => b.activeTasks - a.activeTasks)

    const handleAssignTasks = async (taskIds: string[], userId: string) => {
        const errors: string[] = []
        for (const taskId of taskIds) {
            try {
                const res = await fetch(`/api/tasks/${taskId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ assigneeIds: [userId] })
                })
                if (!res.ok) {
                    errors.push(taskId)
                }
            } catch (error) {
                errors.push(taskId)
            }
        }
        if (errors.length > 0) {
            console.error(`Failed to assign ${errors.length} task(s)`)
        }
        router.refresh()
    }

    if (userStats.length === 0) {
        return null
    }

    return (
        <section className="border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium">Work Distribution</h2>
                <span className="text-[10px] text-muted-foreground">
                    {totalActiveTasks} active across {sortedUsers.length} members
                </span>
            </div>

            {/* User Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {sortedUsers.map(user => {
                    const isOverloaded = overloadedUsers.includes(user.id)
                    const isIdle = idleUsers.includes(user.id)
                    const hasIssues = user.overdueTasks > 0 || user.stuckTasks > 0 || user.helpRequestTasks > 0

                    // Determine status
                    const status = hasIssues ? 'struggling' : isIdle ? 'available' : 'on-track'

                    return (
                        <button
                            key={user.id}
                            onClick={() => setSelectedUser(user)}
                            className="relative p-3 rounded-lg border border-border text-left transition-all hover:shadow-md overflow-hidden bg-card"
                        >
                            {/* User header */}
                            <div className="relative flex items-center gap-2 mb-2">
                                {user.avatar ? (
                                    <img
                                        src={user.avatar}
                                        alt={user.name}
                                        className="w-7 h-7 rounded-full border"
                                    />
                                ) : (
                                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold border">
                                        {user.name.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium truncate">{user.name.split(' ')[0]}</p>
                                    <p className="text-[9px] text-muted-foreground">{user.role}</p>
                                </div>
                            </div>

                            {/* Task stack visual */}
                            <div className="relative">
                                <TaskStack count={user.activeTasks} />
                            </div>

                            {/* Status */}
                            <div className="relative flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                                <span
                                    className="text-[9px] font-medium px-1.5 py-0.5 rounded-sm"
                                    style={{
                                        background: status === 'struggling'
                                            ? 'linear-gradient(to right, rgba(239, 68, 68, 0.2), transparent)'
                                            : status === 'available'
                                            ? 'linear-gradient(to right, rgba(59, 130, 246, 0.2), transparent)'
                                            : 'linear-gradient(to right, rgba(34, 197, 94, 0.2), transparent)',
                                        color: status === 'struggling'
                                            ? 'rgb(185, 28, 28)'
                                            : status === 'available'
                                            ? 'rgb(37, 99, 235)'
                                            : 'rgb(22, 163, 74)'
                                    }}
                                >
                                    {status === 'struggling' ? 'Struggling' : status === 'available' ? 'Available' : 'On track'}
                                </span>
                                <span className="text-[9px] text-muted-foreground">
                                    {user.doneTasks} done
                                </span>
                            </div>
                        </button>
                    )
                })}
            </div>

            {/* Unassigned Tasks */}
            {unassignedTasks.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                    <h4 className="text-[10px] font-medium text-muted-foreground mb-2 flex items-center gap-1">
                        <UserX className="h-3 w-3" />
                        Unassigned Tasks ({unassignedTasks.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                        {unassignedTasks.slice(0, 8).map(task => (
                            <Link
                                key={task.id}
                                href={`/dashboard/projects/${task.projectId}?highlight=${task.id}`}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 hover:bg-muted transition-colors text-[10px]"
                            >
                                <span
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: task.projectColor }}
                                />
                                <span className="max-w-[120px] truncate">{task.title}</span>
                            </Link>
                        ))}
                        {unassignedTasks.length > 8 && (
                            <span className="px-2 py-1 text-[10px] text-muted-foreground">
                                +{unassignedTasks.length - 8} more
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* User Detail Dialog */}
            <UserDetailDialog
                open={!!selectedUser}
                onOpenChange={() => setSelectedUser(null)}
                user={selectedUser}
                unassignedTasks={unassignedTasks}
                onAssignClick={() => setAssigningToUser(selectedUser)}
                onAssignTasks={handleAssignTasks}
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
