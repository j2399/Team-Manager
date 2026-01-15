"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, TrendingUp, TrendingDown, Minus, CheckCircle2, Clock, Loader2, AlertTriangle, Calendar, Target, Activity, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

type TimelineEvent = {
    date: string
    type: 'submitted' | 'approved'
}

type PushStats = {
    id: string
    name: string
    startDate: string
    endDate: string | null
    status: string
    total: number
    completed: number
    inReview: number
    inProgress: number
    todo: number
    timeline: TimelineEvent[]
}

type ProjectActivity = {
    id: string
    name: string
    color: string
    totalTasks: number
    totalCompleted: number
    totalInReview: number
    completionRate: number
    pushes: PushStats[]
}

// Check if a push is overdue
const isPushOverdue = (push: PushStats) => {
    if (!push.endDate) return false
    const endDate = new Date(push.endDate)
    const now = new Date()
    return now > endDate && push.completed < push.total
}

// Get days until deadline or days overdue
const getDaysStatus = (push: PushStats) => {
    if (!push.endDate) return null
    const endDate = new Date(push.endDate)
    const now = new Date()
    const diffTime = endDate.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
}

// Calculate health score for a push (0-100)
const getPushHealth = (push: PushStats) => {
    if (push.total === 0) return 100
    const completionRate = (push.completed / push.total) * 100
    const daysStatus = getDaysStatus(push)

    // If overdue and not complete, reduce health
    if (daysStatus !== null && daysStatus < 0 && completionRate < 100) {
        return Math.max(0, completionRate - Math.abs(daysStatus) * 2)
    }
    return completionRate
}

