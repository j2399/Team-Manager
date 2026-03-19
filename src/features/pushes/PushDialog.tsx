"use client"

import { useState, useTransition, useEffect } from "react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import { Trash2 } from "lucide-react"
import { createPush, updatePush, deletePush } from "@/app/actions/pushes"

type PushType = {
    id: string
    name: string
    startDate: Date | string
    endDate: Date | string | null
    status: string
    projectId: string
}

interface PushDialogProps {
    projectId: string
    open: boolean
    onOpenChange: (open: boolean) => void
    push?: PushType | null
}

// Calculate default dates
const getDefaultStartDate = () => new Date().toISOString().split('T')[0]
const getDefaultEndDate = () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

export function PushDialog({ projectId, open, onOpenChange, push }: PushDialogProps) {
    const [name, setName] = useState(push?.name || "")
    const [startDate, setStartDate] = useState(push?.startDate ? new Date(push.startDate).toISOString().split('T')[0] : getDefaultStartDate())
    const [endDate, setEndDate] = useState(push?.endDate ? new Date(push.endDate).toISOString().split('T')[0] : "")
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    // Reset dates when dialog opens or push changes
    useEffect(() => {
        if (open) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- reset local dialog state from props on open
            setName(push?.name || "")
            setStartDate(push?.startDate ? new Date(push.startDate).toISOString().split('T')[0] : getDefaultStartDate())
            setEndDate(push?.endDate ? new Date(push.endDate).toISOString().split('T')[0] : "")
            setError(null)
            setShowDeleteConfirm(false)
            setIsDeleting(false)
        }
    }, [open, push])

    const handleDelete = async () => {
        if (!push) return
        setIsDeleting(true)
        const result = await deletePush(push.id, projectId)
        if (result.error) {
            setError(result.error)
            setIsDeleting(false)
            setShowDeleteConfirm(false)
        } else {
            setShowDeleteConfirm(false)
            onOpenChange(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setError(null)

        if (!name.trim()) {
            setError("Project name is required")
            return
        }

        if (!startDate) {
            setError("Start date is required")
            return
        }

        if (endDate && new Date(endDate) < new Date(startDate)) {
            setError("End date must be after or equal to start date")
            return
        }

        startTransition(async () => {
            let result
            if (push) {
                result = await updatePush({
                    id: push.id,
                    name: name.trim(),
                    startDate,
                    endDate: endDate || null
                })
            } else {
                const formData = new FormData()
                formData.append('name', name.trim())
                formData.append('projectId', projectId)
                formData.append('startDate', startDate)
                if (endDate) formData.append('endDate', endDate)
                result = await createPush(formData)
            }

            if (result.error) {
                setError(result.error)
            } else {
                if (!push) { // Only reset if creating new
                    setName("")
                    setStartDate(getDefaultStartDate())
                    setEndDate("")
                }
                setError(null)
                onOpenChange(false)
            }
        })
    }

    const handleClose = () => {
        setName("")
        setStartDate(getDefaultStartDate())
        setEndDate("")
        setError(null)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{push ? "Edit Project" : "Create New Project"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Project Name</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                autoComplete="off"
                                autoFocus
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="startDate">Start Date</Label>
                                <DatePicker
                                    id="startDate"
                                    value={startDate}
                                    onChange={setStartDate}
                                />
                            </div>
                            <div className="grid gap-2">
                                <div className="flex justify-between items-center">
                                    <Label htmlFor="endDate">End Date</Label>
                                    <span className="text-[10px] text-muted-foreground">(Optional)</span>
                                </div>
                                <DatePicker
                                    id="endDate"
                                    value={endDate}
                                    onChange={setEndDate}
                                    min={startDate}
                                />
                            </div>
                        </div>
                        {error && (
                            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                                {error}
                            </div>
                        )}
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        {push && (
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => setShowDeleteConfirm(true)}
                                disabled={isPending || isDeleting}
                                className="mr-auto text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" onClick={handleClose}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isPending}>
                                {isPending ? (push ? "Updating..." : "Creating...") : (push ? "Update Project" : "Create Project")}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>

            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Project</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete &quot;{push?.name}&quot;? Tasks will be moved to backlog.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="bg-destructive hover:bg-destructive/90 text-white"
                        >
                            {isDeleting ? "Deleting..." : "Delete Project"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    )
}
