"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
    Clock, HelpCircle, Filter, AlertTriangle, CheckCircle2, CalendarDays
} from "lucide-react"
import { cn, getInitials } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel
} from "@/components/ui/dropdown-menu"

type Task = {
    id: string
    title: string
    description: string | null
    columnName: string
    columnId: string | null
    projectId: string
    projectName: string
    projectColor: string
    pushId: string | null
    pushName: string | null
    pushColor: string | null
    dueDate: string | null
    startDate: string | null
    endDate: string | null
    progress: number
    enableProgress: boolean
    commentsCount: number
    attachmentsCount: number
    checklistTotal: number
    checklistCompleted: number
    hasHelpRequest: boolean
    helpRequestStatus: string | null
    createdAt: string
    updatedAt: string
}

type Column = {
    id: string
    name: string
    tasks: Task[]
}

type Project = {
    id: string
    name: string
    color: string
}

type PersonalKanbanProps = {
    columns: Column[]
    projects: Project[]
    userName: string
}

function getDueInfo(dueDate: string | null): { text: string; isOverdue: boolean; isUrgent: boolean } {
    if (!dueDate) return { text: '', isOverdue: false, isUrgent: false }

    const now = new Date()
    const due = new Date(dueDate)
    const diffMs = due.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffMs < 0) {
        const overdueDays = Math.abs(diffDays)
        return {
            text: overdueDays === 0 ? 'Today' : `${overdueDays}d overdue`,
            isOverdue: true,
            isUrgent: true
        }
    }

    if (diffDays === 0) return { text: 'Today', isOverdue: false, isUrgent: true }
    if (diffDays === 1) return { text: 'Tomorrow', isOverdue: false, isUrgent: true }
    if (diffDays <= 3) return { text: `${diffDays}d`, isOverdue: false, isUrgent: true }
    return { text: `${diffDays}d`, isOverdue: false, isUrgent: false }
}

function PersonalTaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
    const isDone = task.columnName === 'Done'
    const isReview = task.columnName === 'Review'
    const { text: rawDueText, isOverdue: rawOverdue, isUrgent: rawUrgent } = getDueInfo(task.dueDate)
    const isOverdue = isDone ? false : rawOverdue
    const daysLeft = isDone ? null : (task.dueDate ? Math.ceil((new Date(task.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null)

    // Calculate time progress
    const now = new Date().getTime()
    const startTime = task.startDate ? new Date(task.startDate).getTime() : null
    const endTime = task.endDate ? new Date(task.endDate).getTime() : null
    let timeProgress: number | null = null

    if (startTime && endTime) {
        const totalDuration = endTime - startTime
        const elapsed = now - startTime
        timeProgress = Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100)
    }

    const getProgressColor = () => {
        if (isOverdue) return 'bg-red-500'
        if (timeProgress && timeProgress > 90) return 'bg-orange-500'
        return 'bg-primary/60'
    }

    const getManualProgressColorClass = (val: number) => {
        if (val < 30) return "bg-red-500"
        if (val < 70) return "bg-yellow-500"
        return "bg-green-500"
    }

    // Done column variant - matches project board
    if (isDone) {
        return (
            <button
                onClick={onClick}
                className={cn(
                    "w-full text-left group relative flex flex-col gap-1.5 p-3 rounded-lg border transition-all duration-200 overflow-hidden",
                    "bg-emerald-50/40 border-emerald-100/50 hover:border-emerald-200 hover:shadow-sm dark:bg-emerald-900/10 dark:border-emerald-900/30 dark:hover:border-emerald-800/50"
                )}
            >
                <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-medium text-emerald-950/80 dark:text-emerald-100/80 leading-snug line-clamp-2">
                        {task.title}
                    </h4>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                </div>
                <div className="flex items-center justify-end mt-1">
                    <div
                        className="text-[10px] px-2 py-0.5 rounded-sm font-semibold text-foreground truncate max-w-[120px]"
                        style={{ background: `linear-gradient(to right, ${task.projectColor}20, transparent)` }}
                    >
                        {task.projectName}
                    </div>
                </div>
            </button>
        )
    }

    // Standard / Review card - matches project board TaskCard
    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full text-left group relative flex flex-col rounded-lg border bg-card p-3 shadow-sm transition-all duration-200 overflow-hidden",
                "hover:shadow-md hover:border-primary/20",
                isReview ? "border-orange-200 bg-orange-50/10" : "border-border",
                task.hasHelpRequest && "ring-1 ring-amber-300/50"
            )}
        >
            {/* Title */}
            <h4 className="text-sm font-medium leading-snug text-foreground mb-3 line-clamp-2">
                {task.title}
            </h4>

            {/* Meta Row */}
            <div className="flex items-center justify-between gap-2 mt-auto">
                {/* Due Date Info (Left) */}
                <div className="flex items-center gap-1.5 min-w-0">
                    {daysLeft !== null && (
                        <div className={cn(
                            "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-sm font-medium border truncate",
                            isOverdue
                                ? "bg-red-50 text-red-600 border-red-100"
                                : "bg-muted text-muted-foreground border-transparent"
                        )}>
                            <Clock className="w-3 h-3 shrink-0" />
                            <span className="truncate">
                                {isOverdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Today" : `${daysLeft}d`}
                            </span>
                        </div>
                    )}

                    {/* Help request indicator */}
                    {task.hasHelpRequest && (
                        <HelpCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    )}
                </div>

                {/* Project Badge (Right) */}
                <div
                    className="text-[10px] px-2 py-0.5 rounded-sm font-semibold text-foreground truncate max-w-[120px]"
                    style={{ background: `linear-gradient(to right, ${task.projectColor}20, transparent)` }}
                >
                    {task.projectName}
                </div>
            </div>

            {/* Progress Bar */}
            {task.enableProgress ? (
                <div className="mt-3 h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div
                        className={cn("h-full rounded-full transition-all duration-300", getManualProgressColorClass(task.progress))}
                        style={{ width: `${task.progress}%` }}
                    />
                </div>
            ) : (
                timeProgress !== null && !isReview && (
                    <div className="mt-3 h-1 w-full bg-muted rounded-full overflow-hidden">
                        <div
                            className={cn("h-full rounded-full transition-all duration-300", getProgressColor())}
                            style={{ width: `${timeProgress}%` }}
                        />
                    </div>
                )
            )}

            {/* Review Footer */}
            {isReview && (
                <div className="mt-3 pt-2.5 border-t border-orange-100 flex items-center justify-center">
                    <div className="w-full text-center text-[10px] font-medium text-orange-600/70 flex items-center justify-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                        Pending Review
                    </div>
                </div>
            )}
        </button>
    )
}

