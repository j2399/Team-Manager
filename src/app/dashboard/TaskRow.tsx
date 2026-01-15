"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, Clock, Loader2 } from "lucide-react"

type TaskRowProps = {
    task: {
        id: string
        title: string
        columnName: string
        projectId: string
        projectName: string
        projectColor: string
        pushId: string | null
        dueText: string
        isOverdue: boolean
        commentsCount: number
        attachmentsCount: number
    }
}

export function TaskRow({ task }: TaskRowProps) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)

    const handleClick = () => {
        setIsLoading(true)
        // Build URL with push parameter if available
        let url = `/dashboard/projects/${task.projectId}?task=${task.id}`
        if (task.pushId) {
            url += `&push=${task.pushId}`
        }
        router.push(url)
    }

    return (
        <button
            onClick={handleClick}
            disabled={isLoading}
            className="relative w-full flex items-center justify-between p-3 rounded-md border border-border hover:bg-muted/30 transition-colors group text-left overflow-hidden"
        >
            {/* Project color gradient from left */}
            <div
                className="absolute inset-y-0 left-0 w-16 pointer-events-none"
                style={{
                    background: `linear-gradient(to right, ${task.projectColor}15, transparent)`
                }}
            />

            <div className="relative flex items-center gap-2 min-w-0 flex-1">
                {/* Task title */}
                <span className="text-sm truncate">{task.title}</span>

                {/* Status indicator - subtle, right of title */}
                <span className="text-[9px] px-1 py-px rounded text-muted-foreground/60 shrink-0">
                    {task.columnName}
                </span>
            </div>

            <div className="flex items-center gap-3 shrink-0 ml-2">
                {/* Comments/attachments count */}
                {(task.commentsCount > 0 || task.attachmentsCount > 0) && (
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">
                        {task.commentsCount > 0 && `${task.commentsCount} comments`}
                        {task.commentsCount > 0 && task.attachmentsCount > 0 && ' · '}
                        {task.attachmentsCount > 0 && `${task.attachmentsCount} files`}
                    </span>
                )}

                {/* Due date */}
                {task.dueText && (
                    <span className={`text-[10px] flex items-center gap-0.5 ${task.isOverdue ? 'text-red-500' : 'text-muted-foreground'}`}>
                        <Clock className="h-2.5 w-2.5" />
                        {task.dueText}
                    </span>
                )}

                {/* Arrow with loading state */}
                {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
                ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
            </div>
        </button>
    )
}

type ApprovalRowProps = {
    task: {
        id: string
        title: string
        projectId: string
        projectName: string
        projectColor: string
        pushId: string | null
        assignedTo: string[]
        commentsCount: number
        attachmentsCount: number
    }
}

export function ApprovalRow({ task }: ApprovalRowProps) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)

    const handleClick = () => {
        setIsLoading(true)
        let url = `/dashboard/projects/${task.projectId}?task=${task.id}`
        if (task.pushId) {
            url += `&push=${task.pushId}`
        }
        router.push(url)
    }

    return (
        <button
            onClick={handleClick}
            disabled={isLoading}
            className="relative w-full flex items-center justify-between p-3 rounded-md border border-border hover:bg-muted/30 transition-colors group text-left overflow-hidden"
        >
            {/* Project color gradient from left */}
            <div
                className="absolute inset-y-0 left-0 w-16 pointer-events-none"
                style={{
                    background: `linear-gradient(to right, ${task.projectColor}15, transparent)`
                }}
            />

            <div className="relative flex items-center gap-3 min-w-0 flex-1">
                {/* Task title */}
                <span className="text-sm truncate">{task.title}</span>
            </div>

            <div className="relative flex items-center gap-3 shrink-0 ml-2">
                {/* Assigned to */}
                {task.assignedTo.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                        by {task.assignedTo[0]}{task.assignedTo.length > 1 && ` +${task.assignedTo.length - 1}`}
                    </span>
                )}

                {/* Comments/attachments */}
                {(task.commentsCount > 0 || task.attachmentsCount > 0) && (
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">
                        {task.commentsCount > 0 && `${task.commentsCount}c`}
                        {task.attachmentsCount > 0 && ` ${task.attachmentsCount}f`}
                    </span>
                )}

                {/* Arrow with loading state */}
                {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
                ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
            </div>
        </button>
    )
}