// Line chart showing actual submission/approval events over time
function TaskTimeline({ timeline, pushName }: { timeline: TimelineEvent[], pushName: string }) {
    if (timeline.length === 0) {
        return (
            <div className="mt-2 pt-2 border-t border-border">
                <div className="text-[9px] text-muted-foreground mb-1.5">Task activity timeline</div>
                <div className="h-12 flex items-center justify-center text-[9px] text-muted-foreground/60 italic">
                    No data yet - tracking starts when tasks are moved to Review or Done
                </div>
            </div>
        )
    }

    // Parse dates and build cumulative counts
    const events = timeline.map(e => ({
        date: new Date(e.date),
        type: e.type
    })).sort((a, b) => a.date.getTime() - b.date.getTime())

    // Build cumulative data points
    let submittedCount = 0
    let approvedCount = 0
    const dataPoints: { date: Date; submitted: number; approved: number; type: 'submitted' | 'approved' }[] = []

    events.forEach(e => {
        if (e.type === 'submitted') {
            submittedCount++
        } else {
            approvedCount++
        }
        dataPoints.push({
            date: e.date,
            submitted: submittedCount,
            approved: approvedCount,
            type: e.type
        })
    })

    // Chart dimensions
    const width = 180
    const height = 60
    const padding = { top: 8, right: 8, bottom: 16, left: 20 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    // Calculate scales
    const minDate = dataPoints[0].date.getTime()
    const maxDate = dataPoints[dataPoints.length - 1].date.getTime()
    const dateRange = maxDate - minDate || 1
    const maxCount = Math.max(submittedCount, approvedCount, 1)

    const getX = (date: Date) => {
        return padding.left + ((date.getTime() - minDate) / dateRange) * chartWidth
    }
    const getY = (value: number) => {
        return padding.top + chartHeight - (value / maxCount) * chartHeight
    }

    // Build path strings for lines
    let submittedPath = ''
    let approvedPath = ''
    let lastSubmitted = 0
    let lastApproved = 0

    dataPoints.forEach((point, i) => {
        const x = getX(point.date)
        if (point.type === 'submitted') {
            lastSubmitted = point.submitted
            if (submittedPath === '') {
                submittedPath = `M ${x} ${getY(lastSubmitted)}`
            } else {
                submittedPath += ` L ${x} ${getY(lastSubmitted)}`
            }
        } else {
            lastApproved = point.approved
            if (approvedPath === '') {
                approvedPath = `M ${x} ${getY(lastApproved)}`
            } else {
                approvedPath += ` L ${x} ${getY(lastApproved)}`
            }
        }
    })

    // Format date for display
    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    return (
        <div className="mt-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between mb-1">
                <div className="text-[9px] text-muted-foreground">Task activity timeline</div>
                <div className="flex items-center gap-2 text-[8px]">
                    <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400/70" />
                        Submitted
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
                        Approved
                    </span>
                </div>
            </div>
            <svg width={width} height={height} className="overflow-visible">
                {/* Y-axis labels */}
                <text x={padding.left - 4} y={padding.top + 2} className="text-[7px] fill-muted-foreground" textAnchor="end">
                    {maxCount}
                </text>
                <text x={padding.left - 4} y={padding.top + chartHeight} className="text-[7px] fill-muted-foreground" textAnchor="end">
                    0
                </text>

                {/* Grid line */}
                <line
                    x1={padding.left}
                    y1={padding.top + chartHeight}
                    x2={padding.left + chartWidth}
                    y2={padding.top + chartHeight}
                    className="stroke-border"
                    strokeWidth={0.5}
                />

                {/* Submitted line (blue) */}
                {submittedPath && (
                    <path
                        d={submittedPath}
                        fill="none"
                        className="stroke-blue-400/80"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                )}

                {/* Approved line (green) */}
                {approvedPath && (
                    <path
                        d={approvedPath}
                        fill="none"
                        className="stroke-emerald-400/80"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                )}

                {/* Data points */}
                {dataPoints.map((point, i) => (
                    <circle
                        key={i}
                        cx={getX(point.date)}
                        cy={getY(point.type === 'submitted' ? point.submitted : point.approved)}
                        r={2.5}
                        className={point.type === 'submitted' ? 'fill-blue-400/80' : 'fill-emerald-400/80'}
                    />
                ))}

                {/* X-axis labels */}
                <text x={padding.left} y={height - 2} className="text-[7px] fill-muted-foreground">
                    {formatDate(dataPoints[0].date)}
                </text>
                <text x={width - padding.right} y={height - 2} className="text-[7px] fill-muted-foreground" textAnchor="end">
                    {formatDate(dataPoints[dataPoints.length - 1].date)}
                </text>
            </svg>
        </div>
    )
}

export function ProjectActivityTracker() {
    const router = useRouter()
    const [projects, setProjects] = useState<ProjectActivity[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedProject, setSelectedProject] = useState<string | null>(null)
    const [hoveredPush, setHoveredPush] = useState<string | null>(null)

    useEffect(() => {
        fetchProjectActivity()
    }, [])

    const fetchProjectActivity = async () => {
        try {
            const res = await fetch('/api/projects/activity', { credentials: 'include' })
            const data = await res.json()

            // Check if we got valid array data
            if (res.ok && Array.isArray(data)) {
                setProjects(data)
                const firstWithPushes = data.find((p: ProjectActivity) => p.pushes.length > 0)
                if (firstWithPushes) {
                    setSelectedProject(firstWithPushes.id)
                } else if (data.length > 0) {
                    setSelectedProject(data[0].id)
                }
            } else {
                // Try fetching all projects as fallback if activity endpoint fails
                const projectsRes = await fetch('/api/projects', { credentials: 'include' })
                const projectsData = await projectsRes.json()

                if (projectsRes.ok && Array.isArray(projectsData)) {
                    const transformed = projectsData.map((p: any) => ({
                        id: p.id,
                        name: p.name,
                        color: p.color || '#6b7280',
                        totalTasks: 0,
                        totalCompleted: 0,
                        totalInReview: 0,
                        completionRate: 0,
                        pushes: []
                    }))
                    setProjects(transformed)
                    if (transformed.length > 0) {
                        setSelectedProject(transformed[0].id)
                    }
                }
            }
        } catch (error) {
            console.error('Failed to fetch project activity:', error)
        } finally {
            setLoading(false)
        }
    }

    const selectedProjectData = projects.find(p => p.id === selectedProject)
    const hoveredPushData = selectedProjectData?.pushes.find(p => p.id === hoveredPush)

    // Calculate project health and trends
    const projectMetrics = useMemo(() => {
        if (!selectedProjectData) return null

        const pushes = selectedProjectData.pushes
        const overdueCount = pushes.filter(isPushOverdue).length
        const avgHealth = pushes.length > 0
            ? pushes.reduce((sum, p) => sum + getPushHealth(p), 0) / pushes.length
            : 100

        // Calculate velocity trend (comparing recent vs older pushes)
        let velocityTrend: 'up' | 'down' | 'stable' = 'stable'
        if (pushes.length >= 2) {
            const mid = Math.floor(pushes.length / 2)
            const olderAvg = pushes.slice(0, mid).reduce((s, p) => s + p.completed, 0) / mid
            const recentAvg = pushes.slice(mid).reduce((s, p) => s + p.completed, 0) / (pushes.length - mid)
            if (recentAvg > olderAvg * 1.1) velocityTrend = 'up'
            else if (recentAvg < olderAvg * 0.9) velocityTrend = 'down'
        }

        // Submissions in review
        const pendingReview = pushes.reduce((s, p) => s + p.inReview, 0)

        return {
            overdueCount,
            avgHealth: Math.round(avgHealth),
            velocityTrend,
            pendingReview,
            totalPushes: pushes.length,
            activePushes: pushes.filter(p => p.status === 'Active').length
        }
    }, [selectedProjectData])

    const navigateToProject = (projectId: string) => {
        router.push(`/dashboard/projects/${projectId}`)
    }

    if (loading) {
        return (
            <section className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-center h-48">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            </section>
        )
    }

    if (projects.length === 0) {
        return (
            <section className="border border-border rounded-lg p-4">
                <h2 className="text-sm font-medium mb-3">Activity Log</h2>
                <p className="text-xs text-muted-foreground text-center py-8">
                    No projects found
                </p>
            </section>
        )
    }

    return (
        <section className="border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium">Activity Log</h2>
                {projectMetrics && projectMetrics.velocityTrend !== 'stable' && (
                    <div className={cn(
                        "flex items-center gap-0.5 text-[9px]",
                        projectMetrics.velocityTrend === 'up' ? "text-emerald-600" : "text-amber-600"
                    )}>
                        {projectMetrics.velocityTrend === 'up' ? (
                            <TrendingUp className="h-3 w-3" />
                        ) : (
                            <TrendingDown className="h-3 w-3" />
                        )}
                        {projectMetrics.velocityTrend === 'up' ? 'Velocity up' : 'Slowing'}
                    </div>
                )}
            </div>

            {/* Project Selector */}
            <div className="flex gap-1 mb-4 overflow-x-auto pb-1 scrollbar-hide">
                {projects.map(project => {
                    const hasOverdue = project.pushes.some(isPushOverdue)
                    return (
                        <button
                            key={project.id}
                            onClick={() => setSelectedProject(project.id)}
                            className={cn(
                                "px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap transition-all shrink-0 relative",
                                selectedProject === project.id
                                    ? "bg-foreground text-background"
                                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                            )}
                        >
                            {project.name}
                            {hasOverdue && selectedProject !== project.id && (
                                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-amber-500 rounded-full" />
                            )}
                        </button>
                    )
                })}
            </div>

            {selectedProjectData && projectMetrics && (
                <>
                    {/* Project Stats Row */}
                    <div className="flex items-center justify-between mb-3 text-[10px] text-muted-foreground">
                        <span>{selectedProjectData.totalCompleted}/{selectedProjectData.totalTasks} tasks done</span>
                        {projectMetrics.overdueCount > 0 && (
                            <div className="flex items-center gap-1 text-amber-600">
                                <AlertTriangle className="h-3 w-3" />
                                <span>{projectMetrics.overdueCount} overdue</span>
                            </div>
                        )}
                    </div>

                    {/* Sprint Bars - Custom Design */}
                    {selectedProjectData.pushes.length > 0 ? (
                        <div
                            className="space-y-1.5"
                            onMouseLeave={() => setHoveredPush(null)}
                        >
                            {selectedProjectData.pushes.map(push => {
                                const completionPct = push.total > 0 ? (push.completed / push.total) * 100 : 0
                                const reviewPct = push.total > 0 ? (push.inReview / push.total) * 100 : 0
                                const progressPct = push.total > 0 ? (push.inProgress / push.total) * 100 : 0
                                const isOverdue = isPushOverdue(push)
                                const daysStatus = getDaysStatus(push)
                                const isHovered = hoveredPush === push.id

                                return (
                                    <div
                                        key={push.id}
                                        className="relative group"
                                        onMouseEnter={() => setHoveredPush(push.id)}
                                    >
                                        {/* Bar Container */}
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                "text-[9px] w-20 truncate shrink-0",
                                                isOverdue ? "text-amber-600 font-medium" : "text-muted-foreground"
                                            )}>
                                                {push.name}
                                            </span>
                                            <div className="flex-1 h-4 rounded-sm overflow-hidden relative bg-neutral-300 dark:bg-neutral-700">
                                                {/* Completed - Green */}
                                                <div
                                                    className="absolute left-0 top-0 bottom-0 transition-all bg-emerald-400/70 dark:bg-emerald-400"
                                                    style={{ width: `${completionPct}%` }}
                                                />
                                                {/* In Review - Blue */}
                                                <div
                                                    className="absolute top-0 bottom-0 transition-all bg-blue-400/70 dark:bg-blue-400"
                                                    style={{ left: `${completionPct}%`, width: `${reviewPct}%` }}
                                                />
                                                {/* In Progress - Amber */}
                                                <div
                                                    className="absolute top-0 bottom-0 transition-all bg-amber-500 dark:bg-amber-400"
                                                    style={{ left: `${completionPct + reviewPct}%`, width: `${progressPct}%` }}
                                                />
                                                {/* Overdue indicator */}
                                                {isOverdue && (
                                                    <div className="absolute right-0 top-0 bottom-0 w-1 bg-red-500" />
                                                )}
                                            </div>
                                            <span className="text-[9px] text-muted-foreground w-8 text-right shrink-0">
                                                {push.completed}/{push.total}
                                            </span>
                                        </div>

                                        {/* Hover Tooltip - Detailed Info */}
                                        {isHovered && (
                                            <div className="absolute left-24 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[200px] text-[10px]">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="font-semibold text-xs">{push.name}</div>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            router.push(`/dashboard/projects/${selectedProjectData.id}?push=${push.id}`)
                                                        }}
                                                        className="p-1 rounded hover:bg-muted transition-colors"
                                                        title="Go to sprint"
                                                    >
                                                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                                    </button>
                                                </div>

                                                {/* Status Badge */}
                                                <div className="flex items-center gap-2 mb-2">
                                                    {isOverdue ? (
                                                        <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-medium">
                                                            {Math.abs(daysStatus!)}d overdue
                                                        </span>
                                                    ) : daysStatus !== null && daysStatus >= 0 ? (
                                                        <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                                            {daysStatus === 0 ? 'Due today' : `${daysStatus}d left`}
                                                        </span>
                                                    ) : null}
                                                    {completionPct === 100 && (
                                                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">
                                                            Complete
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Task Breakdown */}
                                                <div className="space-y-1.5 border-t border-border pt-2">
                                                    <div className="flex justify-between">
                                                        <span className="flex items-center gap-1.5">
                                                            <span className="w-2 h-2 rounded-sm bg-emerald-400/70 dark:bg-emerald-400" />
                                                            Done
                                                        </span>
                                                        <span className="font-medium">{push.completed} <span className="text-muted-foreground font-normal">({Math.round(completionPct)}%)</span></span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="flex items-center gap-1.5">
                                                            <span className="w-2 h-2 rounded-sm bg-blue-400/70 dark:bg-blue-400" />
                                                            In Review
                                                        </span>
                                                        <span className="font-medium">{push.inReview} <span className="text-muted-foreground font-normal">({Math.round(reviewPct)}%)</span></span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="flex items-center gap-1.5">
                                                            <span className="w-2 h-2 rounded-sm bg-amber-500 dark:bg-amber-400" />
                                                            In Progress
                                                        </span>
                                                        <span className="font-medium">{push.inProgress} <span className="text-muted-foreground font-normal">({Math.round(progressPct)}%)</span></span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="flex items-center gap-1.5">
                                                            <span className="w-2 h-2 rounded-sm bg-neutral-300 dark:bg-neutral-700" />
                                                            To Do
                                                        </span>
                                                        <span className="font-medium">{push.todo}</span>
                                                    </div>
                                                </div>

                                                {/* Timeline - Actual submission/approval events */}
                                                <TaskTimeline timeline={push.timeline} pushName={push.name} />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
                            No sprints in this project yet
                        </div>
                    )}

                    {/* View Project Link */}
                    <button
                        onClick={() => navigateToProject(selectedProjectData.id)}
                        className="w-full mt-3 flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors py-1.5"
                    >
                        View {selectedProjectData.name}
                        <ChevronRight className="h-3 w-3" />
                    </button>
                </>
            )}
        </section>
    )
}
