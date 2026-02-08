"use client"

import { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import {
    DndContext,
    DragOverlay,
    useSensors,
    useSensor,
    PointerSensor,
    DragEndEvent,
    DragStartEvent,
    useDroppable,
    useDraggable,
} from "@dnd-kit/core"
import {
    Clock, HelpCircle, Filter, AlertTriangle, CheckCircle2
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
import { useToast } from "@/components/ui/use-toast"
import { updateTaskStatus } from "@/app/actions/kanban"

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
    submittedAt: string | null
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

// Draggable Task Card Component
function DraggableTaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: task.id,
        data: { task }
    })

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    } : undefined

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className={cn(isDragging && "opacity-50")}
        >
            <PersonalTaskCard task={task} onClick={onClick} />
        </div>
    )
}

function PersonalTaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
    const isDone = task.columnName === 'Done'
    const isReview = task.columnName === 'Review'
    const isOverdue = isDone ? false : (task.dueDate ? new Date(task.dueDate).getTime() < Date.now() : false)
    const daysLeft = isDone ? null : (task.dueDate ? Math.ceil((new Date(task.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null)

    // Done column variant
    if (isDone) {
        return (
            <button
                onClick={onClick}
                className={cn(
                    "w-full text-left group relative flex flex-col gap-1.5 p-3 rounded-lg border transition-all duration-200 overflow-hidden cursor-grab active:cursor-grabbing",
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
                        className="text-[10px] px-2 py-0.5 rounded-sm font-medium text-muted-foreground truncate max-w-[120px]"
                        style={{ background: `linear-gradient(to right, ${task.projectColor}20, transparent)` }}
                    >
                        {task.projectName}
                    </div>
                </div>
            </button>
        )
    }

    // Standard / Review card
    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full text-left group relative flex flex-col rounded-lg border bg-card p-3 shadow-sm transition-all duration-200 overflow-hidden cursor-grab active:cursor-grabbing",
                "hover:shadow-md hover:border-primary/20",
                "border-border",
                task.hasHelpRequest && "ring-1 ring-amber-300/50"
            )}
        >
            {/* Title */}
            <h4 className="text-sm font-medium leading-snug text-foreground mb-3 line-clamp-2">
                {task.title}
            </h4>

            {/* Meta Row */}
            <div className="flex items-center justify-between gap-2 mt-auto">
                {/* Due Date / Pending Review Info (Left) */}
                <div className="flex items-center gap-1.5 min-w-0">
                    {isReview ? (
                        // Show pending review time for Review cards
                        task.submittedAt && (
                            <div
                                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-sm font-medium border bg-muted text-muted-foreground border-transparent truncate tag-shimmer"
                                style={{
                                    '--tag-color': 'rgba(156, 163, 175, 0.15)'
                                } as React.CSSProperties}
                            >
                                <Clock className="w-3 h-3 shrink-0" />
                                <span className="truncate">
                                    {(() => {
                                        const days = Math.floor((Date.now() - new Date(task.submittedAt).getTime()) / (1000 * 60 * 60 * 24))
                                        return days === 0 ? 'Pending today' : `Pending ${days}d`
                                    })()}
                                </span>
                            </div>
                        )
                    ) : (
                        // Show due date for other cards
                        daysLeft !== null && (
                            <div
                                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-sm font-medium border truncate tag-shimmer"
                                style={isOverdue ? {
                                    background: 'linear-gradient(to right, rgba(239, 68, 68, 0.15), transparent)',
                                    borderColor: 'rgba(239, 68, 68, 0.3)',
                                    color: 'rgb(220, 38, 38)',
                                    '--tag-color': 'rgba(239, 68, 68, 0.15)'
                                } as React.CSSProperties : {
                                    background: 'linear-gradient(to right, rgba(156, 163, 175, 0.15), transparent)',
                                    borderColor: 'rgba(156, 163, 175, 0.3)',
                                    color: 'rgb(107, 114, 128)',
                                    '--tag-color': 'rgba(156, 163, 175, 0.15)'
                                } as React.CSSProperties}
                            >
                                <Clock className="w-3 h-3 shrink-0" />
                                <span className="truncate">
                                    {isOverdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Today" : `${daysLeft}d`}
                                </span>
                            </div>
                        )
                    )}

                    {/* Help request indicator */}
                    {task.hasHelpRequest && (
                        <HelpCircle className="h-3.5 w-3.5 text-amber-500/80 shrink-0" />
                    )}
                </div>

                {/* Project Badge (Right) */}
                <div
                    className="text-[10px] px-2 py-0.5 rounded-sm font-medium text-muted-foreground truncate max-w-[120px] border tag-shimmer"
                    style={{
                        background: `linear-gradient(to right, ${task.projectColor}20, transparent)`,
                        borderColor: `${task.projectColor}30`,
                        '--tag-color': `${task.projectColor}20`
                    } as React.CSSProperties}
                >
                    {task.projectName}
                </div>
            </div>
        </button>
    )
}

// Droppable Kanban Column Component
function DroppableKanbanColumn({
    column,
    onTaskClick,
    isOver
}: {
    column: Column
    onTaskClick: (task: Task) => void
    isOver: boolean
}) {
    const { setNodeRef } = useDroppable({
        id: column.id,
        data: { columnName: column.name }
    })

    const isDoneColumn = column.name === 'Done'
    const isReviewColumn = column.name === 'Review'

    const getBgClass = () => {
        if (isDoneColumn) return 'bg-emerald-50/50 dark:bg-emerald-900/10'
        if (isReviewColumn) return 'bg-gray-100/80 dark:bg-gray-800/40'
        return 'bg-muted/50'
    }

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "flex h-full w-full min-w-0 flex-col rounded-lg p-3 transition-all min-h-[150px]",
                getBgClass(),
                isOver && "ring-2 ring-primary/50 bg-primary/5"
            )}
        >
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
            <div className="space-y-2 px-2 pb-2 pt-1 flex-1">
                {column.tasks.length > 0 ? (
                    column.tasks.map(task => (
                        <DraggableTaskCard
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

export function PersonalKanban({ columns: initialColumns, projects, userName }: PersonalKanbanProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [columns, setColumns] = useState<Column[]>(initialColumns)
    const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())
    const [showOverdueOnly, setShowOverdueOnly] = useState(false)
    const [showHelpRequests, setShowHelpRequests] = useState(false)
    const [activeTask, setActiveTask] = useState<Task | null>(null)
    const [overColumnId, setOverColumnId] = useState<string | null>(null)
    const [mounted, setMounted] = useState(false)

    // For portal
    useState(() => {
        setMounted(true)
    })

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // 8px movement before drag starts
            },
        })
    )

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

    const handleTaskClick = useCallback((task: Task) => {
        let url = `/dashboard/projects/${task.projectId}?highlight=${task.id}`
        if (task.pushId) url += `&push=${task.pushId}`
        router.push(url)
    }, [router])

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const { active } = event
        const task = active.data.current?.task as Task | undefined
        if (task) {
            setActiveTask(task)
        }
    }, [])

    const handleDragOver = useCallback((event: any) => {
        const { over } = event
        setOverColumnId(over?.id ?? null)
    }, [])

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        const { active, over } = event
        setActiveTask(null)
        setOverColumnId(null)

        if (!over) return

        const task = active.data.current?.task as Task | undefined
        if (!task) return

        const targetColumnId = over.id as string
        const targetColumn = columns.find(c => c.id === targetColumnId)
        const sourceColumn = columns.find(c => c.tasks.some(t => t.id === task.id))

        if (!targetColumn || !sourceColumn) return
        if (targetColumn.id === sourceColumn.id) return

        // Optimistic update
        setColumns(prev => {
            return prev.map(col => {
                if (col.id === sourceColumn.id) {
                    return {
                        ...col,
                        tasks: col.tasks.filter(t => t.id !== task.id)
                    }
                }
                if (col.id === targetColumn.id) {
                    return {
                        ...col,
                        tasks: [...col.tasks, { ...task, columnName: targetColumn.name, columnId: targetColumn.id }]
                    }
                }
                return col
            })
        })

        // Persist to backend
        try {
            const result = await updateTaskStatus(task.id, targetColumnId, task.projectId)
            if (result?.error) {
                // Rollback on error
                setColumns(prev => {
                    return prev.map(col => {
                        if (col.id === targetColumn.id) {
                            return {
                                ...col,
                                tasks: col.tasks.filter(t => t.id !== task.id)
                            }
                        }
                        if (col.id === sourceColumn.id) {
                            return {
                                ...col,
                                tasks: [...col.tasks, task]
                            }
                        }
                        return col
                    })
                })
                toast({
                    title: "Failed to move task",
                    description: result.error === 'ATTACHMENT_REQUIRED'
                        ? "This task requires a file upload before moving to Review or Done."
                        : result.error,
                    variant: "destructive"
                })
            }
        } catch (error) {
            // Rollback on error
            setColumns(prev => {
                return prev.map(col => {
                    if (col.id === targetColumn.id) {
                        return {
                            ...col,
                            tasks: col.tasks.filter(t => t.id !== task.id)
                        }
                    }
                    if (col.id === sourceColumn.id) {
                        return {
                            ...col,
                            tasks: [...col.tasks, task]
                        }
                    }
                    return col
                })
            })
            toast({
                title: "Failed to move task",
                description: "An error occurred while moving the task.",
                variant: "destructive"
            })
        }
    }, [columns, toast])

    const hasActiveFilters = selectedProjects.size > 0 || showOverdueOnly || showHelpRequests

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="h-full flex flex-col">
                {/* Header */}
                <div className="shrink-0 border-b bg-background p-4">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h1 className="text-lg font-semibold">{userName}'s Board</h1>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {filteredTotalTasks} tasks across {projects.length} divisions
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
                                        <DropdownMenuLabel className="text-xs">Divisions</DropdownMenuLabel>
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
                            <DroppableKanbanColumn
                                key={column.id}
                                column={column}
                                onTaskClick={handleTaskClick}
                                isOver={overColumnId === column.id}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Drag Overlay */}
            {
                typeof document !== 'undefined' && createPortal(
                    <DragOverlay>
                        {activeTask ? (
                            <div className="w-[280px] opacity-90 rotate-2 shadow-2xl">
                                <PersonalTaskCard task={activeTask} onClick={() => { }} />
                            </div>
                        ) : null}
                    </DragOverlay>,
                    document.body
                )
            }
        </DndContext >
    )
}
