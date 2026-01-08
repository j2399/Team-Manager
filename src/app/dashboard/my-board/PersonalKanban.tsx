"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
    Clock, MessageSquare, Paperclip, CheckSquare, HelpCircle,
    Filter, ChevronRight, AlertTriangle, Calendar
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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

function TaskCard({ task }: { task: Task }) {
    const router = useRouter()
    const [isNavigating, setIsNavigating] = useState(false)
    const isDone = task.columnName === 'Done'
    // Don't show overdue for completed tasks
    const { text: rawDueText, isOverdue: rawOverdue, isUrgent: rawUrgent } = getDueInfo(task.dueDate)
    const isOverdue = isDone ? false : rawOverdue
    const isUrgent = isDone ? false : rawUrgent
    // Don't show "overdue" text for done tasks, just show the date if exists
    const dueText = isDone ? '' : rawDueText

    const handleClick = () => {
        setIsNavigating(true)
        let url = `/dashboard/projects/${task.projectId}?task=${task.id}`
        if (task.pushId) url += `&push=${task.pushId}`
        router.push(url)
    }

    const hasChecklist = task.checklistTotal > 0
    const checklistProgress = hasChecklist
        ? Math.round((task.checklistCompleted / task.checklistTotal) * 100)
        : 0

    return (
        <button
            onClick={handleClick}
            disabled={isNavigating}
            className={cn(
                "w-full text-left p-3 rounded-lg border transition-all duration-150",
                "hover:shadow-md hover:border-border/80 active:scale-[0.99]",
                isDone
                    ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900/50"
                    : "bg-card",
                task.hasHelpRequest && !isDone && "ring-2 ring-amber-300/50",
                isNavigating && "opacity-50"
            )}
        >
            {/* Header: Title + Project Badge */}
            <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="text-sm font-medium leading-snug line-clamp-2 flex-1">
                    {task.title}
                </h4>
                {task.hasHelpRequest && (
                    <HelpCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                )}
            </div>

            {/* Project Badge */}
            <div className="flex items-center gap-2 mb-2">
                <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                    style={{
                        backgroundColor: `${task.projectColor}15`,
                        color: task.projectColor
                    }}
                >
                    {task.projectName}
                </span>
                {task.pushName && (
                    <span className="text-[9px] text-muted-foreground">
                        {task.pushName}
                    </span>
                )}
            </div>

            {/* Progress Bar (if enabled or has checklist) */}
            {(task.enableProgress || hasChecklist) && (
                <div className="mb-2">
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground mb-1">
                        <span>
                            {hasChecklist
                                ? `${task.checklistCompleted}/${task.checklistTotal} items`
                                : `${task.progress}%`
                            }
                        </span>
                        {hasChecklist && (
                            <span>{checklistProgress}%</span>
                        )}
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                        <div
                            className={cn(
                                "h-full rounded-full transition-all",
                                hasChecklist
                                    ? checklistProgress === 100 ? "bg-green-500" : "bg-primary"
                                    : task.progress === 100 ? "bg-green-500" : "bg-primary"
                            )}
                            style={{ width: `${hasChecklist ? checklistProgress : task.progress}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Footer: Due date + indicators */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {dueText && (
                        <span className={cn(
                            "text-[10px] flex items-center gap-0.5",
                            isOverdue ? "text-red-500 font-medium" : isUrgent ? "text-amber-500" : "text-muted-foreground"
                        )}>
                            <Clock className="h-2.5 w-2.5" />
                            {dueText}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1.5">
                    {task.commentsCount > 0 && (
                        <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                            <MessageSquare className="h-2.5 w-2.5" />
                            {task.commentsCount}
                        </span>
                    )}
                    {task.attachmentsCount > 0 && (
                        <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                            <Paperclip className="h-2.5 w-2.5" />
                            {task.attachmentsCount}
                        </span>
                    )}
                    {hasChecklist && (
                        <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                            <CheckSquare className="h-2.5 w-2.5" />
                            {task.checklistCompleted}/{task.checklistTotal}
                        </span>
                    )}
                </div>
            </div>
        </button>
    )
}

export function PersonalKanban({ columns, projects, userName }: PersonalKanbanProps) {
    const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())
    const [showOverdueOnly, setShowOverdueOnly] = useState(false)
    const [showHelpRequests, setShowHelpRequests] = useState(false)

    // Filter tasks
    const filteredColumns = useMemo(() => {
        return columns.map(col => ({
            ...col,
            tasks: col.tasks.filter(task => {
                // Project filter
                if (selectedProjects.size > 0 && !selectedProjects.has(task.projectId)) {
                    return false
                }

                // Overdue filter
                if (showOverdueOnly) {
                    const { isOverdue } = getDueInfo(task.dueDate)
                    if (!isOverdue) return false
                }

                // Help request filter
                if (showHelpRequests && !task.hasHelpRequest) {
                    return false
                }

                return true
            })
        }))
    }, [columns, selectedProjects, showOverdueOnly, showHelpRequests])

    const totalTasks = columns.reduce((acc, col) => acc + col.tasks.length, 0)
    const filteredTotalTasks = filteredColumns.reduce((acc, col) => acc + col.tasks.length, 0)
    // Exclude Done tasks from overdue count
    const overdueCount = columns.flatMap(c => c.tasks).filter(t => t.columnName !== 'Done' && getDueInfo(t.dueDate).isOverdue).length
    const helpRequestCount = columns.flatMap(c => c.tasks).filter(t => t.hasHelpRequest).length

    const toggleProject = (projectId: string) => {
        setSelectedProjects(prev => {
            const next = new Set(prev)
            if (next.has(projectId)) {
                next.delete(projectId)
            } else {
                next.add(projectId)
            }
            return next
        })
    }

    const clearFilters = () => {
        setSelectedProjects(new Set())
        setShowOverdueOnly(false)
        setShowHelpRequests(false)
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

                    {/* Filter Dropdown */}
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

            {/* Kanban Board */}
            <div className="flex-1 overflow-x-auto p-4">
                <div className="flex gap-4 h-full min-w-max">
                    {filteredColumns.map(column => (
                        <div
                            key={column.id}
                            className="w-72 flex flex-col bg-muted/30 rounded-lg border border-border/50"
                        >
                            {/* Column Header */}
                            <div className="shrink-0 p-3 border-b border-border/50">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-medium">{column.name}</h3>
                                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                        {column.tasks.length}
                                    </span>
                                </div>
                            </div>

                            {/* Tasks */}
                            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                                {column.tasks.length > 0 ? (
                                    column.tasks.map(task => (
                                        <TaskCard key={task.id} task={task} />
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-xs text-muted-foreground">
                                        No tasks
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
