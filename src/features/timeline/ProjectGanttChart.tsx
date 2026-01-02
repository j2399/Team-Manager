"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CheckCircle2 } from "lucide-react"

type Task = {
    id: string
    title: string
    startDate: Date | string | null
    endDate: Date | string | null
    updatedAt?: Date | string | null
    column?: { name: string } | null
    assignee?: { name: string } | null
    push?: { id: string; name: string; color: string; status: string } | null
}

type PushType = {
    id: string
    name: string
    startDate: Date | string
    endDate: Date | string | null
    status: string
    color: string
    projectId: string
    taskCount: number
    completedCount: number
}

type ProjectGanttChartProps = {
    tasks: Task[]
    projectId: string
    pushes?: PushType[]
}

const formatDateShort = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const formatTimeAgo = (date: Date | string) => {
    const diff = new Date().getTime() - new Date(date).getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'Just now'
}

const getDayName = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0)
}

const getDayNumber = (date: Date) => {
    return date.getDate()
}

const getTaskDuration = (start: Date | string, end: Date | string) => {
    const days = Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24))
    return days
}

export function ProjectGanttChart({ tasks, projectId, pushes = [] }: ProjectGanttChartProps) {
    const tasksWithDates = tasks.filter(t => t.startDate).map(t => {
        const start = new Date(t.startDate!)
        // Default to 1 day if no end date
        const end = t.endDate ? new Date(t.endDate) : new Date(start.getTime() + 24 * 60 * 60 * 1000)
        return { ...t, startDate: start, endDate: end }
    })

    if (tasksWithDates.length === 0) {
        return (
            <div className="p-8 text-sm text-center text-muted-foreground border border-dashed rounded-lg">
                <p className="font-medium mb-1">No tasks with dates</p>
                <p className="text-xs">Add start and end dates to tasks to see the Gantt chart.</p>
            </div>
        )
    }

    const dates = tasksWithDates.flatMap(t => [new Date(t.startDate!), new Date(t.endDate!)])
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))

    // Extend range to show full weeks
    const startObj = new Date(minDate)
    startObj.setDate(startObj.getDate() - startObj.getDay()) // Start from Sunday
    const endObj = new Date(maxDate)
    endObj.setDate(endObj.getDate() + (6 - endObj.getDay()) + 7) // End on Saturday + buffer

    const startTime = startObj.getTime()
    const endTime = endObj.getTime()
    const totalDuration = endTime - startTime || 1
    const totalDays = Math.ceil(totalDuration / (1000 * 60 * 60 * 24))

    const getPosition = (date: Date) => {
        return ((date.getTime() - startTime) / totalDuration) * 100
    }

    const todayPos = getPosition(new Date())
    const today = new Date()

    // Generate day columns
    const dayColumns: { date: Date; pos: number; width: number; isWeekend: boolean; isToday: boolean }[] = []
    const currentDate = new Date(startObj)
    const dayWidth = 100 / totalDays

    while (currentDate <= endObj) {
        const pos = getPosition(currentDate)
        const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6
        const isToday = currentDate.toDateString() === today.toDateString()
        dayColumns.push({
            date: new Date(currentDate),
            pos,
            width: dayWidth,
            isWeekend,
            isToday
        })
        currentDate.setDate(currentDate.getDate() + 1)
    }

    // Generate month headers instead of week headers
    const monthHeaders: { month: string; pos: number; width: number }[] = []
    let currentMonth = new Date(startObj)
    currentMonth.setDate(1)
    while (currentMonth <= endObj) {
        const monthStart = new Date(Math.max(currentMonth.getTime(), startObj.getTime()))
        const nextMonth = new Date(currentMonth)
        nextMonth.setMonth(nextMonth.getMonth() + 1)
        const monthEnd = new Date(Math.min(nextMonth.getTime() - 1, endObj.getTime()))
        const pos = getPosition(monthStart)
        const endPos = getPosition(monthEnd)
        monthHeaders.push({
            month: currentMonth.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
            pos,
            width: endPos - pos
        })
        currentMonth = nextMonth
    }



    // Stats
    const totalTasks = tasksWithDates.length
    const doneTasks = tasksWithDates.filter(t => t.column?.name === 'Done').length
    const inProgressTasks = tasksWithDates.filter(t => t.column?.name === 'In Progress').length

    return (
        <div className="h-full flex flex-col">
            {/* Header with Legend and Stats */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 text-xs overflow-x-auto max-w-[600px] scrollbar-hide py-1">

                        {/* Push Legends */}
                        {pushes.map(push => (
                            <div key={push.id} className="flex items-center gap-1 shrink-0">
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: push.color }}
                                />
                                <span>{push.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                        {doneTasks}/{totalTasks} Complete
                    </Badge>
                </div>
            </div>

            {/* Main Chart Area */}
            <div className="flex-1 min-h-0 flex flex-col">
                {/* Timeline Header */}
                <div className="flex shrink-0 border-b">
                    {/* Task column header */}
                    <div className="w-48 shrink-0 border-r bg-muted/30 px-2 py-1">
                        <span className="text-xs font-medium text-muted-foreground">Task</span>
                    </div>
                    {/* Timeline header */}
                    <div className="flex-1 relative">
                        {/* Month row */}
                        <div className="h-5 relative border-b">
                            {monthHeaders.map((month, i) => (
                                <div
                                    key={i}
                                    className="absolute top-0 h-full flex items-center justify-center text-[10px] font-medium border-r bg-muted/20"
                                    style={{ left: `${month.pos}%`, width: `${month.width}%` }}
                                >
                                    {month.month}
                                </div>
                            ))}
                        </div>
                        {/* Day row */}
                        <div className="h-8 relative">
                            {dayColumns.map((day, i) => (
                                <div
                                    key={i}
                                    className={`absolute top-0 h-full flex flex-col items-center justify-center border-r ${day.isToday ? 'bg-blue-100 dark:bg-blue-900/30' : day.isWeekend ? 'bg-muted/40' : 'bg-background'
                                        }`}
                                    style={{ left: `${day.pos}%`, width: `${day.width}%` }}
                                >
                                    <span className={`text-[8px] ${day.isToday ? 'text-blue-600 font-bold' : 'text-muted-foreground'}`}>
                                        {getDayName(day.date)}
                                    </span>
                                    <span className={`text-[9px] ${day.isToday ? 'text-blue-600 font-bold' : ''}`}>
                                        {getDayNumber(day.date)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Task Rows */}
                <ScrollArea className="flex-1">
                    <div className="relative">
                        {tasksWithDates.map((task, index) => {
                            const left = getPosition(new Date(task.startDate!))
                            const right = getPosition(new Date(task.endDate!))
                            const width = Math.max(right - left, 1)
                            const status = task.column?.name
                            const duration = getTaskDuration(task.startDate!, task.endDate!)
                            const startStr = formatDateShort(new Date(task.startDate!))
                            const endStr = formatDateShort(new Date(task.endDate!))
                            const lastUpdated = task.updatedAt ? formatTimeAgo(task.updatedAt) : null

                            return (
                                <div key={task.id} className={`flex h-10 border-b ${index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                                    {/* Task name column */}
                                    <div className="w-48 shrink-0 border-r px-2 flex items-center gap-2">
                                        <div
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ backgroundColor: task.push?.color || '#94a3b8' }}
                                        />
                                        <Link
                                            href={`/dashboard/projects/${projectId}?task=${task.id}`}
                                            className="text-xs truncate hover:text-primary transition-colors"
                                            title={task.title}
                                        >
                                            {task.title}
                                        </Link>
                                    </div>

                                    {/* Bar area */}
                                    <div className="flex-1 relative">
                                        {/* Day grid background */}
                                        {dayColumns.map((day, i) => (
                                            <div
                                                key={i}
                                                className={`absolute top-0 h-full border-r ${day.isToday ? 'bg-blue-50' : day.isWeekend ? 'bg-muted/30' : ''
                                                    }`}
                                                style={{ left: `${day.pos}%`, width: `${day.width}%` }}
                                            />
                                        ))}
                                        {/* Task bar */}
                                        <Link
                                            href={`/dashboard/projects/${projectId}?task=${task.id}`}
                                            className="absolute h-6 top-2 rounded text-white flex items-center justify-center px-1.5 transition-all shadow-sm hover:shadow cursor-pointer z-10 overflow-hidden hover:opacity-90"
                                            style={{
                                                left: `${left}%`,
                                                width: `${width}%`,
                                                minWidth: '24px',
                                                backgroundColor: task.push?.color || '#94a3b8'
                                            }}
                                            title={`${task.title}\nPush: ${task.push?.name || 'Backlog'}\n${startStr} - ${endStr} (${duration}d)${lastUpdated ? `\nUpdated: ${lastUpdated}` : ''}`}

                                        >
                                            {status === 'Done' && (
                                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-green-500 fill-white" />
                                            )}
                                        </Link>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </ScrollArea>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs text-muted-foreground shrink-0">
                <span>Range: {formatDateShort(minDate)} - {formatDateShort(maxDate)}</span>
                <span>{totalTasks} tasks • {totalDays} days</span>
            </div>
        </div>
    )
}
