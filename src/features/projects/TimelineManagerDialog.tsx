"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
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
import { type PushDraft, startOfDay } from "@/features/timeline-editor/types"
import { createPush, updatePush, deletePush } from "@/app/actions/pushes"
import { Check, Loader2, Sparkles } from "lucide-react"
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

function toDraftPush(push: PushType): PushDraft {
    return {
        tempId: push.id,
        name: push.name,
        startDate: new Date(push.startDate),
        endDate: push.endDate ? new Date(push.endDate) : null,
        color: push.color || "#3b82f6",
        dependsOn: push.dependsOnId || null,
    }
}

function normalizePush(push: PushDraft) {
    return {
        tempId: push.tempId,
        name: push.name,
        startDate: push.startDate.toISOString().split("T")[0],
        endDate: push.endDate ? push.endDate.toISOString().split("T")[0] : null,
        color: push.color,
        dependsOn: push.dependsOn || null,
    }
}

function arePushesEqual(left: PushDraft[], right: PushDraft[]) {
    if (left.length !== right.length) return false
    return JSON.stringify(left.map(normalizePush)) === JSON.stringify(right.map(normalizePush))
}

function remapPushIds(pushes: PushDraft[], idMap: Record<string, string>) {
    return pushes.map((push) => ({
        ...push,
        tempId: idMap[push.tempId] || push.tempId,
        dependsOn: push.dependsOn ? (idMap[push.dependsOn] || push.dependsOn) : null,
    }))
}

export function TimelineManagerDialog({
    projectId,
    open,
    onOpenChange,
    initialPushes
}: TimelineManagerDialogProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [pushes, setPushes] = useState<PushDraft[]>([])
    const [hasChanges, setHasChanges] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isClosing, setIsClosing] = useState(false)
    const initializedRef = useRef(false)
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const savePromiseRef = useRef<Promise<boolean> | null>(null)
    const savedPushesRef = useRef<PushDraft[]>([])
    const latestPushesRef = useRef<PushDraft[]>([])
    const today = useMemo(() => startOfDay(new Date()), [])

    // Sync initial pushes to local state when dialog opens
    useEffect(() => {
        if (!open) {
            initializedRef.current = false
            setIsClosing(false)
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current)
                autosaveTimerRef.current = null
            }
            return
        }

        if (initializedRef.current) return

        const nextPushes = initialPushes.map(toDraftPush)

        setPushes(nextPushes)
        latestPushesRef.current = nextPushes
        savedPushesRef.current = nextPushes
        setHasChanges(false)
        initializedRef.current = true
    }, [open, initialPushes])

    const handlePushesChange = useCallback((newPushes: PushDraft[]) => {
        latestPushesRef.current = newPushes
        setPushes(newPushes)
        setHasChanges(!arePushesEqual(newPushes, savedPushesRef.current))
    }, [])

    const persistPushes = useCallback(async () => {
        if (savePromiseRef.current) {
            return savePromiseRef.current
        }

        const savePromise = (async () => {
            const targetPushes = latestPushesRef.current
            const baselinePushes = savedPushesRef.current

            if (arePushesEqual(targetPushes, baselinePushes)) {
                setHasChanges(false)
                return true
            }

            setIsSaving(true)

            try {
                const baselineMap = new Map(baselinePushes.map((push) => [push.tempId, push]))
                const targetIds = new Set(targetPushes.map((push) => push.tempId))

                const deletedPushIds = baselinePushes
                    .filter((push) => !targetIds.has(push.tempId))
                    .map((push) => push.tempId)

                const updatedPushes = targetPushes.filter((push) => baselineMap.has(push.tempId))
                const newPushes = targetPushes.filter((push) => !baselineMap.has(push.tempId))

                // Map of tempId -> realId for newly created pushes
                const idMap: Record<string, string> = {}

                // Perform deletions first
                for (const id of deletedPushIds) {
                    await deletePush(id, projectId)
                }

                // Perform updates (existing pushes already have real IDs as tempIds).
                for (const p of updatedPushes) {
                    const previousPush = baselineMap.get(p.tempId)
                    if (!previousPush || arePushesEqual([p], [previousPush])) {
                        continue
                    }

                    const result = await updatePush({
                        id: p.tempId,
                        name: p.name,
                        startDate: p.startDate.toISOString().split("T")[0],
                        endDate: p.endDate?.toISOString().split("T")[0] || null,
                        color: p.color,
                        dependsOnId: p.dependsOn || null,
                    })

                    if (result?.error) {
                        throw new Error(result.error)
                    }
                }

                // Perform creations matching tempId to realId for chaining
                // We must do this sequentially to ensure parents exist before children reference them
                // and to build the ID map.
                for (const p of newPushes) {
                    const formData = new FormData()
                    formData.append("name", p.name)
                    formData.append("projectId", projectId)
                    formData.append("startDate", p.startDate.toISOString().split("T")[0])
                    if (p.endDate) formData.append("endDate", p.endDate.toISOString().split("T")[0])
                    if (p.color) formData.append("color", p.color)

                    // Resolve dependency: either a real ID from initialPushes or a newly created one from idMap
                    const resolvedDependsOnId = p.dependsOn ? (idMap[p.dependsOn] || p.dependsOn) : null
                    if (resolvedDependsOnId) formData.append("dependsOnId", resolvedDependsOnId)

                    const result = await createPush(formData)
                    if (!result?.success || !result.push) {
                        throw new Error(result?.error || "Failed to create project")
                    }

                    idMap[p.tempId] = result.push.id
                }

                const canonicalSavedPushes = remapPushIds(targetPushes, idMap)
                const canonicalLatestPushes = remapPushIds(latestPushesRef.current, idMap)

                savedPushesRef.current = canonicalSavedPushes
                latestPushesRef.current = canonicalLatestPushes
                setPushes(canonicalLatestPushes)
                setHasChanges(!arePushesEqual(canonicalLatestPushes, canonicalSavedPushes))

                return true
            } catch (err) {
                console.error("Failed to save timeline:", err)
                toast({
                    title: "Error",
                    description: "Failed to save timeline",
                    variant: "destructive",
                })
                setHasChanges(!arePushesEqual(latestPushesRef.current, savedPushesRef.current))
                return false
            } finally {
                setIsSaving(false)
            }
        })()

        savePromiseRef.current = savePromise

        try {
            return await savePromise
        } finally {
            savePromiseRef.current = null
        }
    }, [projectId, toast])

    useEffect(() => {
        if (!open || !hasChanges || isSaving) return

        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current)
        }

        autosaveTimerRef.current = setTimeout(() => {
            void persistPushes()
        }, 450)

        return () => {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current)
                autosaveTimerRef.current = null
            }
        }
    }, [open, hasChanges, isSaving, persistPushes])

    const handleDone = useCallback(async () => {
        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current)
            autosaveTimerRef.current = null
        }

        setIsClosing(true)
        const savedSuccessfully = await persistPushes()
        if (savedSuccessfully) {
            router.refresh()
            onOpenChange(false)
        }
        setIsClosing(false)
    }, [onOpenChange, persistPushes, router])

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (nextOpen) {
                    onOpenChange(true)
                    return
                }

                void handleDone()
            }}
        >
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
                                size="sm"
                                onClick={() => void handleDone()}
                                disabled={isClosing}
                            >
                                {isSaving || isClosing ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Check className="h-4 w-4 mr-2" />
                                )}
                                Done
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
                            maxInteractiveDate={today}
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
