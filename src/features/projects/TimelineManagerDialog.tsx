"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { TimelineEditor } from "@/features/timeline-editor/TimelineEditor"
import { type PushDraft } from "@/features/timeline-editor/types"
import { createPush, updatePush, deletePush } from "@/app/actions/pushes"
import { Loader2, Save, Sparkles } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

type PushType = {
    id: string
    name: string
    startDate: Date | string
    endDate: Date | string | null
    status: string
    color?: string
    dependsOnId?: string | null
}

interface TimelineManagerDialogProps {
    projectId: string
    open: boolean
    onOpenChange: (open: boolean) => void
    initialPushes: PushType[]
}

export function TimelineManagerDialog({
    projectId,
    open,
    onOpenChange,
    initialPushes
}: TimelineManagerDialogProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()
    const [pushes, setPushes] = useState<PushDraft[]>([])
    const [hasChanges, setHasChanges] = useState(false)

    // Sync initial pushes to local state when dialog opens
    useEffect(() => {
        if (open) {
            setPushes(initialPushes.map(p => ({
                tempId: p.id, // Using real ID as tempId for existing pushes
                name: p.name,
                startDate: new Date(p.startDate),
                endDate: p.endDate ? new Date(p.endDate) : null,
                color: p.color || "#3b82f6",
                dependsOn: p.dependsOnId || null
            })))
            setHasChanges(false)
        }
    }, [open, initialPushes])

    const handlePushesChange = (newPushes: PushDraft[]) => {
        setPushes(newPushes)
        setHasChanges(true)
    }

    const handleSave = () => {
        startTransition(async () => {
            try {
                // In a real implementation, we would diff and batch update.
                // For this MVP, we'll identify new vs updated vs deleted.

                const deletedPushIds = initialPushes
                    .filter(p => !pushes.some(dp => dp.tempId === p.id))
                    .map(p => p.id)

                const updatedPushes = pushes.filter(p => initialPushes.some(ip => ip.id === p.tempId))
                const newPushes = pushes.filter(p => !initialPushes.some(ip => ip.id === p.tempId))

                // Map of tempId -> realId for newly created pushes
                const idMap: Record<string, string> = {}

                // Perform deletions first
                for (const id of deletedPushIds) {
                    await deletePush(id, projectId)
                }

                // Perform updates (existing pushes already have real IDs as tempIds)
                for (const p of updatedPushes) {
                    await updatePush({
                        id: p.tempId,
                        name: p.name,
                        startDate: p.startDate.toISOString().split('T')[0],
                        endDate: p.endDate?.toISOString().split('T')[0] || null,
                        color: p.color,
                        dependsOnId: p.dependsOn || null
                    })
                }

                // Perform creations matching tempId to realId for chaining
                // We must do this sequentially to ensure parents exist before children reference them
                // and to build the ID map.
                for (const p of newPushes) {
                    const formData = new FormData()
                    formData.append('name', p.name)
                    formData.append('projectId', projectId)
                    formData.append('startDate', p.startDate.toISOString().split('T')[0])
                    if (p.endDate) formData.append('endDate', p.endDate.toISOString().split('T')[0])
                    if (p.color) formData.append('color', p.color)

                    // Resolve dependency: either a real ID from initialPushes or a newly created one from idMap
                    const resolvedDependsOnId = p.dependsOn ? (idMap[p.dependsOn] || p.dependsOn) : null
                    if (resolvedDependsOnId) formData.append('dependsOnId', resolvedDependsOnId)

                    const result = await createPush(formData)
                    if (result.success && result.push) {
                        idMap[p.tempId] = result.push.id
                    }
                }

                toast({
                    title: "Success",
                    description: "Timeline saved successfully",
                })
                router.refresh()
                onOpenChange(false)
            } catch (err) {
                console.error("Failed to save timeline:", err)
                toast({
                    title: "Error",
                    description: "Failed to save timeline",
                    variant: "destructive",
                })
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent showCloseButton={false} className="sm:max-w-3xl h-[85vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-6 pb-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <DialogTitle className="text-sm font-normal text-muted-foreground">
                                Drag to create projects. Click to edit. Hover for + to chain.
                            </DialogTitle>
                        </div>
                        <DialogDescription className="sr-only">Visual editor for managing project timelines.</DialogDescription>
                        <div className="flex items-center gap-2 pr-8">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onOpenChange(false)}
                                disabled={isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleSave}
                                disabled={!hasChanges || isPending}
                            >
                                {isPending ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Save className="h-4 w-4 mr-2" />
                                )}
                                Save Changes
                            </Button>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-auto p-6 pt-0">
                    <div className="space-y-4">

                        <TimelineEditor
                            pushes={pushes}
                            onPushesChange={handlePushesChange}
                            minHeight={400}
                        />

                        {pushes.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                                {pushes.length} project{pushes.length !== 1 ? 's' : ''} planned
                            </p>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
