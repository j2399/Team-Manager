"use client"

interface Push {
    id: string
    name: string
    startDate: Date | string
    endDate?: Date | string | null
    project: { name: string }
    tasks?: { id: string; title: string }[]
}

interface GanttChartProps {
    pushes: Push[]
}

export function GanttChart({ pushes }: GanttChartProps) {
    if (!pushes || pushes.length === 0) {
        return (
            <div className="p-4 text-[11px] text-center text-muted-foreground border border-dashed rounded">
                No pushes. Create a push to see timeline.
            </div>
        )
    }

    const dates = pushes.flatMap(s => [
        new Date(s.startDate),
        s.endDate ? new Date(s.endDate) : new Date(new Date(s.startDate).getTime() + 14 * 24 * 60 * 60 * 1000) // Default 2 weeks if no end
    ])
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))

    const startObj = new Date(minDate)
    startObj.setDate(startObj.getDate() - 7)
    const endObj = new Date(maxDate)
    endObj.setDate(endObj.getDate() + 7)

    const startTime = startObj.getTime()
    const endTime = endObj.getTime()
    const totalDuration = endTime - startTime || 1

    const getPosition = (date: Date) => {
        return ((date.getTime() - startTime) / totalDuration) * 100
    }

    const todayPos = getPosition(new Date())

    return (
        <div className="relative w-full py-2">
            {todayPos >= 0 && todayPos <= 100 && (
                <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10"
                    style={{ left: `${todayPos}%` }}
                />
            )}

            <div className="space-y-2">
                {pushes.map((push) => {
                    const pushEnd = push.endDate
                        ? new Date(push.endDate)
                        : new Date(new Date(push.startDate).getTime() + 14 * 24 * 60 * 60 * 1000)

                    const left = getPosition(new Date(push.startDate))
                    const right = getPosition(pushEnd)
                    const width = Math.max(right - left, 2)
                    const taskNames = push.tasks?.slice(0, 3).map(t => t.title).join(', ') || ''

                    return (
                        <div key={push.id} className="relative h-7 flex items-center">
                            <div className="w-20 pr-1 text-[10px] font-bold text-right truncate shrink-0">
                                {push.name}
                            </div>
                            <div className="flex-1 relative h-full">
                                {/* Full-width horizontal baseline */}
                                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-border" />
                                <div
                                    className="absolute h-5 top-1 rounded bg-primary/80 text-[10px] text-primary-foreground flex items-center px-1.5 gap-1"
                                    style={{ left: `${left}%`, width: `${width}%` }}
                                    title={taskNames ? `${push.project.name}: ${taskNames}` : push.project.name}
                                >
                                    <span className="font-medium truncate">{push.project.name}</span>
                                    {taskNames && (
                                        <span className="text-primary-foreground/70 truncate text-[9px]">
                                            {taskNames}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
