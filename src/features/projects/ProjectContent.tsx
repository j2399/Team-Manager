"use client"

import { Suspense, lazy, useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { LayoutGrid, Calendar, Plus } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { loadBoardModule, preloadBoardModule } from "@/lib/board-module"
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
preloadBoardModule()

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

function ProjectBoardSkeleton() {
    return (
        <div className="h-full overflow-x-auto p-3">
            <div className="flex min-h-full min-w-max gap-3">
                {[0, 1, 2, 3].map((columnIndex) => (
                    <section
                        key={columnIndex}
                        className="flex w-[280px] shrink-0 flex-col rounded-lg bg-muted/30"
                    >
                        <div className="flex items-center justify-between p-3">
                            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                            <div className="h-5 w-5 rounded-full bg-muted animate-pulse" />
                        </div>
                        <div className="flex-1 space-y-2 p-2">
                            {Array.from({ length: 3 - (columnIndex % 2) }).map((_, cardIndex) => (
                                <div
                                    key={cardIndex}
                                    className="rounded-lg bg-muted/60 p-3 animate-pulse"
                                    style={{ animationDelay: `${(columnIndex * 3 + cardIndex) * 35}ms` }}
                                >
                                    <div className="h-4 w-3/4 rounded bg-muted" />
                                    <div className="mt-2 h-3 w-1/2 rounded bg-muted/80" />
                                </div>
                            ))}
                        </div>
                    </section>
                ))}
            </div>
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
                        <Suspense fallback={<ProjectBoardSkeleton />}>
                            <Board
                                key={project.id}
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
                            projectColor={projectColor}
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