function KanbanColumn({
    column,
    onTaskClick
}: {
    column: Column
    onTaskClick: (task: Task) => void
}) {
    const isDoneColumn = column.name === 'Done'
    const isReviewColumn = column.name === 'Review'

    const getBgClass = () => {
        if (isDoneColumn) return 'bg-emerald-50/50 dark:bg-emerald-900/10'
        if (isReviewColumn) return 'bg-gray-100/80 dark:bg-gray-800/40'
        return 'bg-muted/50'
    }

    return (
        <div className={cn(
            "flex h-full w-full min-w-0 flex-col rounded-lg p-3 transition-all min-h-[150px]",
            getBgClass()
        )}>
            {/* Column Header */}
            <div className="flex items-center gap-2 mb-3 px-1">
                <h3 className={cn(
                    "font-medium text-sm",
                    isDoneColumn ? "text-emerald-700 dark:text-emerald-400" : ""
                )}>
                    {column.name}
                </h3>
                <span className={cn(
                    "text-xs",
                    isDoneColumn ? "text-emerald-600 dark:text-emerald-500/80" : "text-muted-foreground"
                )}>
                    {column.tasks.length}
                </span>
            </div>

            {/* Tasks */}
            <div className="space-y-2 px-2 pb-2 pt-1">
                {column.tasks.length > 0 ? (
                    column.tasks.map(task => (
                        <PersonalTaskCard
                            key={task.id}
                            task={task}
                            onClick={() => onTaskClick(task)}
                        />
                    ))
                ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">
                        No tasks
                    </p>
                )}
            </div>
        </div>
    )
}

