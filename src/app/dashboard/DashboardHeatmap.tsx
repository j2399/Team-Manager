"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
    ChevronRight, Loader2, Plus, UserX, TrendingUp, TrendingDown,
    Calendar, Clock, CheckCircle2, AlertCircle, HelpCircle, X, ArrowLeft, ExternalLink, GripVertical
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
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { TaskDialog } from "@/features/kanban/TaskDialog"

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

type DashboardHeatmapProps = {
    userStats: UserStat[]
    criticalIssues: CriticalIssue[]
    overloadedUsers: string[]
    idleUsers: string[]
    allTasks: Task[]
    projects: {
        id: string
        name: string
        color: string
        pushes: {
            id: string
            name: string
            color: string
        }[]
        boards: {
            id: string
            columns: {
                id: string
                name: string
            }[]
        }[]
        members: {
            userId: string
        }[]
    }[]
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
    onAssignTasks,
    onAddTask,
    onBack
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    user: UserStat | null
    unassignedTasks: Task[]
    onAssignClick: () => void
    onAssignTasks: (taskIds: string[], userId: string) => Promise<void>
    onAddTask: (user: UserStat) => void
    onBack?: () => void
}) {
    const router = useRouter()

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

    // Task card component
    const TaskCard = ({ task }: { task: Task }) => (
        <button
            onClick={() => handleTaskClick(task)}
            className="w-full text-left p-2 rounded-lg border bg-card hover:bg-muted/50 hover:border-primary/20 transition-all"
        >
            <div className="flex items-start justify-between gap-1">
                <p className="text-[10px] font-medium leading-snug line-clamp-2 flex-1">{task.title}</p>

                {/* Status icons */}
                <div className="flex items-center gap-0.5 shrink-0 text-muted-foreground">
                    {task.isOverdue && (
                        <TooltipProvider delayDuration={500}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <AlertCircle className="h-3 w-3 text-red-500" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                    Overdue
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    {task.isStuck && (
                        <TooltipProvider delayDuration={500}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Clock className="h-3 w-3" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                    Stuck (no recent activity)
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    {task.isBlockedByHelp && (
                        <TooltipProvider delayDuration={500}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className="h-3 w-3" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                    Needs help
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>
            </div>

            {/* Project tag */}
            <div
                className="text-[8px] px-1 py-0.5 rounded-sm font-medium text-muted-foreground mt-1.5 w-fit border tag-shimmer"
                style={{
                    background: `linear-gradient(to right, ${task.projectColor}20, transparent)`,
                    borderColor: `${task.projectColor}30`,
                    '--tag-color': `${task.projectColor}20`
                } as React.CSSProperties}
            >
                {task.projectName}
            </div>
        </button>
    )

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-7xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            {onBack && (
                                <button
                                    onClick={onBack}
                                    className="p-1 rounded-md hover:bg-muted transition-colors"
                                    title="Back"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </button>
                            )}
                            {user.avatar ? (
                                <img
                                    src={user.avatar}
                                    alt={user.name}
                                    className="w-10 h-10 rounded-full"
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                                    {user.name.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div>
                                <DialogTitle className="text-base">{user.name}</DialogTitle>
                                <p className="text-xs text-muted-foreground">{user.role}</p>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 w-10 p-0 rounded-sm border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary shrink-0"
                                onClick={() => onAddTask(user)}
                                title="Quick Add Task"
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </Button>
                        </div>

                        {/* Stats + Assign */}
                        <div className="flex items-center gap-2 pr-6 h-10">
                            <div className="flex items-center gap-3.5 text-[10px] text-muted-foreground font-medium pr-4 mt-0.5">
                                <span><span className="text-foreground/90 font-semibold">{user.activeTasks}</span> Active</span>
                                <span><span className="text-foreground/90 font-semibold">{doneTasks.length}</span> Done</span>
                                {(user.overdueTasks > 0 || user.stuckTasks > 0 || user.helpRequestTasks > 0) && (
                                    <span><span className="text-foreground/90 font-semibold">{user.overdueTasks + user.stuckTasks + user.helpRequestTasks}</span> Issues</span>
                                )}
                            </div>

                            {unassignedTasks.length > 0 && (
                                <Button size="sm" variant="outline" onClick={onAssignClick} className="h-7 text-[10px] px-3">
                                    <Plus className="h-3 w-3 mr-1" />
                                    Assign
                                </Button>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                {/* Mini Kanban */}
                <div className="flex-1 overflow-auto mt-4">
                    <div className="grid grid-cols-4 gap-3">
                        {/* To Do */}
                        <div className="border rounded-lg overflow-hidden">
                            <div className="bg-muted/50 px-2 py-1.5 flex items-center justify-between border-b">
                                <span className="text-[10px] font-medium">To Do</span>
                                <span className="text-[9px] text-muted-foreground">{todoTasks.length}</span>
                            </div>
                            <div className="p-1.5 space-y-1.5 max-h-[300px] overflow-auto">
                                {todoTasks.length > 0 ? todoTasks.map(task => (
                                    <TaskCard key={task.id} task={task} />
                                )) : (
                                    <p className="text-[9px] text-muted-foreground text-center py-4">No tasks</p>
                                )}
                            </div>
                        </div>

                        {/* In Progress */}
                        <div className="border rounded-lg overflow-hidden">
                            <div className="bg-muted/50 px-2 py-1.5 flex items-center justify-between border-b">
                                <span className="text-[10px] font-medium">In Progress</span>
                                <span className="text-[9px] text-muted-foreground">{inProgressTasks.length}</span>
                            </div>
                            <div className="p-1.5 space-y-1.5 max-h-[300px] overflow-auto">
                                {inProgressTasks.length > 0 ? inProgressTasks.map(task => (
                                    <TaskCard key={task.id} task={task} />
                                )) : (
                                    <p className="text-[9px] text-muted-foreground text-center py-4">No tasks</p>
                                )}
                            </div>
                        </div>

                        {/* Review */}
                        <div className="border rounded-lg overflow-hidden">
                            <div className="bg-muted/50 px-2 py-1.5 flex items-center justify-between border-b">
                                <span className="text-[10px] font-medium">Review</span>
                                <span className="text-[9px] text-muted-foreground">{reviewTasks.length}</span>
                            </div>
                            <div className="p-1.5 space-y-1.5 max-h-[300px] overflow-auto">
                                {reviewTasks.length > 0 ? reviewTasks.map(task => (
                                    <TaskCard key={task.id} task={task} />
                                )) : (
                                    <p className="text-[9px] text-muted-foreground text-center py-4">No tasks</p>
                                )}
                            </div>
                        </div>

                        {/* Done */}
                        <div className="border rounded-lg overflow-hidden">
                            <div className="bg-muted/50 px-2 py-1.5 flex items-center justify-between border-b">
                                <span className="text-[10px] font-medium">Done</span>
                                <span className="text-[9px] text-muted-foreground">{doneTasks.length}</span>
                            </div>
                            <div className="p-1.5 space-y-1.5 max-h-[300px] overflow-auto">
                                {doneTasks.length > 0 ? doneTasks.slice(0, 8).map(task => (
                                    <button
                                        key={task.id}
                                        onClick={() => handleTaskClick(task)}
                                        className="w-full text-left p-2 rounded-lg border bg-card/50 hover:bg-muted/50 transition-all opacity-60"
                                    >
                                        <div className="flex items-start gap-1">
                                            <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                                            <p className="text-[10px] font-medium leading-snug line-through line-clamp-2">{task.title}</p>
                                        </div>
                                    </button>
                                )) : (
                                    <p className="text-[9px] text-muted-foreground text-center py-4">No completed</p>
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

// Quick task selection dialog (Project & Push)
function QuickAddTaskDialog({
    open,
    onOpenChange,
    user,
    projects,
    onContinue
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    user: UserStat | null
    projects: DashboardHeatmapProps['projects']
    onContinue: (projectId: string, pushId: string) => void
}) {
    const [selectedProjectId, setSelectedProjectId] = useState<string>('')
    const [selectedPushId, setSelectedPushId] = useState<string>('')

    const selectedProject = projects.find(p => p.id === selectedProjectId)
    const activePushes = selectedProject?.pushes || []

    // Reset push if project changes
    useEffect(() => {
        setSelectedPushId('')
    }, [selectedProjectId])

    const handleContinue = () => {
        if (!selectedProjectId || !selectedPushId || !user) return
        onContinue(selectedProjectId, selectedPushId)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-base font-semibold">
                        Add Task for {user?.name.split(' ')[0]}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Select Division</label>
                        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                            <SelectTrigger className="w-full text-xs h-9">
                                <SelectValue placeholder="Choose a division" />
                            </SelectTrigger>
                            <SelectContent>
                                {projects.map(project => (
                                    <SelectItem key={project.id} value={project.id} className="text-xs text-foreground justify-start">
                                        <div className="flex items-center gap-2">
                                            <GripVertical className="h-3.5 w-3.5 opacity-60 shrink-0" style={{ color: project.color }} />
                                            <span className="truncate">{project.name}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {selectedProjectId && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Select Division</label>
                            <Select
                                value={selectedPushId}
                                onValueChange={setSelectedPushId}
                                disabled={activePushes.length === 0}
                            >
                                <SelectTrigger className="w-full text-xs h-9">
                                    <SelectValue placeholder={activePushes.length === 0 ? "No active divisions" : "Select target division"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {activePushes.map(push => (
                                        <SelectItem key={push.id} value={push.id} className="text-xs text-foreground justify-start">
                                            {push.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {activePushes.length === 0 && (
                                <p className="text-[9px] text-muted-foreground italic px-1">This division has no active timelines. Tasks must be assigned to a division timeline.</p>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        size="sm"
                        onClick={handleContinue}
                        disabled={!selectedProjectId || !selectedPushId || activePushes.length === 0}
                        className="w-full h-9 text-xs"
                    >
                        Continue
                        <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
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
    allTasks,
    projects
}: DashboardHeatmapProps) {
    const router = useRouter()
    const [selectedUser, setSelectedUser] = useState<UserStat | null>(null)
    const [assigningToUser, setAssigningToUser] = useState<UserStat | null>(null)
    const [issuePopup, setIssuePopup] = useState<'overdue' | 'stuck' | 'help' | null>(null)
    const [previousIssuePopup, setPreviousIssuePopup] = useState<'overdue' | 'stuck' | 'help' | null>(null)
    const [quickAddTaskUser, setQuickAddTaskUser] = useState<UserStat | null>(null)
    const [localTaskDialog, setLocalTaskDialog] = useState<{
        userId: string
        projectId: string
        pushId: string
    } | null>(null)

    // Prepare users for TaskDialog per project
    const projectUsers = projects.reduce((acc, p) => {
        acc[p.id] = userStats.map(u => ({
            id: u.id,
            name: u.name,
            isProjectMember: p.members.some(m => m.userId === u.id)
        }))
        return acc
    }, {} as Record<string, { id: string, name: string, isProjectMember: boolean }[]>)

    const totalActiveTasks = allTasks.filter(t => t.columnName !== 'Done').length
    const unassignedTasks = allTasks.filter(t => t.isUnassigned)

    // Calculate issue counts
    const overdueTasks = allTasks.filter(t => t.isOverdue && t.columnName !== 'Done')
    const stuckTasks = allTasks.filter(t => t.isStuck && t.columnName !== 'Done')
    const helpTasks = allTasks.filter(t => t.isBlockedByHelp && t.columnName !== 'Done')

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
                <div className="flex items-center gap-3">
                    <h2 className="text-sm font-medium">Work Distribution</h2>

                    {/* Issue counts */}
                    <div className="flex items-center gap-1.5">
                        {overdueTasks.length > 0 && (
                            <button
                                onClick={() => setIssuePopup('overdue')}
                                className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-sm font-medium border tag-shimmer transition-colors hover:bg-muted/50"
                                style={{
                                    background: 'linear-gradient(to right, rgba(156, 163, 175, 0.15), transparent)',
                                    borderColor: 'rgba(156, 163, 175, 0.3)',
                                    color: 'rgb(107, 114, 128)',
                                    '--tag-color': 'rgba(156, 163, 175, 0.15)'
                                } as React.CSSProperties}
                            >
                                <AlertCircle className="h-2.5 w-2.5" />
                                {overdueTasks.length} Overdue
                            </button>
                        )}
                        {stuckTasks.length > 0 && (
                            <button
                                onClick={() => setIssuePopup('stuck')}
                                className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-sm font-medium border tag-shimmer transition-colors hover:bg-muted/50"
                                style={{
                                    background: 'linear-gradient(to right, rgba(156, 163, 175, 0.15), transparent)',
                                    borderColor: 'rgba(156, 163, 175, 0.3)',
                                    color: 'rgb(107, 114, 128)',
                                    '--tag-color': 'rgba(156, 163, 175, 0.15)'
                                } as React.CSSProperties}
                            >
                                <Clock className="h-2.5 w-2.5" />
                                {stuckTasks.length} Stuck
                            </button>
                        )}
                        {helpTasks.length > 0 && (
                            <button
                                onClick={() => setIssuePopup('help')}
                                className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-sm font-medium border tag-shimmer transition-colors hover:bg-muted/50"
                                style={{
                                    background: 'linear-gradient(to right, rgba(156, 163, 175, 0.15), transparent)',
                                    borderColor: 'rgba(156, 163, 175, 0.3)',
                                    color: 'rgb(107, 114, 128)',
                                    '--tag-color': 'rgba(156, 163, 175, 0.15)'
                                } as React.CSSProperties}
                            >
                                <HelpCircle className="h-2.5 w-2.5" />
                                {helpTasks.length} Need Help
                            </button>
                        )}
                    </div>
                </div>
                <span className="text-[10px] text-muted-foreground">
                    {totalActiveTasks} active across {sortedUsers.length} members
                </span>
            </div>

            {/* User Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {sortedUsers.map(user => {
                    const status = user.status

                    return (
                        <div
                            key={user.id}
                            onClick={() => setSelectedUser(user)}
                            className="relative p-3 rounded-lg border border-border text-left transition-all hover:shadow-md overflow-hidden bg-card cursor-pointer group"
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

                            {/* Task stack visual with Add button */}
                            <div className="relative flex items-center justify-between gap-1">
                                <TaskStack count={user.activeTasks} />
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-5 w-8 rounded-sm p-0 border border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 transition-opacity shrink-0"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setQuickAddTaskUser(user);
                                    }}
                                >
                                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                            </div>

                            {/* Status */}
                            <div className="relative flex items-center mt-2 pt-2 border-t border-border/50">
                                <span
                                    className="text-[9px] font-medium px-1.5 py-0.5 rounded-sm border tag-shimmer"
                                    style={{
                                        background: status === 'struggling'
                                            ? 'linear-gradient(to right, rgba(239, 68, 68, 0.15), transparent)'
                                            : status === 'available'
                                                ? 'linear-gradient(to right, rgba(59, 130, 246, 0.08), transparent)'
                                                : 'linear-gradient(to right, rgba(156, 163, 175, 0.1), transparent)',
                                        color: 'rgb(107, 114, 128)',
                                        borderColor: status === 'struggling'
                                            ? 'rgba(239, 68, 68, 0.3)'
                                            : status === 'available'
                                                ? 'rgba(59, 130, 246, 0.15)'
                                                : 'rgba(156, 163, 175, 0.2)',
                                        '--tag-color': status === 'struggling'
                                            ? 'rgba(239, 68, 68, 0.15)'
                                            : status === 'available'
                                                ? 'rgba(59, 130, 246, 0.08)'
                                                : 'rgba(156, 163, 175, 0.1)'
                                    } as React.CSSProperties}
                                >
                                    {status === 'struggling' ? 'Struggling' : status === 'available' ? 'Available' : 'On track'}
                                </span>
                            </div>
                        </div>
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
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedUser(null)
                        setPreviousIssuePopup(null)
                    }
                }}
                user={selectedUser}
                unassignedTasks={unassignedTasks}
                onAssignClick={() => setAssigningToUser(selectedUser)}
                onAssignTasks={handleAssignTasks}
                onAddTask={(user) => {
                    setSelectedUser(null);
                    setQuickAddTaskUser(user);
                }}
                onBack={previousIssuePopup ? () => {
                    setSelectedUser(null)
                    setIssuePopup(previousIssuePopup)
                    setPreviousIssuePopup(null)
                } : undefined}
            />

            {/* Assign Tasks Dialog */}
            <AssignTasksDialog
                open={!!assigningToUser}
                onOpenChange={() => setAssigningToUser(null)}
                user={assigningToUser}
                unassignedTasks={unassignedTasks}
                onAssign={handleAssignTasks}
            />

            {/* Issue Tasks Dialog */}
            <Dialog open={!!issuePopup} onOpenChange={() => setIssuePopup(null)}>
                <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col" showCloseButton={true}>
                    <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-1.5 pt-2">
                        {(issuePopup === 'overdue' ? overdueTasks : issuePopup === 'stuck' ? stuckTasks : helpTasks).map(task => {
                            // Get assignees from userStats
                            const assignees = userStats.filter(u => task.assigneeIds.includes(u.id))

                            return (
                                <div
                                    key={task.id}
                                    className="p-2 rounded-lg border bg-card group"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-xs font-medium leading-snug line-clamp-2 flex-1">{task.title}</p>
                                        <Link
                                            href={`/dashboard/projects/${task.projectId}?highlight=${task.id}${task.pushId ? `&push=${task.pushId}` : ''}`}
                                            onClick={() => setIssuePopup(null)}
                                            className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            Go to task
                                            <ExternalLink className="h-2.5 w-2.5" />
                                        </Link>
                                    </div>

                                    <div className="flex items-center justify-between gap-2 mt-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <div
                                                className="text-[8px] px-1 py-0.5 rounded-sm font-medium text-muted-foreground border tag-shimmer"
                                                style={{
                                                    background: `linear-gradient(to right, ${task.projectColor}20, transparent)`,
                                                    borderColor: `${task.projectColor}30`,
                                                    '--tag-color': `${task.projectColor}20`
                                                } as React.CSSProperties}
                                            >
                                                {task.projectName}
                                            </div>
                                            <span className="text-[8px] text-muted-foreground">{task.columnName}</span>
                                        </div>

                                        {/* Assignees with name */}
                                        {assignees.length > 0 && (
                                            <div className="flex items-center gap-2">
                                                {assignees.map(user => (
                                                    <button
                                                        key={user.id}
                                                        onClick={() => {
                                                            setPreviousIssuePopup(issuePopup)
                                                            setIssuePopup(null)
                                                            setSelectedUser(user)
                                                        }}
                                                        className="flex items-center gap-1.5 hover:bg-muted/50 rounded-full pr-2 transition-all"
                                                    >
                                                        {user.avatar ? (
                                                            <img
                                                                src={user.avatar}
                                                                alt={user.name}
                                                                className="w-6 h-6 rounded-full"
                                                            />
                                                        ) : (
                                                            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold">
                                                                {user.name.charAt(0).toUpperCase()}
                                                            </div>
                                                        )}
                                                        <div className="text-left">
                                                            <p className="text-[9px] font-medium leading-tight">{user.name.split(' ')[0]}</p>
                                                            <p className="text-[7px] text-muted-foreground leading-tight">{user.role}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </DialogContent>
            </Dialog>
            <QuickAddTaskDialog
                open={!!quickAddTaskUser}
                onOpenChange={(open) => !open && setQuickAddTaskUser(null)}
                user={quickAddTaskUser}
                projects={projects}
                onContinue={(projectId, pushId) => {
                    if (quickAddTaskUser) {
                        setLocalTaskDialog({
                            userId: quickAddTaskUser.id,
                            projectId,
                            pushId
                        })
                    }
                }}
            />

            {localTaskDialog && (
                <TaskDialog
                    projectId={localTaskDialog.projectId}
                    pushId={localTaskDialog.pushId}
                    initialAssigneeIds={[localTaskDialog.userId]}
                    columnId={projects.find(p => p.id === localTaskDialog.projectId)?.boards[0]?.columns[0]?.id}
                    users={projectUsers[localTaskDialog.projectId] || []}
                    open={true}
                    onOpenChange={(open) => !open && setLocalTaskDialog(null)}
                    onTaskCreated={() => {
                        setLocalTaskDialog(null)
                        // Note: Data will update via server components/revalidation
                    }}
                />
            )}
        </section>
    )
}
