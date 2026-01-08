"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
    Clock, MessageSquare, Paperclip, CheckSquare, HelpCircle,
    Filter, ChevronRight, AlertTriangle, ChevronDown, MoreHorizontal
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

function CompactTaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
    const isDone = task.columnName === 'Done'
    const { text: rawDueText, isOverdue: rawOverdue, isUrgent: rawUrgent } = getDueInfo(task.dueDate)
    const isOverdue = isDone ? false : rawOverdue
    const isUrgent = isDone ? false : rawUrgent
    const dueText = isDone ? '' : rawDueText

    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full text-left p-2 rounded-md border transition-all duration-150",
                "hover:shadow-sm hover:border-border/80 active:scale-[0.99]",
                isDone
                    ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900/50"
                    : "bg-card",
                task.hasHelpRequest && !isDone && "ring-1 ring-amber-300/50"
            )}
        >
            <div className="flex items-start gap-2">
                <div
                    className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: task.projectColor }}
                />
                <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-medium leading-snug line-clamp-1">
                        {task.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-muted-foreground truncate">
                            {task.projectName}
                        </span>
                        {dueText && (
                            <span className={cn(
                                "text-[9px] flex items-center gap-0.5 shrink-0",
                                isOverdue ? "text-red-500" : isUrgent ? "text-amber-500" : "text-muted-foreground"
                            )}>
                                <Clock className="h-2 w-2" />
                                {dueText}
                            </span>
                        )}
                        {task.hasHelpRequest && !isDone && (
                            <HelpCircle className="h-2.5 w-2.5 text-amber-500 shrink-0" />
                        )}
                    </div>
                </div>
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
            </div>
        </button>
    )
}

function KanbanColumn({
    column,
    maxVisible = 5,
    onTaskClick
}: {
    column: Column
    maxVisible?: number
    onTaskClick: (task: Task) => void
}) {
    const [isExpanded, setIsExpanded] = useState(false)
    const isDoneColumn = column.name === 'Done'

    // For done column, default to collapsed with fewer visible
    const effectiveMaxVisible = isDoneColumn ? 3 : maxVisible
    const shouldCollapse = column.tasks.length > effectiveMaxVisible
    const visibleTasks = isExpanded ? column.tasks : column.tasks.slice(0, effectiveMaxVisible)
    const hiddenCount = column.tasks.length - effectiveMaxVisible

    return (
        <div className={cn(
            "flex flex-col rounded-lg border border-border/50",
            isDoneColumn ? "bg-green-50/30 dark:bg-green-950/10" : "bg-muted/30"
        )}>
            {/* Column Header */}
            <div className="shrink-0 p-2.5 border-b border-border/50">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-medium">{column.name}</h3>
                    <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded",
                        isDoneColumn ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400" : "bg-muted text-muted-foreground"
                    )}>
                        {column.tasks.length}
                    </span>
                </div>
            </div>

            {/* Tasks */}
            <div className="flex-1 p-2 space-y-1.5 max-h-[400px] overflow-y-auto">
                {visibleTasks.length > 0 ? (
                    <>
                        {visibleTasks.map(task => (
                            <CompactTaskCard
                                key={task.id}
                                task={task}
                                onClick={() => onTaskClick(task)}
                            />
                        ))}

                        {/* Collapse/Expand button */}
                        {shouldCollapse && (
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {isExpanded ? (
                                    <>
                                        <ChevronDown className="h-3 w-3 rotate-180" />
                                        Show less
                                    </>
                                ) : (
                                    <>
                                        <div className="flex gap-0.5">
                                            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                                            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                                            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                                        </div>
                                        <span>+{hiddenCount} more</span>
                                        <ChevronDown className="h-3 w-3" />
                                    </>
                                )}
                            </button>
                        )}
                    </>
                ) : (
                    <div className="text-center py-6 text-[10px] text-muted-foreground">
                        No tasks
                    </div>
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
        let url = `/dashboard/projects/${task.projectId}?task=${task.id}`
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
                            maxVisible={column.name === 'Done' ? 3 : 6}
                            onTaskClick={handleTaskClick}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}
