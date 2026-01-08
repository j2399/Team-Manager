"use client"

import Link from "next/link"

type Activity = {
    id: string
    action: string
    field: string | null
    taskTitle: string | null
    changedByName: string
    createdAt: Date | string
    task: {
        id: string
        column: {
            board: {
                project: { id: string }
            }
        } | null
    } | null
}

function formatTimeAgo(date: Date | string): string {
    const now = new Date()
    const then = new Date(date)
    const diffMs = now.getTime() - then.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'now'
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    return `${diffDays}d`
}

export function DashboardClient({ activity }: { activity: Activity }) {
    const projectId = activity.task?.column?.board?.project?.id

    const content = (
        <div className="flex items-center justify-between gap-2 p-1.5 rounded hover:bg-muted/50 transition-colors text-xs">
            <div className="flex items-center gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0">{activity.changedByName.split(' ')[0]}</span>
                <span className="truncate">{activity.taskTitle || 'Task'}</span>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">{formatTimeAgo(activity.createdAt)}</span>
        </div>
    )

    if (projectId && activity.task?.id) {
        return (
            <Link href={`/dashboard/projects/${projectId}?task=${activity.task.id}`}>
                {content}
            </Link>
        )
    }

    return content
}
