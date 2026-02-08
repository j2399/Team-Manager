"use client"

import Link from "next/link"

type Task = {
    id: string
    title: string
    startDate: Date | string | null
    endDate: Date | string | null
    column: {
        board: {
            project: {
                id: string
                name: string
            }
        }
    } | null
}

type TaskTimelineProps = {
    tasks: Task[]
}

export function TaskTimeline({ tasks }: TaskTimelineProps) {
    if (!tasks || tasks.length === 0) {
        return (
            <div className="p-4 text-sm text-center text-muted-foreground border border-dashed rounded">
                No tasks with dates. Add start and end dates to tasks to see them here.
            </div>
        )
    }

    const dates = tasks
        .filter(t => t.startDate && t.endDate)
        .flatMap(t => [new Date(t.startDate!), new Date(t.endDate!)])
    
    if (dates.length === 0) return null

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

    const tasksWithDates = tasks.filter(t => t.startDate && t.endDate)

    return (
        <div className="relative w-full py-2">
            {todayPos >= 0 && todayPos <= 100 && (
                <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10"
                    style={{ left: `${todayPos}%` }}
                />
            )}

            <div className="space-y-2">
                {tasksWithDates.map((task) => {
                    const left = getPosition(new Date(task.startDate!))
                    const right = getPosition(new Date(task.endDate!))
                    const width = Math.max(right - left, 2)
                    const divisionName = task.column?.board?.project?.name || 'Unknown Division'

                    return (
                        <Link
                            key={task.id}
                            href={`/dashboard/projects/${task.column?.board?.project?.id}?task=${task.id}`}
                            className="relative h-7 flex items-center group"
                        >
                            <div className="w-20 pr-1 text-xs font-medium text-right truncate shrink-0">
                                {task.title.length > 12 ? task.title.substring(0, 12) + '...' : task.title}
                            </div>
                            <div className="flex-1 relative h-full">
                                <div
                                    className="absolute h-5 top-1 rounded bg-primary/80 text-xs text-primary-foreground flex items-center px-1.5 gap-1 group-hover:bg-primary transition-colors"
                                    style={{ left: `${left}%`, width: `${width}%` }}
                                    title={`${divisionName}: ${task.title}`}
                                >
                                    <span className="font-medium truncate text-xs">{divisionName}</span>
                                    <span className="text-primary-foreground/70 truncate text-[10px]">
                                        {task.title}
                                    </span>
                                </div>
                            </div>
                        </Link>
                    )
                })}
            </div>
        </div>
    )
}



