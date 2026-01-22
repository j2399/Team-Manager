"use client"

import { useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { CheckCircle2 } from "lucide-react"
import { getInitials } from "@/lib/utils"

type Task = {
    id: string
    title: string
    startDate: Date | string | null
    endDate: Date | string | null
    updatedAt?: Date | string | null
    column?: { name: string } | null
    assignee?: { id?: string; name: string } | null
    assignees?: { user: { id: string; name: string } }[]
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

const formatDateFull = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function ProjectGanttChart({ tasks, projectId, pushes = [] }: ProjectGanttChartProps) {
    const [hoveredTask, setHoveredTask] = useState<string | null>(null)

    const tasksWithDates = tasks.filter(t => t.startDate).map(t => {
        const start = new Date(t.startDate!)
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

    // Group tasks by push
    const tasksByPush = new Map<string, typeof tasksWithDates>()
    const backlogTasks: typeof tasksWithDates = []

    tasksWithDates.forEach(task => {
        if (task.push?.id) {
            const existing = tasksByPush.get(task.push.id) || []
            existing.push(task)
            tasksByPush.set(task.push.id, existing)
        } else {
            backlogTasks.push(task)
        }
    })

    // Order pushes and include backlog at the end
    const orderedGroups: { id: string; name: string; color: string; tasks: typeof tasksWithDates }[] = []

    pushes.forEach(push => {
        const pushTasks = tasksByPush.get(push.id)
        if (pushTasks && pushTasks.length > 0) {
            orderedGroups.push({
                id: push.id,
                name: push.name,
                color: push.color,
                tasks: pushTasks
            })
        }
    })

    if (backlogTasks.length > 0) {
        orderedGroups.push({
            id: 'backlog',
            name: 'Backlog',
            color: '#94a3b8',
            tasks: backlogTasks
        })
    }

    const dates = tasksWithDates.flatMap(t => [new Date(t.startDate!), new Date(t.endDate!)])
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))

    // Extend range with padding
    const startObj = new Date(minDate)
    startObj.setDate(startObj.getDate() - 3)
    const endObj = new Date(maxDate)
    endObj.setDate(endObj.getDate() + 7)

    const startTime = startObj.getTime()
    const endTime = endObj.getTime()
    const totalDuration = endTime - startTime || 1

    const getPosition = (date: Date) => {
        return ((date.getTime() - startTime) / totalDuration) * 100
    }

    const today = new Date()
    const todayPos = getPosition(today)

    // Generate week markers
    const weekMarkers: { date: Date; pos: number }[] = []
    const currentDate = new Date(startObj)
    while (currentDate.getDay() !== 1) {
        currentDate.setDate(currentDate.getDate() + 1)
    }
    while (currentDate <= endObj) {
        weekMarkers.push({
            date: new Date(currentDate),
            pos: getPosition(currentDate)
        })
        currentDate.setDate(currentDate.getDate() + 7)
    }

    // Generate month headers
    const monthHeaders: { month: string; year: string; pos: number; width: number; showYear: boolean }[] = []
    let currentMonth = new Date(startObj)
    currentMonth.setDate(1)
    let lastYear = -1
    while (currentMonth <= endObj) {
        const monthStart = new Date(Math.max(currentMonth.getTime(), startObj.getTime()))
        const nextMonth = new Date(currentMonth)
        nextMonth.setMonth(nextMonth.getMonth() + 1)
        const monthEnd = new Date(Math.min(nextMonth.getTime() - 1, endObj.getTime()))
        const pos = getPosition(monthStart)
        const endPos = getPosition(monthEnd)
        const year = currentMonth.getFullYear()
        const showYear = year !== lastYear
        lastYear = year
        monthHeaders.push({
            month: currentMonth.toLocaleDateString('en-US', { month: 'short' }),
            year: `'${String(year).slice(-2)}`,
            pos,
            width: endPos - pos,
            showYear
        })
        currentMonth = nextMonth
    }

    // Stats
    const totalTasks = tasksWithDates.length
    const doneTasks = tasksWithDates.filter(t => t.column?.name === 'Done').length

    const getTaskDuration = (start: Date, end: Date) => {
        return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    }

    const ROW_HEIGHT = 36

    // Calculate max push name length for consistent column width
    const maxPushNameLength = Math.max(...orderedGroups.map(g => g.name.length), 6)
    const pushColumnWidth = Math.min(Math.max(maxPushNameLength * 7 + 24, 80), 160)

    return (
        <TooltipProvider delayDuration={100}>
            <div className="h-full flex flex-col">


                {/* Main Chart Area */}
                <div className="flex-1 min-h-0 flex flex-col overflow-x-auto custom-scrollbar">
                    <div className="min-w-max flex-1 flex flex-col">
                        {/* Timeline Header */}
                        <div className="flex shrink-0 border-b">
                            <div className="sticky left-0 z-30 shrink-0 border-r bg-background px-2 py-2" style={{ width: `${pushColumnWidth}px` }}>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Push</span>
                            </div>
                            <div className="sticky z-30 shrink-0 border-r bg-background px-2 py-2" style={{ width: '160px', left: `${pushColumnWidth}px` }}>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Task</span>
                            </div>
                            <div className="flex-1 relative h-10 overflow-hidden">
                                {/* Month labels */}
                                {monthHeaders.map((month, i) => (
                                    <div
                                        key={i}
                                        className="absolute top-0 h-5 flex items-center gap-1 px-2 text-[10px] font-medium text-muted-foreground border-b border-r border-border/50 bg-muted/20 overflow-hidden"
                                        style={{ left: `${month.pos}%`, width: `${month.width}%` }}
                                    >
                                        <span className="truncate">{month.month}</span>
                                        {month.showYear && <span className="text-muted-foreground/50 shrink-0">{month.year}</span>}
                                    </div>
                                ))}
                                {/* Week markers */}
                                <div className="absolute top-5 left-0 right-0 h-5">
                                    {weekMarkers.map((marker, i) => (
                                        <div
                                            key={i}
                                            className="absolute top-0 h-full flex items-center text-[9px] text-muted-foreground/70"
                                            style={{ left: `${marker.pos}%` }}
                                        >
                                            <div className="absolute inset-y-0 left-0 w-px bg-border/40" />
                                            <span className="pl-1">{marker.date.getDate()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Task Rows grouped by Push */}
                        <div className="flex-1 relative">
                            {/* Today line overlay - rendered on top of everything */}
                            {todayPos >= 0 && todayPos <= 100 && (
                                <div
                                    className="absolute top-0 w-0.5 bg-foreground pointer-events-none"
                                    style={{
                                        left: `calc(${pushColumnWidth + 160}px + (100% - ${pushColumnWidth + 160}px) * ${todayPos / 100})`,
                                        height: `${orderedGroups.reduce((acc, g) => acc + g.tasks.length * ROW_HEIGHT, 0)}px`,
                                        zIndex: 9999
                                    }}
                                />
                            )}
                            <div className="relative">
                                {orderedGroups.map((group, groupIndex) => {
                                    const groupHeight = group.tasks.length * ROW_HEIGHT
                                    const globalStartIndex = orderedGroups.slice(0, groupIndex).reduce((acc, g) => acc + g.tasks.length, 0)

                                    return (
                                        <div key={group.id} className="flex border-b">
                                            {/* Push name column - spans entire group */}
                                            <div
                                                className="sticky left-0 z-20 shrink-0 border-r bg-background px-2 flex flex-col items-center justify-center text-center relative"
                                                style={{ width: `${pushColumnWidth}px`, height: `${groupHeight}px` }}
                                            >
                                                {/* Task separators in push column to match task rows */}
                                                {group.tasks.map((_, i) => (
                                                    i < group.tasks.length - 1 && (
                                                        <div
                                                            key={`sep-${i}`}
                                                            className="absolute left-0 right-0 h-px bg-border/50"
                                                            style={{ top: `${(i + 1) * ROW_HEIGHT}px` }}
                                                        />
                                                    )
                                                ))}
                                                {/* Task baselines in push column to match task rows */}
                                                {group.tasks.map((_, i) => (
                                                    <div
                                                        key={`base-${i}`}
                                                        className="absolute left-0 right-0 h-px bg-border/10"
                                                        style={{ top: `${(i + 0.5) * ROW_HEIGHT}px` }}
                                                    />
                                                ))}
                                                <span className="relative z-10 text-[11px] font-bold whitespace-nowrap overflow-hidden text-ellipsis max-w-full bg-background/80 px-1 py-0.5 rounded shadow-sm">
                                                    {group.name}
                                                </span>
                                            </div>

                                            {/* Tasks column */}
                                            <div className="flex-1">
                                                {group.tasks.map((task, index) => {
                                                    const left = getPosition(new Date(task.startDate!))
                                                    const right = getPosition(new Date(task.endDate!))
                                                    const width = Math.max(right - left, 1.5)
                                                    const status = task.column?.name
                                                    const duration = getTaskDuration(new Date(task.startDate!), new Date(task.endDate!))
                                                    const isHovered = hoveredTask === task.id
                                                    const isLast = index === group.tasks.length - 1
                                                    const globalIndex = globalStartIndex + index

                                                    return (
                                                        <div
                                                            key={task.id}
                                                            className={`relative flex transition-colors ${!isLast ? 'border-b border-border/50' : ''} ${isHovered ? 'bg-accent/30' : globalIndex % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}
                                                            style={{ height: `${ROW_HEIGHT}px` }}
                                                        >
                                                            {/* Full-width horizontal baseline spanning all columns */}
                                                            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-border/10 pointer-events-none" />
                                                            {/* Task name column */}
                                                            <div className="sticky z-20 shrink-0 border-r bg-background px-2 flex items-center" style={{ width: '160px', left: `${pushColumnWidth}px` }}>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <Link
                                                                            href={`/dashboard/projects/${projectId}?task=${task.id}`}
                                                                            className="text-[11px] truncate hover:text-primary transition-colors"
                                                                        >
                                                                            {task.title}
                                                                        </Link>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent
                                                                        side="top"
                                                                        sideOffset={8}
                                                                        hideArrow
                                                                        className="bg-popover text-popover-foreground border shadow-lg px-3 py-2"
                                                                    >
                                                                        <div className="text-[11px] font-medium">{task.title}</div>
                                                                        <div className="text-[10px] text-muted-foreground mt-0.5">
                                                                            {formatDateFull(new Date(task.startDate!))} → {formatDateFull(new Date(task.endDate!))}
                                                                        </div>
                                                                        <div className="text-[9px] text-muted-foreground/70">
                                                                            {duration} day{duration !== 1 ? 's' : ''} • {group.name}
                                                                        </div>
                                                                        {(task.assignees && task.assignees.length > 0) || task.assignee ? (
                                                                            <div className="flex -space-x-1.5 mt-2 pt-2 border-t">
                                                                                {task.assignees && task.assignees.length > 0 ? (
                                                                                    task.assignees.map((a) => (
                                                                                        <Avatar key={a.user.id} className="h-5 w-5 ring-1 ring-background">
                                                                                            <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                                                                                                {getInitials(a.user.name)}
                                                                                            </AvatarFallback>
                                                                                        </Avatar>
                                                                                    ))
                                                                                ) : task.assignee ? (
                                                                                    <Avatar className="h-5 w-5 ring-1 ring-background">
                                                                                        <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                                                                                            {getInitials(task.assignee.name)}
                                                                                        </AvatarFallback>
                                                                                    </Avatar>
                                                                                ) : null}
                                                                            </div>
                                                                        ) : null}
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </div>

                                                            {/* Bar area */}
                                                            <div className="flex-1 relative">
                                                                {/* Week grid lines */}
                                                                {weekMarkers.map((marker, i) => (
                                                                    <div
                                                                        key={i}
                                                                        className="absolute top-0 bottom-0 w-px bg-border/40"
                                                                        style={{ left: `${marker.pos}%` }}
                                                                    />
                                                                ))}
                                                                {/* Full-width horizontal baseline */}
                                                                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-border/10" />


                                                                {/* Task bar with tooltip */}
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <Link
                                                                            href={`/dashboard/projects/${projectId}?task=${task.id}`}
                                                                            className="absolute h-5 top-1/2 -translate-y-1/2 rounded text-white flex items-center justify-center transition-all hover:brightness-110 cursor-pointer z-10"
                                                                            style={{
                                                                                left: `${left}%`,
                                                                                width: `${width}%`,
                                                                                minWidth: '20px',
                                                                                backgroundColor: group.color
                                                                            }}
                                                                            onMouseEnter={() => setHoveredTask(task.id)}
                                                                            onMouseLeave={() => setHoveredTask(null)}
                                                                        >
                                                                            {status === 'Done' && (
                                                                                <CheckCircle2 className="w-3 h-3 shrink-0 text-green-400" />
                                                                            )}
                                                                        </Link>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent
                                                                        side="top"
                                                                        sideOffset={8}
                                                                        hideArrow
                                                                        className="bg-popover text-popover-foreground border shadow-lg px-3 py-2"
                                                                    >
                                                                        <div className="text-[11px] font-medium">{task.title}</div>
                                                                        <div className="text-[10px] text-muted-foreground mt-0.5">
                                                                            {formatDateFull(new Date(task.startDate!))} → {formatDateFull(new Date(task.endDate!))}
                                                                        </div>
                                                                        <div className="text-[9px] text-muted-foreground/70">
                                                                            {duration} day{duration !== 1 ? 's' : ''} • {group.name}
                                                                        </div>
                                                                        {/* Assignees */}
                                                                        {(task.assignees && task.assignees.length > 0) || task.assignee ? (
                                                                            <div className="flex -space-x-1.5 mt-2 pt-2 border-t">
                                                                                {task.assignees && task.assignees.length > 0 ? (
                                                                                    task.assignees.map((a) => (
                                                                                        <Avatar key={a.user.id} className="h-5 w-5 ring-1 ring-background">
                                                                                            <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                                                                                                {getInitials(a.user.name)}
                                                                                            </AvatarFallback>
                                                                                        </Avatar>
                                                                                    ))
                                                                                ) : task.assignee ? (
                                                                                    <Avatar className="h-5 w-5 ring-1 ring-background">
                                                                                        <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                                                                                            {getInitials(task.assignee.name)}
                                                                                        </AvatarFallback>
                                                                                    </Avatar>
                                                                                ) : null}
                                                                            </div>
                                                                        ) : null}
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    )
}
