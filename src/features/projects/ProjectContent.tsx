"use client"

import { Suspense, lazy, useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { LayoutGrid, Calendar, Plus } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { loadBoardModule } from "@/lib/board-module"
import { TaskDialog } from "@/features/kanban/TaskDialog"
import { TaskPreview } from "@/features/kanban/TaskPreview"
import { ProjectGanttChart } from "@/features/timeline/ProjectGanttChart"
import { PushDialog } from "@/features/pushes/PushDialog"
import { TimelineManagerDialog } from "@/features/projects/TimelineManagerDialog"

function hexToRgba(hex: string, alpha: number) {
    const clampedAlpha = Math.max(0, Math.min(1, alpha))
    const normalized = hex.trim().replace(/^#/, "")
    const expanded = normalized.length === 3
        ? normalized.split("").map((c) => c + c).join("")
        : normalized

    if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return `rgba(59, 130, 246, ${clampedAlpha})`

    const r = parseInt(expanded.slice(0, 2), 16)
    const g = parseInt(expanded.slice(2, 4), 16)
    const b = parseInt(expanded.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`
}

const Board = lazy(loadBoardModule)

type PushType = {
    id: string
    name: string
    startDate: Date | string
    endDate: Date | string
    status: string
    color: string
    projectId: string
    taskCount: number
    completedCount: number
    dependsOnId?: string | null
}

type TaskType = {
    id: string
    title: string
    description?: string | null
    columnId: string | null
    status?: string
    startDate?: Date | string | null
    endDate?: Date | string | null
    dueDate?: Date | string | null
    createdAt?: Date | string | null
    updatedAt?: Date | string | null
    requireAttachment?: boolean
    enableProgress?: boolean
    attachmentFolderId?: string | null
    attachmentFolderName?: string | null
    instructionsFileUrl?: string | null
    instructionsFileName?: string | null
    assigneeId?: string | null
    assignee?: { id: string; name: string } | null
    assignees?: { user: { id: string; name: string } }[]
    activityLogs?: { changedByName: string; createdAt: Date | string }[]
    column?: { name: string } | null
    comments?: { createdAt: Date | string }[]
    attachments?: { id: string; createdAt: Date | string }[]
    push?: { id: string; name: string; color: string; status: string } | null
}

type ProjectContentProps = {
    project: {
        id: string
        name: string
        color?: string | null
        archivedAt?: string | null
        leads: { id: string; name: string }[]
    }
    board: {
        id: string
        columns: {
            id: string
            name: string
            order: number
            tasks: TaskType[]
        }[]
    } | null
    users: { id: string; name: string; role?: string; isProjectMember?: boolean }[]
    pushes?: PushType[]
}

function PreviewColumns({
    columns,
    accentColor,
}: {
    columns: NonNullable<ProjectContentProps["board"]>["columns"]
    accentColor: string
}) {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {columns
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((column) => (
                    <div key={column.id} className="rounded-lg border bg-muted/20 p-3">
                        <div className="mb-3 flex items-center gap-2">
                            <h3 className="text-sm font-medium">{column.name}</h3>
                            <span className="text-xs text-muted-foreground">{column.tasks.length}</span>
                        </div>
                        <div className="space-y-2">
                            {column.tasks.slice(0, 8).map((task) => (
                                <div
                                    key={task.id}
                                    className="rounded-md border bg-card p-3 shadow-sm"
                                    style={{ borderColor: `${accentColor}22` }}
                                >
                                    <div className="line-clamp-2 text-sm font-medium leading-snug">{task.title}</div>
                                    {task.assignees && task.assignees.length > 0 && (
                                        <div className="mt-2 text-xs text-muted-foreground">
                                            {task.assignees.slice(0, 2).map((assignee) => assignee.user.name).join(", ")}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {column.tasks.length > 8 && (
                                <div className="px-1 text-xs text-muted-foreground">
                                    +{column.tasks.length - 8} more
                                </div>
                            )}
                            {column.tasks.length === 0 && (
                                <div className="px-1 py-4 text-center text-xs text-muted-foreground">No tasks</div>
                            )}
                        </div>
                    </div>
                ))}
        </div>
    )
}

function BoardPreview({
    board,
    pushes,
    projectColor,
}: {
    board: NonNullable<ProjectContentProps["board"]>
    pushes: PushType[]
    projectColor: string
}) {
    const getColumnsForPush = (pushId: string | null) =>
        board.columns.map((column) => ({
            ...column,
            tasks: column.tasks.filter((task) => pushId === null ? !task.push : task.push?.id === pushId),
        }))

    const backlogColumns = getColumnsForPush(null)
    const showBacklog = pushes.length === 0 || backlogColumns.some((column) => column.tasks.length > 0)

    return (
        <div className="p-4 space-y-4">
            {showBacklog && (
                <section className="space-y-3">
                    {pushes.length > 0 && (
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: projectColor }} />
                            <h2 className="text-sm font-semibold">Backlog</h2>
                        </div>
                    )}
                    <PreviewColumns columns={backlogColumns} accentColor={projectColor} />
                </section>
            )}

            {pushes.map((push) => (
                <section key={push.id} className="space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: push.color }} />
                        <h2 className="text-sm font-semibold">{push.name}</h2>
                    </div>
                    <PreviewColumns columns={getColumnsForPush(push.id)} accentColor={push.color} />
                </section>
            ))}
        </div>
    )
}

export function ProjectContent({ project, board, users, pushes = [] }: ProjectContentProps) {
    const searchParams = useSearchParams()
    const taskIdFromUrl = searchParams.get('task')
    const highlightTaskId = searchParams.get('highlight')
    const viewFromUrl = searchParams.get('view')
    const pushIdFromUrl = searchParams.get('push')
    const [view, setView] = useState<'kanban' | 'gantt'>(viewFromUrl === 'gantt' ? 'gantt' : 'kanban')
    const [previewTask, setPreviewTask] = useState<TaskType | null>(null)
    const [editTask, setEditTask] = useState<TaskType | null>(null)
    const [showPushDialog, setShowPushDialog] = useState(false)
    const [showTimelineDialog, setShowTimelineDialog] = useState(false)
    const [boardState, setBoardState] = useState(board)

    // Handle view change
    const handleViewChange = (newView: 'kanban' | 'gantt') => {
        if (newView === view) return
        setView(newView)
    }

    const projectColor = project.color || "#3b82f6"
    const leadNames = project.leads.map((lead) => lead.name)

    useEffect(() => {
        setBoardState(board)
    }, [board])

    // Get all tasks for Gantt chart with column and push info
    const allTasks = boardState?.columns.flatMap(col =>
        col.tasks.map(task => ({
            ...task,
            column: { name: col.name },
            updatedAt: task.updatedAt,
            startDate: task.startDate ?? null,
            endDate: task.endDate ?? null,
            dueDate: task.dueDate ?? null
        }))
    ) || []

    // Find task from URL and open preview
    useEffect(() => {
        if (taskIdFromUrl && boardState) {
            for (const col of boardState.columns) {
                const task = col.tasks.find(t => t.id === taskIdFromUrl)
                if (task) {
                    setPreviewTask({ ...task, column: { name: col.name } })
                    break
                }
            }
        }
    }, [taskIdFromUrl, boardState])

    // Clear highlight param after animation to prevent repeating on reload/move
    useEffect(() => {
        if (highlightTaskId) {
            const timer = setTimeout(() => {
                const nextParams = new URLSearchParams(searchParams.toString())
                nextParams.delete('highlight')
                const query = nextParams.toString()
                window.history.replaceState(
                    {},
                    '',
                    query ? `/dashboard/projects/${project.id}?${query}` : `/dashboard/projects/${project.id}`
                )
            }, 3000)
            return () => clearTimeout(timer)
        }
    }, [highlightTaskId, searchParams, project.id])

    const handleClosePreview = () => {
        setPreviewTask(null)
        const nextParams = new URLSearchParams(searchParams.toString())
        nextParams.delete('task')

        if (view === 'gantt') nextParams.set('view', 'gantt')
        else nextParams.delete('view')

        const query = nextParams.toString()
        window.history.replaceState(
            {},
            '',
            query ? `/dashboard/projects/${project.id}?${query}` : `/dashboard/projects/${project.id}`
        )
    }

    return (
        <div className="flex min-h-full flex-col bg-background md:bg-transparent">
            <div className="shrink-0 border-b bg-background relative overflow-hidden">
                <div className="relative flex items-center justify-between gap-2 p-3">
                    <div className="flex items-center gap-2 md:gap-3 min-w-0">
                        <TooltipProvider delayDuration={500}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <h1 className="text-base md:text-lg font-semibold truncate cursor-default">{project.name}</h1>
                                </TooltipTrigger>
                                {leadNames.length > 0 && (
                                    <TooltipContent side="bottom" align="start">
                                        <p className="text-xs">Leads: {leadNames.join(', ')}</p>
                                    </TooltipContent>
                                )}
                            </Tooltip>
                        </TooltipProvider>
                        {project.archivedAt && (
                            <span className="inline-flex items-center rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                                Archived
                            </span>
                        )}
                        {view === 'kanban' && (
                            <TooltipProvider delayDuration={1000}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            className="h-7 px-2.5 shrink-0 flex items-center gap-1.5 rounded-md text-xs font-medium transition-all tag-shimmer"
                                            style={{
                                                background: `linear-gradient(to right, ${projectColor}20, transparent)`,
                                                border: `1px solid ${projectColor}40`,
                                                '--tag-color': `${projectColor}20`
                                            } as React.CSSProperties}
                                            onClick={() => setShowTimelineDialog(true)}
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            Edit Projects
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-[200px] text-center">
                                        <p className="text-xs">A project is a time-boxed sprint to group related tasks together</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="relative flex items-center p-0.5 bg-muted rounded-lg overflow-hidden">
                            {/* Sliding indicator */}
                            <div
                                className={`absolute inset-y-0.5 w-[calc(50%-2px)] bg-primary rounded-md transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${view === 'kanban' ? 'left-0.5' : 'left-[calc(50%+1px)]'}`}
                                style={{
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                                }}
                            />
                            <button
                                className={`relative z-10 flex items-center gap-1.5 h-7 px-2 sm:px-3 rounded-md text-sm font-medium transition-colors duration-200 ${view === 'kanban' ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => handleViewChange('kanban')}
                            >
                                <LayoutGrid className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline text-xs">Kanban</span>
                            </button>
                            <button
                                className={`relative z-10 flex items-center gap-1.5 h-7 px-2 sm:px-3 rounded-md text-sm font-medium transition-colors duration-200 ${view === 'gantt' ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => handleViewChange('gantt')}
                            >
                                <Calendar className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline text-xs">Gantt</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0">
                {view === 'kanban' ? (
                    boardState ? (
                        <Suspense fallback={<BoardPreview board={boardState} pushes={pushes} projectColor={projectColor} />}>
                            <Board
                                board={boardState}
                                projectId={project.id}
                                projectColor={projectColor}
                                users={users}
                                pushes={pushes}
                                highlightTaskId={highlightTaskId}
                                expandPushId={pushIdFromUrl}
                                initialNewTask={searchParams.get('newTask') === 'true'}
                                initialAssigneeId={searchParams.get('assigneeId')}
                                initialPushId={pushIdFromUrl}
                            />
                        </Suspense>
                    ) : (
                        <div className="p-10 text-center text-muted-foreground">
                            No Kanban board found for this division.
                        </div>
                    )
                ) : (
                    <div className="">
                        <ProjectGanttChart
                            tasks={allTasks}
                            projectId={project.id}
                            pushes={pushes}
                        />
                    </div>
                )
                }
            </div >

            {previewTask && (
                <TaskPreview
                    task={previewTask}
                    projectId={project.id}
                    open={true}
                    onOpenChange={(open) => !open && handleClosePreview()}
                    onEdit={() => {
                        setEditTask(previewTask)
                        setPreviewTask(null)
                    }}
                />
            )}

            {
                editTask && (
                    <TaskDialog
                        projectId={project.id}
                        users={users}
                        task={editTask}
                        open={true}
                        onOpenChange={(open) => {
                            if (!open) {
                                setEditTask(null)
                                const nextParams = new URLSearchParams(searchParams.toString())
                                nextParams.delete('task')

                                if (view === 'gantt') nextParams.set('view', 'gantt')
                                else nextParams.delete('view')

                                const query = nextParams.toString()
                                window.history.replaceState(
                                    {},
                                    '',
                                    query ? `/dashboard/projects/${project.id}?${query}` : `/dashboard/projects/${project.id}`
                                )
                            }
                        }}
                    />
                )
            }

            {/* Push Dialog (keep for individual edits if needed from Kanban) */}
            <PushDialog
                projectId={project.id}
                open={showPushDialog}
                onOpenChange={setShowPushDialog}
            />

            {/* Timeline Manager Dialog */}
            <TimelineManagerDialog
                projectId={project.id}
                open={showTimelineDialog}
                onOpenChange={setShowTimelineDialog}
                initialPushes={pushes}
            />
        </div>
    )
}
