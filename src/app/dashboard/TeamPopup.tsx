"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ChevronRight, ChevronDown, Clock } from "lucide-react"
import Link from "next/link"

type TeamMember = {
    id: string
    name: string
    avatar: string | null
    done: number
    inProgress: number
    review: number
    todo: number
    total: number
    tasks: {
        id: string
        title: string
        columnName: string
        projectId: string
        projectName: string
        dueDate: string | null
    }[]
}

type TeamPopupProps = {
    members: TeamMember[]
    totalTasks: number
    children: React.ReactNode
}

function formatDueDate(date: string | null): { text: string; isOverdue: boolean } {
    if (!date) return { text: '', isOverdue: false }
    const now = new Date()
    const due = new Date(date)
    const diffMs = due.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffMs < 0) {
        const overdueDays = Math.abs(diffDays)
        if (overdueDays === 0) return { text: 'Today', isOverdue: true }
        return { text: `${overdueDays}d overdue`, isOverdue: true }
    }
    if (diffDays === 0) return { text: 'Today', isOverdue: false }
    if (diffDays === 1) return { text: 'Tomorrow', isOverdue: false }
    return { text: `${diffDays}d`, isOverdue: false }
}

export function TeamPopup({ members, totalTasks, children }: TeamPopupProps) {
    const [open, setOpen] = useState(false)
    const [expandedMember, setExpandedMember] = useState<string | null>(null)

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-base font-medium">
                        Team Overview
                        <span className="text-xs font-normal text-muted-foreground ml-2">
                            {members.length} members · {totalTasks} total tasks
                        </span>
                    </DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto -mx-6 px-6">
                    <div className="space-y-1">
                        {members.map(member => {
                            const isExpanded = expandedMember === member.id
                            const activeTasks = member.tasks.filter(t => t.columnName !== 'Done')

                            return (
                                <div key={member.id} className="border border-border rounded-md">
                                    <button
                                        onClick={() => setExpandedMember(isExpanded ? null : member.id)}
                                        className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                                                {member.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate">{member.name}</p>
                                                <p className="text-[10px] text-muted-foreground">
                                                    {activeTasks.length} active · {member.done} completed
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 shrink-0">
                                            <div className="hidden sm:flex items-center gap-3 text-[10px] text-muted-foreground">
                                                <span className="px-1.5 py-0.5 bg-muted rounded">{member.todo} To Do</span>
                                                <span className="px-1.5 py-0.5 bg-muted rounded">{member.inProgress} In Progress</span>
                                                <span className="px-1.5 py-0.5 bg-muted rounded">{member.review} Review</span>
                                            </div>
                                            {isExpanded ? (
                                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                            ) : (
                                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                            )}
                                        </div>
                                    </button>

                                    {isExpanded && activeTasks.length > 0 && (
                                        <div className="border-t border-border bg-muted/20 p-2 space-y-1">
                                            {activeTasks.slice(0, 10).map(task => {
                                                const { text: dueText, isOverdue } = formatDueDate(task.dueDate)
                                                return (
                                                    <Link
                                                        key={task.id}
                                                        href={`/dashboard/projects/${task.projectId}?task=${task.id}`}
                                                        onClick={() => setOpen(false)}
                                                        className="flex items-center justify-between p-2 rounded hover:bg-background transition-colors group"
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                                            <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground shrink-0">
                                                                {task.columnName}
                                                            </span>
                                                            <span className="text-xs truncate">{task.title}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                                            {dueText && (
                                                                <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue ? 'text-red-500' : 'text-muted-foreground'}`}>
                                                                    <Clock className="h-2.5 w-2.5" />
                                                                    {dueText}
                                                                </span>
                                                            )}
                                                            <span className="text-[10px] text-muted-foreground hidden sm:inline">
                                                                {task.projectName}
                                                            </span>
                                                            <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        </div>
                                                    </Link>
                                                )
                                            })}
                                            {activeTasks.length > 10 && (
                                                <p className="text-[10px] text-muted-foreground text-center py-1">
                                                    +{activeTasks.length - 10} more tasks
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {isExpanded && activeTasks.length === 0 && (
                                        <div className="border-t border-border bg-muted/20 p-3">
                                            <p className="text-xs text-muted-foreground text-center">No active tasks</p>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
