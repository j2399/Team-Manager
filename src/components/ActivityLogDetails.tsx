"use client"

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock, User, FileText, ArrowRight } from "lucide-react"
import { ProjectRouteLink } from "@/features/projects/ProjectRouteLink"

type ActivityLogDetailsProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    activity: {
        action: string
        field: string | null
        oldValue: string | null
        newValue: string | null
        changedByName: string
        details: string | null
        taskTitle: string | null
        createdAt: Date | string
        task: {
            id: string
            title: string
            column: {
                name: string
                board: {
                    project: {
                        id: string
                        name: string
                    }
                }
            } | null
        } | null
    } | null
}

export function ActivityLogDetails({ open, onOpenChange, activity }: ActivityLogDetailsProps) {
    if (!activity) return null

    const formatDateTime = (date: Date | string) => {
        const d = typeof date === 'string' ? new Date(date) : date
        return d.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        })
    }

    const getActionLabel = (action: string) => {
        switch (action) {
            case 'created': return 'Created'
            case 'updated': return 'Updated'
            case 'moved': return 'Moved'
            case 'deleted': return 'Deleted'
            default: return action.charAt(0).toUpperCase() + action.slice(1)
        }
    }

    const getFieldLabel = (field: string | null) => {
        if (!field) return 'General'
        const labels: Record<string, string> = {
            'assignee': 'Assignee',
            'description': 'Description',
            'startDate': 'Start Date',
            'endDate': 'Due Date',
            'status': 'Status'
        }
        return labels[field] || field.charAt(0).toUpperCase() + field.slice(1)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader className="sr-only">
                    <DialogTitle>Activity Details</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    {/* Task Info */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            Task: {activity.task?.title || activity.taskTitle || 'Unknown Task'}
                        </div>
                        {activity.task?.column?.board?.project && (
                            <div className="text-xs text-muted-foreground pl-6">
                                Division: {activity.task.column.board.project.name}
                            </div>
                        )}
                        {!activity.task && activity.taskTitle && (
                            <div className="text-xs text-muted-foreground pl-6 italic">
                                (Task has been deleted)
                            </div>
                        )}
                    </div>

                    {/* Action */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Action:</span>
                            <Badge variant="secondary">{getActionLabel(activity.action)}</Badge>
                        </div>
                    </div>

                    {/* Field Change */}
                    {activity.field && (
                        <div className="space-y-2">
                            <div className="text-sm font-medium">Field Changed:</div>
                            <div className="pl-4 space-y-1">
                                <div className="text-xs text-muted-foreground">
                                    <span className="font-medium">{getFieldLabel(activity.field)}</span>
                                </div>
                                {activity.oldValue !== null && activity.newValue !== null && (
                                    <div className="space-y-1 pl-2 border-l-2 border-muted">
                                        <div className="text-xs">
                                            <span className="text-red-600 line-through">{activity.oldValue || 'None'}</span>
                                            <span className="mx-2">→</span>
                                            <span className="text-green-600 font-medium">{activity.newValue || 'None'}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Details */}
                    {activity.details && (
                        <div className="space-y-2">
                            <div className="text-sm font-medium">Details:</div>
                            <div className="text-xs text-muted-foreground pl-4 bg-muted/50 rounded p-2">
                                {activity.details}
                            </div>
                        </div>
                    )}

                    {/* Changed By */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">Changed by:</span>
                            <span>{activity.changedByName}</span>
                        </div>
                    </div>

                    {/* Timestamp */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">Time:</span>
                            <span className="text-muted-foreground">{formatDateTime(activity.createdAt)}</span>
                        </div>
                    </div>

                    {/* Go to Task Button */}
                    {activity.task && activity.task.column?.board?.project && (
                        <div className="pt-4 border-t">
                            <ProjectRouteLink
                                href={`/dashboard/projects/${activity.task.column.board.project.id}?task=${activity.task.id}`}
                                projectId={activity.task.column.board.project.id}
                                onClick={() => onOpenChange(false)}
                            >
                                <Button className="w-full" variant="default">
                                    <ArrowRight className="h-4 w-4 mr-2" />
                                    Go to Task
                                </Button>
                            </ProjectRouteLink>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
