"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Calendar } from "lucide-react"

type Task = {
    id: string
    title: string
    startDate: Date | string | null
    endDate: Date | string | null
    column?: { name: string } | null
    project?: { id: string; name: string } | null
    push?: { id: string; name: string; color: string } | null
}

type ProjectTimelineProps = {
    tasks: Task[]
}

export function ProjectTimeline({ tasks }: ProjectTimelineProps) {
    const [todayPos, setTodayPos] = useState<number | null>(null)

    // Filter valid tasks and group by division
    const tasksWithDates = tasks.filter(t => t.startDate && t.endDate)

    const byProject = tasksWithDates.reduce((acc, task) => {
        const projectId = task.project?.id || 'unknown'
        if (!acc[projectId]) {
            acc[projectId] = {
                name: task.project?.name || 'Unknown Division',
                id: projectId,
                tasks: []
            }
        }
        acc[projectId].tasks.push(task)
        return acc
    }, {} as Record<string, { name: string; id: string; tasks: Task[] }>)

    if (Object.keys(byProject).length === 0) {
        return (
            <div className="p-4 text-xs text-center text-muted-foreground italic">
                No timeline data available
            </div>
        )
    }

    // Determine global date range for the chart
    const dates = tasksWithDates.flatMap(t => [new Date(t.startDate!), new Date(t.endDate!)])
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))

    // Add padding to range
    const startObj = new Date(minDate)
    startObj.setDate(startObj.getDate() - 3)
    const endObj = new Date(maxDate)
    endObj.setDate(endObj.getDate() + 3)

    const startTime = startObj.getTime()
    const endTime = endObj.getTime()
    const totalDuration = endTime - startTime || 1

    const getPosition = (date: Date) => {
        return ((date.getTime() - startTime) / totalDuration) * 100
    }

    useEffect(() => {
        setTodayPos(getPosition(new Date()))
    }, [])

    return (
        <div className="w-full space-y-4">
            <h4 className="text-[10px] uppercase text-muted-foreground font-semibold flex items-center gap-1">
                Timeline
            </h4>

            <div className="space-y-4">
                {Object.values(byProject).map(project => (
                    project.id !== 'unknown' ? (
                        <Link
                            key={project.id}
                            href={`/dashboard/projects/${project.id}?view=gantt`}
                            className="block"
                        >
                            <div className="border rounded-md bg-card overflow-hidden hover:bg-muted/30 transition-colors">
                                <div className="bg-muted/30 px-3 py-1.5 border-b flex justify-between items-center">
                                    <span className="text-[10px] font-semibold">{project.name}</span>
                                    <Calendar className="h-3 w-3 text-muted-foreground" />
                                </div>
                                <div className="p-2 relative bg-muted/10">
                                    {/* Today Marker */}
                                    {todayPos !== null && todayPos >= 0 && todayPos <= 100 && (
                                        <div
                                            className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none opacity-50 dashed-line"
                                            style={{ left: `${todayPos}%` }}
                                        >
                                            <div className="w-1.5 h-1.5 bg-red-400 rounded-full -ml-[2px] -mt-[3px]" />
                                        </div>
                                    )}

                                    <div className="space-y-1">
                                        {project.tasks.slice(0, 8).map(task => { // Limit to 8 tasks per division to save space
                                            const left = getPosition(new Date(task.startDate!))
                                            const right = getPosition(new Date(task.endDate!))
                                            const width = Math.max(right - left, 2) // Minimum width

                                            // Color by push or default blue
                                            const barColor = task.push?.color || '#3b82f6' // Default blue-500 hex

                                            return (
                                                <div key={task.id} className="relative h-4 flex items-center">
                                                    {/* Bar */}
                                                    <div
                                                        className="absolute h-2 rounded-full opacity-80 hover:opacity-100 transition-opacity shadow-sm"
                                                        style={{
                                                            left: `${left}%`,
                                                            width: `${width}%`,
                                                            backgroundColor: barColor
                                                        }}
                                                        title={`${task.title} (${task.push?.name || 'No Division'})`}
                                                    />
                                                    {/* Label */}
                                                    <span
                                                        className="absolute text-[8px] text-muted-foreground truncate w-24 pl-1"
                                                        style={{ left: `${left + width}%` }}
                                                    >
                                                        {task.title}
                                                    </span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ) : (
                        <div key={project.id} className="border rounded-md bg-card overflow-hidden">
                            <div className="bg-muted/30 px-3 py-1.5 border-b flex justify-between items-center">
                                <span className="text-[10px] font-semibold">{project.name}</span>
                            </div>
                            <div className="p-2 relative bg-muted/10">
                                {todayPos !== null && todayPos >= 0 && todayPos <= 100 && (
                                    <div
                                        className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none opacity-50 dashed-line"
                                        style={{ left: `${todayPos}%` }}
                                    >
                                        <div className="w-1.5 h-1.5 bg-red-400 rounded-full -ml-[2px] -mt-[3px]" />
                                    </div>
                                )}
                                <div className="space-y-1">
                                    {project.tasks.slice(0, 8).map(task => {
                                        const left = getPosition(new Date(task.startDate!))
                                        const right = getPosition(new Date(task.endDate!))
                                        const width = Math.max(right - left, 2)
                                        const barColor = task.push?.color || '#3b82f6'

                                        return (
                                            <div key={task.id} className="relative h-4 flex items-center">
                                                <div
                                                    className="absolute h-2 rounded-full opacity-80 shadow-sm"
                                                    style={{
                                                        left: `${left}%`,
                                                        width: `${width}%`,
                                                        backgroundColor: barColor
                                                    }}
                                                    title={`${task.title} (${task.push?.name || 'No Division'})`}
                                                />
                                                <span
                                                    className="absolute text-[8px] text-muted-foreground truncate w-24 pl-1"
                                                    style={{ left: `${left + width}%` }}
                                                >
                                                    {task.title}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    )
                ))}
            </div>
        </div>
    )
}
