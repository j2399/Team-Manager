"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

type Task = {
    id: string
    title: string
    startDate: Date | string | null
    endDate: Date | string | null
    column?: { name: string } | null
    project?: { id: string; name: string } | null
}

type MiniGanttChartProps = {
    tasks: Task[]
}

export function MiniGanttChart({ tasks }: MiniGanttChartProps) {
    const [todayPos, setTodayPos] = useState<number | null>(null)
    
    const tasksWithDates = tasks.filter(t => t.startDate && t.endDate)
    
    if (tasksWithDates.length === 0) {
        return (
            <div className="p-4 text-xs text-center text-muted-foreground">
                No tasks with dates
            </div>
        )
    }

    const dates = tasksWithDates.flatMap(t => [new Date(t.startDate!), new Date(t.endDate!)])
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))

    // Extend range
    const startObj = new Date(minDate)
    startObj.setDate(startObj.getDate() - 2)
    const endObj = new Date(maxDate)
    endObj.setDate(endObj.getDate() + 2)

    const startTime = startObj.getTime()
    const endTime = endObj.getTime()
    const totalDuration = endTime - startTime || 1

    const getPosition = (date: Date) => {
        return ((date.getTime() - startTime) / totalDuration) * 100
    }

    // Calculate today position only on client to avoid hydration mismatch
    useEffect(() => {
        setTodayPos(getPosition(new Date()))
    }, [startTime, totalDuration])

    const getStatusColor = (status: string | undefined) => {
        switch (status) {
            case 'Done': return 'bg-green-500'
            case 'Review': return 'bg-orange-500'
            case 'In Progress': return 'bg-blue-500'
            default: return 'bg-slate-400'
        }
    }

    // Group by project
    const byProject = tasksWithDates.reduce((acc, task) => {
        const projectId = task.project?.id || 'unknown'
        if (!acc[projectId]) {
            acc[projectId] = { name: task.project?.name || 'Unknown', tasks: [] }
        }
        acc[projectId].tasks.push(task)
        return acc
    }, {} as Record<string, { name: string; tasks: Task[] }>)

    return (
        <div className="relative w-full">
            <div className="space-y-0.5">
                {Object.entries(byProject).map(([projectId, { name, tasks: projectTasks }]) => (
                    <div key={projectId}>
                        {/* Division header */}
                        <div className="flex items-center h-5 bg-muted/50">
                            <div className="w-20 shrink-0 px-1">
                                <span className="text-[9px] font-semibold truncate">{name}</span>
                            </div>
                            <div className="flex-1" />
                        </div>
                        {/* Tasks */}
                        {projectTasks.slice(0, 5).map((task) => {
                            const left = getPosition(new Date(task.startDate!))
                            const right = getPosition(new Date(task.endDate!))
                            const width = Math.max(right - left, 2)
                            const status = task.column?.name

                            return (
                                <Link
                                    key={task.id}
                                    href={`/dashboard/projects/${task.project?.id}?view=gantt`}
                                    className="flex items-center h-5 hover:bg-muted/30 relative"
                                >
                                    <div className="w-20 shrink-0 px-1 flex items-center gap-1">
                                        <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(status)}`} />
                                        <span className="text-[9px] truncate">{task.title}</span>
                                    </div>
                                    <div className="flex-1 relative h-full">
                                        {/* Today indicator for this row */}
                                        {todayPos !== null && todayPos >= 0 && todayPos <= 100 && (
                                            <div
                                                className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10 pointer-events-none"
                                                style={{ left: `${todayPos}%` }}
                                            />
                                        )}
                                        <div
                                            className={`absolute h-3 top-1 rounded-sm ${getStatusColor(status)}`}
                                            style={{ left: `${left}%`, width: `${width}%`, minWidth: '4px' }}
                                        />
                                    </div>
                                </Link>
                            )
                        })}
                    </div>
                ))}
            </div>
        </div>
    )
}
