"use client"

import { useState, useMemo, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ChevronDown, ChevronUp, Calendar } from "lucide-react"
import { TimelineEditor, type PushDraft, generateTempId, addDays, startOfDay, formatDateShort } from "@/features/timeline-editor"
import { updatePush } from "@/app/actions/pushes"

type Push = {
    id: string
    name: string
    startDate: Date | string
    endDate: Date | string | null
    status: string
    color: string
    dependsOnId?: string | null
}

type CondensedTimelineProps = {
    pushes: Push[]
    projectId: string
    onPushUpdate?: () => void
}

export function CondensedTimeline({ pushes, projectId, onPushUpdate }: CondensedTimelineProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    // Convert pushes to PushDraft format for the editor
    const pushDrafts = useMemo<PushDraft[]>(() => {
        return pushes.map(p => ({
            tempId: p.id, // Use real ID as tempId for existing pushes
            name: p.name,
            startDate: new Date(p.startDate),
            endDate: p.endDate ? new Date(p.endDate) : null,
            color: p.color,
            dependsOn: p.dependsOnId || null
        }))
    }, [pushes])

    // Calculate view range based on pushes
    const viewRange = useMemo(() => {
        if (pushes.length === 0) {
            const today = startOfDay(new Date())
            return { start: addDays(today, -7), end: addDays(today, 28) }
        }

        const dates = pushes.flatMap(p => {
            const start = new Date(p.startDate)
            const end = p.endDate ? new Date(p.endDate) : addDays(start, 14)
            return [start, end]
        })

        const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))

        return {
            start: addDays(minDate, -7),
            end: addDays(maxDate, 14)
        }
    }, [pushes])

    const totalDuration = viewRange.end.getTime() - viewRange.start.getTime()

    const getPositionPercent = useCallback((date: Date) => {
        return ((date.getTime() - viewRange.start.getTime()) / totalDuration) * 100
    }, [viewRange, totalDuration])

    // Handle push updates from the expanded editor
    const handlePushesChange = useCallback(async (updatedPushes: PushDraft[]) => {
        // Find which pushes were modified
        for (const updated of updatedPushes) {
            const original = pushes.find(p => p.id === updated.tempId)
            if (original) {
                const originalStart = new Date(original.startDate).getTime()
                const originalEnd = original.endDate ? new Date(original.endDate).getTime() : null
                const updatedStart = updated.startDate.getTime()
                const updatedEnd = updated.endDate?.getTime() || null

                // Check if dates changed
                if (originalStart !== updatedStart || originalEnd !== updatedEnd || original.name !== updated.name) {
                    await updatePush({
                        id: updated.tempId,
                        name: updated.name,
                        startDate: updated.startDate.toISOString().split('T')[0],
                        endDate: updated.endDate ? updated.endDate.toISOString().split('T')[0] : undefined
                    })
                }
            }
        }
        onPushUpdate?.()
    }, [pushes, onPushUpdate])

    const today = new Date()
    const todayPos = getPositionPercent(today)
    const showTodayLine = todayPos >= 0 && todayPos <= 100

    if (pushes.length === 0) {
        return null // Don't show if no pushes
    }

    return (
        <TooltipProvider delayDuration={100}>
            <div className="w-full">
                {/* Condensed view */}
                <div
                    className={cn(
                        "relative overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
                        isExpanded ? "h-0 opacity-0" : "h-12 opacity-100"
                    )}
                >
                    <button
                        type="button"
                        onClick={() => setIsExpanded(true)}
                        className="w-full h-full flex items-center gap-3 px-3 py-2 rounded-lg border bg-card hover:bg-accent/50 transition-colors group"
                    >
                        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />

                        {/* Mini timeline */}
                        <div className="flex-1 relative h-6 bg-muted/30 rounded overflow-hidden">
                            {/* Push bars */}
                            {pushDrafts.map(push => {
                                const pushEnd = push.endDate || addDays(push.startDate, 14)
                                const left = getPositionPercent(push.startDate)
                                const width = getPositionPercent(pushEnd) - left

                                return (
                                    <Tooltip key={push.tempId}>
                                        <TooltipTrigger asChild>
                                            <div
                                                className="absolute top-1 bottom-1 rounded-sm transition-all group-hover:brightness-110"
                                                style={{
                                                    left: `${Math.max(0, left)}%`,
                                                    width: `${Math.min(100 - Math.max(0, left), width)}%`,
                                                    background: `linear-gradient(90deg, ${push.color}dd, ${push.color}99)`
                                                }}
                                            />
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="text-xs">
                                            <div className="font-medium">{push.name}</div>
                                            <div className="text-muted-foreground">
                                                {formatDateShort(push.startDate)} - {formatDateShort(pushEnd)}
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                )
                            })}

                            {/* Today indicator */}
                            {showTodayLine && (
                                <div
                                    className="absolute top-0 bottom-0 w-0.5 bg-red-500"
                                    style={{ left: `${todayPos}%` }}
                                />
                            )}
                        </div>

                        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                            <span>{pushes.length} push{pushes.length !== 1 ? 'es' : ''}</span>
                            <ChevronDown className="h-3 w-3" />
                        </div>
                    </button>
                </div>

                {/* Expanded view */}
                <div
                    className={cn(
                        "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden",
                        isExpanded ? "opacity-100" : "h-0 opacity-0"
                    )}
                    style={{ maxHeight: isExpanded ? '400px' : '0px' }}
                >
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                Push Timeline
                            </h3>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsExpanded(false)}
                                className="h-7"
                            >
                                <ChevronUp className="h-4 w-4 mr-1" />
                                Collapse
                            </Button>
                        </div>

                        <TimelineEditor
                            pushes={pushDrafts}
                            onPushesChange={handlePushesChange}
                            viewRange={viewRange}
                            readOnly={false}
                            minHeight={200}
                        />

                        <p className="text-xs text-muted-foreground">
                            Click to edit • Hover for + to chain pushes
                        </p>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    )
}