export function PersonalKanban({ columns, projects, userName }: PersonalKanbanProps) {
    const router = useRouter()
    const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())
    const [showOverdueOnly, setShowOverdueOnly] = useState(false)
    const [showHelpRequests, setShowHelpRequests] = useState(false)

    // Filter tasks
    const filteredColumns = useMemo(() => {
        return columns.map(col => ({
            ...col,
            tasks: col.tasks.filter(task => {
                if (selectedProjects.size > 0 && !selectedProjects.has(task.projectId)) {
                    return false
                }
                if (showOverdueOnly) {
                    const { isOverdue } = getDueInfo(task.dueDate)
                    if (!isOverdue) return false
                }
                if (showHelpRequests && !task.hasHelpRequest) {
                    return false
                }
                return true
            })
        }))
    }, [columns, selectedProjects, showOverdueOnly, showHelpRequests])

    const totalTasks = columns.reduce((acc, col) => acc + col.tasks.length, 0)
    const filteredTotalTasks = filteredColumns.reduce((acc, col) => acc + col.tasks.length, 0)
    const overdueCount = columns.flatMap(c => c.tasks).filter(t => t.columnName !== 'Done' && getDueInfo(t.dueDate).isOverdue).length
    const helpRequestCount = columns.flatMap(c => c.tasks).filter(t => t.hasHelpRequest).length

    const toggleProject = (projectId: string) => {
        setSelectedProjects(prev => {
            const next = new Set(prev)
            if (next.has(projectId)) next.delete(projectId)
            else next.add(projectId)
            return next
        })
    }

    const clearFilters = () => {
        setSelectedProjects(new Set())
        setShowOverdueOnly(false)
        setShowHelpRequests(false)
    }

    const handleTaskClick = (task: Task) => {
        let url = `/dashboard/projects/${task.projectId}?highlight=${task.id}`
        if (task.pushId) url += `&push=${task.pushId}`
        router.push(url)
    }

    const hasActiveFilters = selectedProjects.size > 0 || showOverdueOnly || showHelpRequests

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="shrink-0 border-b bg-background p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-lg font-semibold">{userName}'s Board</h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {filteredTotalTasks} tasks across {projects.length} projects
                            {overdueCount > 0 && (
                                <span className="text-red-500 ml-2">
                                    <AlertTriangle className="inline h-3 w-3 mr-0.5" />
                                    {overdueCount} overdue
                                </span>
                            )}
                        </p>
                    </div>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className={cn(
                                    "h-8 text-xs",
                                    hasActiveFilters && "border-primary text-primary"
                                )}
                            >
                                <Filter className="h-3.5 w-3.5 mr-1.5" />
                                Filter
                                {hasActiveFilters && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-primary text-primary-foreground rounded-full text-[10px]">
                                        {selectedProjects.size + (showOverdueOnly ? 1 : 0) + (showHelpRequests ? 1 : 0)}
                                    </span>
                                )}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="text-xs">Quick Filters</DropdownMenuLabel>
                            <DropdownMenuCheckboxItem
                                checked={showOverdueOnly}
                                onCheckedChange={setShowOverdueOnly}
                                className="text-xs"
                            >
                                <Clock className="h-3 w-3 mr-2 text-red-500" />
                                Overdue only ({overdueCount})
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem
                                checked={showHelpRequests}
                                onCheckedChange={setShowHelpRequests}
                                className="text-xs"
                            >
                                <HelpCircle className="h-3 w-3 mr-2 text-amber-500" />
                                Needs help ({helpRequestCount})
                            </DropdownMenuCheckboxItem>

                            {projects.length > 0 && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel className="text-xs">Projects</DropdownMenuLabel>
                                    {projects.map(project => (
                                        <DropdownMenuCheckboxItem
                                            key={project.id}
                                            checked={selectedProjects.has(project.id)}
                                            onCheckedChange={() => toggleProject(project.id)}
                                            className="text-xs"
                                        >
                                            <div
                                                className="w-2 h-2 rounded-full mr-2"
                                                style={{ backgroundColor: project.color }}
                                            />
                                            {project.name}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </>
                            )}

                            {hasActiveFilters && (
                                <>
                                    <DropdownMenuSeparator />
                                    <button
                                        onClick={clearFilters}
                                        className="w-full text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 text-left"
                                    >
                                        Clear all filters
                                    </button>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Kanban Board - Grid layout that fits the screen */}
            <div className="flex-1 overflow-auto p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 h-full">
                    {filteredColumns.map(column => (
                        <KanbanColumn
                            key={column.id}
                            column={column}
                            onTaskClick={handleTaskClick}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}
