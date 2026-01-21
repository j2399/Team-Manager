"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

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
        progress: number
        enableProgress: boolean
        startDate: string | null
        endDate: string | null
    }
}

const getInitials = (name: string) => {
    const parts = name.split(' ')
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    return name.slice(0, 2).toUpperCase()
}

export function TaskRow({ task }: TaskRowProps) {
    const router = useRouter()

    const handleClick = () => {
        let url = `/dashboard/projects/${task.projectId}?highlight=${task.id}`
        if (task.pushId) url += `&push=${task.pushId}`
        router.push(url)
    }

    return (
        <button
            onClick={handleClick}
            className={cn(
                "w-full text-left group relative flex flex-col rounded-lg border bg-card p-3 shadow-sm transition-all duration-200 overflow-hidden",
                "hover:shadow-md hover:border-primary/20 border-border"
            )}
        >
            <div className="flex items-start justify-between gap-2 mb-3">
                <span className="text-sm font-medium leading-snug line-clamp-2">{task.title}</span>
            </div>

            <div className="flex items-center justify-between gap-2 mt-auto">
                <div className="flex items-center gap-1.5 min-w-0">
                    {task.dueText && (
                        <div className={cn(
                            "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-sm font-medium border truncate",
                            task.isOverdue ? "bg-red-50 text-red-600 border-red-100" : "bg-muted text-muted-foreground border-transparent"
                        )}>
                            <Clock className="w-3 h-3 shrink-0" />
                            <span className="truncate">{task.dueText}</span>
                        </div>
                    )}
                </div>

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

type ApprovalRowProps = {
    task: {
        id: string
        title: string
        description: string | null
        projectId: string
        projectName: string
        projectColor: string
        pushId: string | null
        assignedTo: string[]
        submittedAt: string | null
        commentsCount: number
        attachmentsCount: number
        progress: number
        enableProgress: boolean
        startDate: string | null
        endDate: string | null
        doneColumnId: string
        inProgressColumnId: string
    }
    onApproved?: () => void
    onDenied?: () => void
}

export function ApprovalRow({ task, onApproved, onDenied }: ApprovalRowProps) {
    const router = useRouter()
    const [ApprovalPreviewButton, setApprovalPreviewButton] = useState<React.ComponentType<any> | null>(null)

    // Dynamically import the preview button to avoid SSR issues
    useEffect(() => {
        import('./ApprovalPreview').then((mod) => {
            setApprovalPreviewButton(() => mod.ApprovalPreviewButton)
        })
    }, [])

    const handleClick = () => {
        let url = `/dashboard/projects/${task.projectId}?highlight=${task.id}`
        if (task.pushId) url += `&push=${task.pushId}`
        router.push(url)
    }

    const maxVisible = 2
    const visibleAssignees = task.assignedTo.slice(0, maxVisible)
    const extraCount = task.assignedTo.length - maxVisible

    // Calculate pending review time
    const pendingText = task.submittedAt ? (() => {
        const days = Math.floor((Date.now() - new Date(task.submittedAt).getTime()) / (1000 * 60 * 60 * 24))
        return days === 0 ? 'Pending today' : `Pending ${days}d`
    })() : null

    return (
        <div
            className={cn(
                "w-full text-left group relative flex flex-col rounded-lg border bg-card p-3 shadow-sm transition-all duration-200 overflow-hidden min-h-[88px]",
                "hover:shadow-md hover:border-primary/20 border-border"
            )}
        >
            <div className="flex items-center justify-between gap-2 mb-3">
                <button
                    onClick={handleClick}
                    className="text-sm font-medium leading-snug line-clamp-2 text-left hover:underline flex-1"
                >
                    {task.title}
                </button>
                {ApprovalPreviewButton && (
                    <ApprovalPreviewButton
                        task={task}
                        onApproved={onApproved}
                        onDenied={onDenied}
                    />
                )}
            </div>

            <div className="flex items-center justify-between gap-2 mt-auto">
                <div className="flex items-center gap-2 min-w-0">
                    {/* Assignee Avatars */}
                    <div className="flex -space-x-[5px]">
                        {visibleAssignees.map((name, index) => (
                            <Avatar
                                key={name + index}
                                className="relative h-6 w-6 shrink-0 bg-background text-[10px] ring-2 ring-background"
                                title={name}
                                style={{ zIndex: 30 - index }}
                            >
                                <AvatarFallback className="bg-primary/5 text-primary">
                                    {getInitials(name)}
                                </AvatarFallback>
                            </Avatar>
                        ))}
                        {extraCount > 0 && (
                            <Avatar
                                className="relative h-6 w-6 shrink-0 bg-background text-[10px] ring-2 ring-background"
                                title={task.assignedTo.slice(maxVisible).join(", ")}
                                style={{ zIndex: 0 }}
                            >
                                <AvatarFallback className="bg-muted text-muted-foreground font-medium">
                                    +{extraCount}
                                </AvatarFallback>
                            </Avatar>
                        )}
                        {task.assignedTo.length === 0 && (
                            <Avatar className="h-6 w-6 shrink-0 bg-background text-[10px] ring-2 ring-background" title="Unassigned">
                                <AvatarFallback className="bg-muted text-muted-foreground">—</AvatarFallback>
                            </Avatar>
                        )}
                    </div>

                    {/* Pending Review Time */}
                    {pendingText && (
                        <div className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-sm font-medium border bg-muted text-muted-foreground border-transparent truncate">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span className="truncate">{pendingText}</span>
                        </div>
                    )}
                </div>

                {/* Project Badge */}
                <div
                    className="text-[10px] px-2 py-0.5 rounded-sm font-medium text-muted-foreground truncate max-w-[100px]"
                    style={{ background: `linear-gradient(to right, ${task.projectColor}20, transparent)` }}
                >
                    {task.projectName}
                </div>
            </div>
        </div>
    )
}
