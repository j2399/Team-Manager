"use client"

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { useDroppable } from "@dnd-kit/core"
import { TaskCard } from "./TaskCard"
import { Lock, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

type Task = {
    id: string
    title: string
    columnId: string | null
    difficulty?: string | null
    startDate?: Date | string | null
    endDate?: Date | string | null
    updatedAt?: Date | string | null
    requireAttachment?: boolean
    assignee?: { name: string } | null
    assignees?: { user: { id: string; name: string } }[]
    activityLogs?: { changedByName: string; createdAt: Date | string }[]
    comments?: { createdAt: Date | string }[]
    attachments?: { id: string; createdAt: Date | string }[]
}

type ColumnProps = {
    column: {
        id: string
        name: string
        tasks: Task[]
    }
    projectId: string
    users: { id: string; name: string }[]
    onEditTask?: (task: Task) => void
    onAddTask?: () => void
    isDoneColumn?: boolean
    isReviewColumn?: boolean
    userRole?: string
    pushId?: string | null
    isFlashing?: boolean
    highlightTaskId?: string | null
    currentUserId?: string | null
}

export function Column({ column, projectId, onEditTask, onAddTask, isDoneColumn, isReviewColumn, userRole, isFlashing, pushId, highlightTaskId, currentUserId }: ColumnProps) {
    const isAdmin = userRole === 'Admin' || userRole === 'Team Lead'
    // Members can drop INTO Review, but only Done is fully restricted for non-admins
    const isDropDisabled = !isAdmin && isDoneColumn
    // Review and Done are restricted for clicking/dragging FROM for non-admins
    const isInteractionRestricted = !isAdmin && (isDoneColumn || isReviewColumn)

    const droppableId = `${pushId || 'backlog'}::${column.id}`

    const { setNodeRef: setDroppableRef, isOver } = useDroppable({
        id: droppableId,
        data: { type: "Column", column, pushId },
        disabled: isDropDisabled
    })

    // Background color based on column type and drag state
    const getBgClass = () => {
        if (isDoneColumn) return 'bg-emerald-50/50'
        if (isFlashing) return 'bg-red-100 ring-4 ring-red-400 animate-pulse'
        if (isReviewColumn && isOver) return 'bg-gray-200 ring-2 ring-gray-400'
        if (isReviewColumn) return 'bg-gray-100/80'
        return 'bg-muted/50'
    }

    return (
        <div
            ref={setDroppableRef}
            className={`flex w-full min-w-0 flex-col rounded-lg p-3 transition-all min-h-[150px] ${getBgClass()} ${isDropDisabled ? 'opacity-50' : ''}`}
        >
            <div className="flex items-center gap-2 mb-3 px-1">
                <h3 className={`font-medium text-sm ${isDoneColumn ? 'text-emerald-700' : ''}`}>{column.name}</h3>
                <span className={`text-xs ${isDoneColumn ? 'text-emerald-600' : 'text-muted-foreground'}`}>{column.tasks.length}</span>
                {isDropDisabled && <Lock className="w-3 h-3 text-muted-foreground" />}
                {(column.name === 'Todo' || column.name === 'To Do') && onAddTask && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 ml-auto"
                        onClick={onAddTask}
                    >
                        <Plus className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>

            <div className="space-y-2 px-2 pb-2 pt-1">
                <SortableContext items={column.tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    {column.tasks.map(task => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            onClick={isInteractionRestricted ? undefined : onEditTask}
                            isReviewColumn={isReviewColumn}
                            isDoneColumn={isDoneColumn}
                            isAdmin={isAdmin}
                            isDragDisabled={isInteractionRestricted}
                            isHighlighted={task.id === highlightTaskId}
                            domId={`task-card-${task.id}`}
                            currentUserId={currentUserId}
                            projectId={projectId}
                        />
                    ))}
                </SortableContext>

                {column.tasks.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                        {isDropDisabled ? 'Restricted' : 'No tasks'}
                    </p>
                )}
            </div>

        </div>
    )
}
