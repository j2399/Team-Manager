"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { ArrowLeft, User, LayoutGrid, Calendar, Plus } from "lucide-react"
import Link from "next/link"
import { TaskDialog } from "@/features/kanban/TaskDialog"
import { TaskPreview } from "@/features/kanban/TaskPreview"
import { ProjectGanttChart } from "@/features/timeline/ProjectGanttChart"
import { PushDialog } from "@/features/pushes/PushDialog"

// Dynamically import Board to prevent SSR hydration issues
const Board = dynamic(() => import("@/features/kanban/Board").then(mod => ({ default: mod.Board })), {
    ssr: false,
    loading: () => <div className="flex items-center justify-center h-full">Loading board...</div>
})

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
    createdAt?: Date | string
    updatedAt?: Date | string | null
    requireAttachment?: boolean
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
        lead: { id: string; name: string } | null
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

export function ProjectContent({ project, board, users, pushes = [] }: ProjectContentProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const taskIdFromUrl = searchParams.get('task')
    const highlightTaskId = searchParams.get('highlight')
    const viewFromUrl = searchParams.get('view')
    const [view, setView] = useState<'kanban' | 'gantt'>(viewFromUrl === 'gantt' ? 'gantt' : 'kanban')
    const [previewTask, setPreviewTask] = useState<TaskType | null>(null)
    const [editTask, setEditTask] = useState<TaskType | null>(null)
    const [showPushDialog, setShowPushDialog] = useState(false)
    const [userRole, setUserRole] = useState<string>('Member')

    // Handle view change
    const handleViewChange = (newView: 'kanban' | 'gantt') => {
        if (newView === view) return
        setView(newView)
    }

    // Fetch user role
    useEffect(() => {
        fetch('/api/auth/role')
            .then(res => res.json())
            .then(data => setUserRole(data.role || 'Member'))
            .catch(() => setUserRole('Member'))
    }, [])

    const canManagePushes = userRole === 'Admin' || userRole === 'Team Lead'

    // Get all tasks for Gantt chart with column and push info
    const allTasks = board?.columns.flatMap(col =>
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
        if (taskIdFromUrl && board) {
            for (const col of board.columns) {
                const task = col.tasks.find(t => t.id === taskIdFromUrl)
                if (task) {
                    setPreviewTask({ ...task, column: { name: col.name } })
                    break
                }
            }
        }
    }, [taskIdFromUrl, board])

    const handleClosePreview = () => {
        setPreviewTask(null)
        // Clean URL
        window.history.replaceState({}, '', `/dashboard/projects/${project.id}`)
    }

    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 border-b bg-background">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-3">
	                    <div className="flex items-center gap-2 md:gap-3">
	                        <Button variant="ghost" size="icon" asChild className="h-7 w-7 shrink-0">
	                            <Link href="/dashboard">
	                                <ArrowLeft className="w-4 h-4" />
	                            </Link>
	                        </Button>
	                        <div
	                            className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-border/50"
	                            style={{ backgroundColor: project.color || "#3b82f6" }}
	                        />
	                        <h1 className="text-base md:text-lg font-semibold truncate">{project.name}</h1>
	                        {canManagePushes && view === 'kanban' && (
	                            <Button
	                                variant="outline"
                                size="sm"
                                className="h-7 px-2 md:px-3 shrink-0"
                                onClick={() => setShowPushDialog(true)}
                            >
                                <Plus className="w-3.5 h-3.5 md:mr-1.5" />
                                <span className="hidden md:inline">Add Push</span>
                            </Button>
                        )}
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto">
                        <div className="relative flex items-center p-0.5 bg-muted rounded-lg shrink-0 overflow-hidden">
                            {/* Sliding indicator */}
                            <div
                                className={`absolute inset-y-0.5 w-[calc(50%-2px)] bg-primary rounded-md transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${view === 'kanban' ? 'left-0.5' : 'left-[calc(50%+1px)]'}`}
                                style={{
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                                }}
                            />
                            <button
                                className={`relative z-10 flex items-center gap-1.5 h-7 px-2 md:px-3 rounded-md text-sm font-medium transition-colors duration-200 ${view === 'kanban' ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => handleViewChange('kanban')}
                            >
                                <LayoutGrid className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">Kanban</span>
                            </button>
                            <button
                                className={`relative z-10 flex items-center gap-1.5 h-7 px-2 md:px-3 rounded-md text-sm font-medium transition-colors duration-200 ${view === 'gantt' ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => handleViewChange('gantt')}
                            >
                                <Calendar className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">Gantt</span>
                            </button>
                        </div>
                        {project.lead && (
                            <div className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground shrink-0">
                                <User className="h-3.5 w-3.5" />
                                <span>Lead: {project.lead.name}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
                {view === 'kanban' ? (
                    board ? (
                        <Board
                            board={board}
                            projectId={project.id}
                            users={users}
                            pushes={pushes}
                            highlightTaskId={highlightTaskId}
                        />
                    ) : (
                        <div className="p-10 text-center text-muted-foreground">
                            No Kanban board found for this project.
                        </div>
                    )
                ) : (
                    <div className="p-4 h-full overflow-auto">
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
                                window.history.replaceState({}, '', `/dashboard/projects/${project.id}`)
                            }
                        }}
                    />
                )
            }

            {/* Push Dialog */}
            <PushDialog
                projectId={project.id}
                open={showPushDialog}
                onOpenChange={setShowPushDialog}
            />
        </div >
    )
}
