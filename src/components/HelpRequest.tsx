"use client"

import { useState } from "react"
import { useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import { HelpCircle, CheckCircle, Clock, X, Loader2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { cancelHelpRequest, createHelpRequest, updateHelpRequestStatus } from "@/app/actions/help-requests"
import { cn } from "@/lib/utils"

type HelpRequestData = {
    id: string
    requestedBy: string
    requestedByName: string
    message: string | null
    status: string
    createdAt: string | number
    resolvedByName: string | null
}

type HelpRequestProps = {
    taskId: string
    taskTitle: string
    currentUserId?: string | null
    userRole?: string
}

export function HelpRequest({ taskId, taskTitle, currentUserId, userRole }: HelpRequestProps) {
    const liveHelpRequests = useQuery(
        api.tasks.getHelpRequests,
        taskId ? { taskId, statuses: ['open', 'acknowledged'] } : "skip"
    ) as HelpRequestData[] | undefined
    const [showAskDialog, setShowAskDialog] = useState(false)
    const [message, setMessage] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)

    const isLeadership = userRole === 'Admin' || userRole === 'Team Lead'
    const helpRequest = liveHelpRequests?.[0] ?? null

    const askForHelp = async () => {
        setIsSubmitting(true)
        try {
            const result = await createHelpRequest(taskId, message.trim() || null)
            if (result?.success) {
                setShowAskDialog(false)
                setMessage("")
            } else {
                alert(result?.error || 'Failed to submit help request')
            }
        } catch (error) {
            console.error('Failed to ask for help:', error)
            alert('Failed to submit help request')
        } finally {
            setIsSubmitting(false)
        }
    }

    const updateStatus = async (status: 'acknowledged' | 'resolved') => {
        if (!helpRequest) return

        setIsSubmitting(true)
        try {
            await updateHelpRequestStatus(taskId, helpRequest.id, status)
        } catch (error) {
            console.error('Failed to update help request:', error)
        } finally {
            setIsSubmitting(false)
        }
    }

    const cancelRequest = async () => {
        if (!helpRequest) return

        setIsSubmitting(true)
        try {
            await cancelHelpRequest(taskId, helpRequest.id)
        } catch (error) {
            console.error('Failed to cancel help request:', error)
        } finally {
            setIsSubmitting(false)
        }
    }

    if (liveHelpRequests === undefined) {
        return null
    }

    // Show existing help request
    if (helpRequest) {
        const isRequester = helpRequest.requestedBy === currentUserId
        const canManage = isLeadership || isRequester

        return (
            <div className={cn(
                "rounded-lg border p-3 space-y-2",
                helpRequest.status === 'open'
                    ? "bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50"
                    : "bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/50"
            )}>
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className={cn(
                            "h-4 w-4 shrink-0",
                            helpRequest.status === 'open' ? "text-amber-500" : "text-blue-500"
                        )} />
                        <div>
                            <p className="text-xs font-medium">
                                {helpRequest.requestedByName} needs help
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                                {helpRequest.status === 'acknowledged' ? 'Being looked at' : 'Waiting for response'}
                            </p>
                        </div>
                    </div>

                    {isRequester && helpRequest.status === 'open' && (
                        <button
                            onClick={cancelRequest}
                            disabled={isSubmitting}
                            className="p-1 hover:bg-muted rounded transition-colors"
                            title="Cancel request"
                        >
                            <X className="h-3 w-3 text-muted-foreground" />
                        </button>
                    )}
                </div>

                {helpRequest.message && (
                    <p className="text-xs text-muted-foreground bg-background/50 rounded p-2">
                        &quot;{helpRequest.message}&quot;
                    </p>
                )}

                {isLeadership && (
                    <div className="flex items-center gap-2 pt-1">
                        {helpRequest.status === 'open' && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => updateStatus('acknowledged')}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? (
                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : (
                                    <Clock className="h-3 w-3 mr-1" />
                                )}
                                Acknowledge
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs"
                            onClick={() => updateStatus('resolved')}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                                <CheckCircle className="h-3 w-3 mr-1" />
                            )}
                            Mark Resolved
                        </Button>
                    </div>
                )}
            </div>
        )
    }

    // Show "Ask for Help" button
    return (
        <>
            <button
                onClick={() => setShowAskDialog(true)}
                className="h-6 text-[10px] px-2 rounded-md font-medium border flex items-center gap-1 transition-colors hover:opacity-80"
                style={{
                    background: 'linear-gradient(to right, rgba(251, 191, 36, 0.15), transparent)',
                    borderColor: 'rgba(251, 191, 36, 0.4)',
                    color: 'rgb(107, 114, 128)',
                }}
            >
                <HelpCircle className="h-3 w-3 text-amber-400" />
                Ask for Help
            </button>

            <Dialog open={showAskDialog} onOpenChange={setShowAskDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-sm">Ask for Help</DialogTitle>
                    </DialogHeader>

                    <Textarea
                        placeholder="What do you need help with? (optional)"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        className="min-h-[80px] text-sm resize-none"
                    />

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAskDialog(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={askForHelp}
                            disabled={isSubmitting}
                            className="bg-amber-500 hover:bg-amber-600 text-white"
                        >
                            {isSubmitting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                            ) : (
                                <HelpCircle className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            Send
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
