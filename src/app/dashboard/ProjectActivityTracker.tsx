"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import { ArrowRight, Loader2 } from "lucide-react"
import { useProjectRoute } from "@/features/projects/useProjectRoute"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type ProgressPoint = {
    date: string
    completedPct: number
}

type Signal = {
    id: string
    kind: string
    severity: "critical" | "warning" | "info"
    headline: string
    detail: string
    createdAt: string
    projectId: string
    taskId: string | null
    taskTitle: string | null
}

type Division = {
    id: string
    name: string
    color: string
    totalTasks: number
    completedTasks: number
    activeCount: number
    inReviewCount: number
    inProgressCount: number
    todoCount: number
    blockedCount: number
    overdueCount: number
    staleCount: number
    reworkCount14d: number
    completedLast7d: number
    oldestReviewDays: number | null
    scheduleDeltaPct: number | null
    actualPlannedPct: number | null
    expectedPlannedPct: number | null
    riskScore: number
    lastActivityAt: string | null
    progressSeries: ProgressPoint[]
    expectedSeries: ProgressPoint[]
    signals: Signal[]
}

type ActivityMonitor = {
    generatedAt: string
    windowDays: number
    summary: {
        behindPlanCount: number
        blockedTasks: number
        staleTasks: number
        overdueTasks: number
        reworkEvents14d: number
    }
    divisions: Division[]
    signals: Signal[]
}

type LegacyTimelineEvent = {
    date: string
    type: "submitted" | "approved"
}

type LegacyPushStats = {
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
    timeline: LegacyTimelineEvent[]
}

type LegacyProjectActivity = {
    id: string
    name: string
    color: string
    totalTasks: number
    totalCompleted: number
    totalInReview: number
    completionRate: number
    pushes: LegacyPushStats[]
}

const CHART_WIDTH = 360
const CHART_HEIGHT = 168
const CHART_PADDING = { top: 12, right: 12, bottom: 18, left: 28 }
const DAY_MS = 24 * 60 * 60 * 1000
const MONITOR_WINDOW_DAYS = 42
const LEGACY_BEHIND_PLAN_PCT = 10

function formatShortDate(value: string | null) {
    if (!value) return "No data"
    return new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
    })
}

function formatDelta(delta: number | null) {
    if (delta === null) return "No plan"
    return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}pp`
}

function buildLinePath(points: ProgressPoint[], getX: (index: number) => number, getY: (value: number) => number) {
    return points.reduce((path, point, index) => {
        const x = getX(index)
        const y = getY(point.completedPct)
        return `${path}${index === 0 ? "M" : " L"} ${x} ${y}`
    }, "")
}

function startOfUtcDay(timestamp: number) {
    const date = new Date(timestamp)
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}

function roundToTenths(value: number) {
    return Math.round(value * 10) / 10
}

function isLegacyProjectActivity(value: unknown): value is LegacyProjectActivity {
    if (!value || typeof value !== "object") return false

    const candidate = value as Partial<LegacyProjectActivity>
    return typeof candidate.id === "string"
        && typeof candidate.name === "string"
        && Array.isArray(candidate.pushes)
        && typeof candidate.totalTasks === "number"
}

function buildLegacyCumulativeApprovalSeries(totalTasks: number, pushes: LegacyPushStats[], windowStart: number, windowDays: number) {
    const dailyCounts = Array.from({ length: windowDays }, () => 0)

    for (const push of pushes) {
        for (const event of push.timeline) {
            if (event.type !== "approved") continue

            const approvedAt = new Date(event.date).getTime()
            if (!Number.isFinite(approvedAt)) continue

            const approvedDay = startOfUtcDay(approvedAt)
            if (approvedDay <= windowStart) {
                dailyCounts[0] += 1
                continue
            }

            const index = Math.floor((approvedDay - windowStart) / DAY_MS)
            if (index >= 0 && index < windowDays) {
                dailyCounts[index] += 1
            }
        }
    }

    let cumulative = 0

    return dailyCounts.map((count, index) => {
        cumulative += count

        return {
            date: new Date(windowStart + index * DAY_MS).toISOString(),
            completedPct: totalTasks > 0 ? roundToTenths((cumulative / totalTasks) * 100) : 0,
        }
    })
}

function buildLegacyExpectedSeries(pushes: LegacyPushStats[], windowStart: number, windowDays: number) {
    const plannedPushes = pushes
        .map((push) => ({
            startDate: new Date(push.startDate).getTime(),
            endDate: push.endDate ? new Date(push.endDate).getTime() : NaN,
            taskCount: push.total,
        }))
        .filter((push) => Number.isFinite(push.startDate) && Number.isFinite(push.endDate) && push.taskCount > 0)

    const totalWeightedTasks = plannedPushes.reduce((sum, push) => sum + push.taskCount, 0)
    if (totalWeightedTasks === 0) return []

    return Array.from({ length: windowDays }, (_, index) => {
        const dayEnd = windowStart + index * DAY_MS + DAY_MS - 1
        let weightedCompletion = 0

        for (const push of plannedPushes) {
            const duration = Math.max(push.endDate - push.startDate, DAY_MS)
            const fraction = clamp((dayEnd - push.startDate) / duration, 0, 1)
            weightedCompletion += push.taskCount * fraction
        }

        return {
            date: new Date(windowStart + index * DAY_MS).toISOString(),
            completedPct: roundToTenths((weightedCompletion / totalWeightedTasks) * 100),
        }
    })
}

function buildLegacyMonitor(projects: LegacyProjectActivity[]): ActivityMonitor {
    const now = Date.now()
    const windowStart = startOfUtcDay(now - (MONITOR_WINDOW_DAYS - 1) * DAY_MS)

    const divisions = projects
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((project) => {
            const totalTasks = project.totalTasks
            const completedTasks = project.totalCompleted
            const inReviewCount = project.totalInReview
            const inProgressCount = project.pushes.reduce((sum, push) => sum + push.inProgress, 0)
            const todoCount = project.pushes.reduce((sum, push) => sum + push.todo, 0)
            const completedLast7d = project.pushes.reduce(
                (sum, push) =>
                    sum + push.timeline.filter((event) => event.type === "approved" && new Date(event.date).getTime() >= now - 7 * DAY_MS).length,
                0
            )
            const overdueCount = project.pushes.reduce((sum, push) => {
                if (!push.endDate) return sum
                const endDate = new Date(push.endDate).getTime()
                if (!Number.isFinite(endDate) || endDate >= now) return sum
                return sum + Math.max(push.total - push.completed, 0)
            }, 0)
            const progressSeries = buildLegacyCumulativeApprovalSeries(totalTasks, project.pushes, windowStart, MONITOR_WINDOW_DAYS)
            const expectedSeries = buildLegacyExpectedSeries(project.pushes, windowStart, MONITOR_WINDOW_DAYS)
            const actualPlannedPct = totalTasks > 0 ? roundToTenths((completedTasks / totalTasks) * 100) : null
            const expectedPlannedPct = expectedSeries.length > 0 ? expectedSeries[expectedSeries.length - 1].completedPct : null
            const scheduleDeltaPct = actualPlannedPct !== null && expectedPlannedPct !== null
                ? roundToTenths(actualPlannedPct - expectedPlannedPct)
                : null
            const overduePushes = project.pushes.filter((push) => {
                if (!push.endDate) return false
                const endDate = new Date(push.endDate).getTime()
                return Number.isFinite(endDate) && endDate < now && push.completed < push.total
            })
            const latestTimelineAt = Math.max(
                0,
                ...project.pushes.flatMap((push) => push.timeline.map((event) => new Date(event.date).getTime()).filter(Number.isFinite))
            )
            const latestPushDeadlineAt = Math.max(
                0,
                ...project.pushes.map((push) => (push.endDate ? new Date(push.endDate).getTime() : 0)).filter(Number.isFinite)
            )
            const lastActivityAtMs = Math.max(latestTimelineAt, latestPushDeadlineAt)
            const paceSignal: Signal | null = scheduleDeltaPct !== null && scheduleDeltaPct <= -LEGACY_BEHIND_PLAN_PCT
                ? {
                    id: `legacy-behind-${project.id}`,
                    kind: "pace",
                    severity: "critical",
                    headline: `${project.name}: behind plan`,
                    detail: `${Math.abs(scheduleDeltaPct)} percentage points behind the current push schedule.`,
                    createdAt: new Date(lastActivityAtMs || now).toISOString(),
                    projectId: project.id,
                    taskId: null,
                    taskTitle: null,
                }
                : null
            const overdueSignal: Signal | null = overdueCount > 0
                ? {
                    id: `legacy-overdue-${project.id}`,
                    kind: "overdue",
                    severity: "warning",
                    headline: `${project.name}: overdue push work`,
                    detail: `${overdueCount} incomplete task${overdueCount === 1 ? "" : "s"} remain past push deadline.`,
                    createdAt: new Date(lastActivityAtMs || now).toISOString(),
                    projectId: project.id,
                    taskId: null,
                    taskTitle: null,
                }
                : null
            const delayedPushSignal: Signal | null = overduePushes.length > 0
                ? {
                    id: `legacy-push-${project.id}`,
                    kind: "push_overdue",
                    severity: "warning",
                    headline: `${project.name}: delayed push`,
                    detail: `${overduePushes[0].name} is still incomplete after its deadline.`,
                    createdAt: new Date(lastActivityAtMs || now).toISOString(),
                    projectId: project.id,
                    taskId: null,
                    taskTitle: null,
                }
                : null
            const signals = [paceSignal, overdueSignal, delayedPushSignal].filter((signal): signal is Signal => signal !== null)

            return {
                id: project.id,
                name: project.name,
                color: project.color ?? "#64748b",
                totalTasks,
                completedTasks,
                activeCount: Math.max(totalTasks - completedTasks, 0),
                inReviewCount,
                inProgressCount,
                todoCount,
                blockedCount: 0,
                overdueCount,
                staleCount: 0,
                reworkCount14d: 0,
                completedLast7d,
                oldestReviewDays: null,
                scheduleDeltaPct,
                actualPlannedPct,
                expectedPlannedPct,
                riskScore: overdueCount * 8 + (scheduleDeltaPct !== null && scheduleDeltaPct < 0 ? Math.abs(scheduleDeltaPct) : 0),
                lastActivityAt: lastActivityAtMs > 0 ? new Date(lastActivityAtMs).toISOString() : null,
                progressSeries,
                expectedSeries,
                signals,
            }
        })

    return {
        generatedAt: new Date(now).toISOString(),
        windowDays: MONITOR_WINDOW_DAYS,
        summary: {
            behindPlanCount: divisions.filter((division) => division.scheduleDeltaPct !== null && division.scheduleDeltaPct <= -LEGACY_BEHIND_PLAN_PCT).length,
            blockedTasks: 0,
            staleTasks: 0,
            overdueTasks: divisions.reduce((sum, division) => sum + division.overdueCount, 0),
            reworkEvents14d: 0,
        },
        divisions,
        signals: divisions
            .flatMap((division) => division.signals)
            .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
            .slice(0, 10),
    }
}

function normalizeMonitorPayload(payload: ActivityMonitor | LegacyProjectActivity[] | undefined) {
    if (!payload) {
        return {
            monitor: undefined,
            isLegacy: false,
        }
    }

    if (Array.isArray(payload)) {
        return {
            monitor: payload.every(isLegacyProjectActivity) ? buildLegacyMonitor(payload) : undefined,
            isLegacy: true,
        }
    }

    return {
        monitor: payload,
        isLegacy: false,
    }
}

function OverlayChart({
    divisions,
    hoveredDivisionId,
    activeIndex,
    onActiveIndexChange,
    onHoveredDivisionChange,
    onOpenDivision,
}: {
    divisions: Division[]
    hoveredDivisionId: string | null
    activeIndex: number
    onActiveIndexChange: (index: number | null) => void
    onHoveredDivisionChange: (divisionId: string | null) => void
    onOpenDivision: (divisionId: string) => void
}) {
    const pointCount = divisions[0]?.progressSeries.length ?? 0
    const chartInnerWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right
    const chartInnerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
    const hoveredDivision = divisions.find((division) => division.id === hoveredDivisionId) ?? null

    const getX = React.useCallback(
        (index: number) => {
            if (pointCount <= 1) return CHART_PADDING.left
            return CHART_PADDING.left + (index / (pointCount - 1)) * chartInnerWidth
        },
        [chartInnerWidth, pointCount]
    )

    const getY = React.useCallback((value: number) => {
        return CHART_PADDING.top + chartInnerHeight - (value / 100) * chartInnerHeight
    }, [chartInnerHeight])

    const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
        if (pointCount === 0) return
        if (pointCount === 1) {
            onActiveIndexChange(0)
            return
        }

        const rect = event.currentTarget.getBoundingClientRect()
        const relativeX = event.clientX - rect.left
        const ratio = Math.min(
            1,
            Math.max(0, (relativeX - (CHART_PADDING.left / CHART_WIDTH) * rect.width) / ((chartInnerWidth / CHART_WIDTH) * rect.width))
        )
        const nextIndex = Math.round(ratio * (pointCount - 1))
        onActiveIndexChange(nextIndex)
    }

    if (pointCount === 0) {
        return (
            <div className="flex h-[168px] items-center justify-center rounded-lg border bg-background/70 text-xs text-muted-foreground">
                No approved work yet.
            </div>
        )
    }

    const activeDate = divisions[0].progressSeries[activeIndex]?.date ?? null
    const gridValues = [0, 50, 100]

    return (
        <div className="rounded-lg border bg-background/80 p-2.5">
            <div className="flex min-h-5 items-center justify-between gap-2 text-[11px] text-muted-foreground">
                {hoveredDivision ? (
                    <button
                        type="button"
                        onClick={() => onOpenDivision(hoveredDivision.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:text-foreground/80"
                    >
                        <span className="truncate">{hoveredDivision.name}</span>
                        <ArrowRight className="h-3 w-3" />
                    </button>
                ) : (
                    <span />
                )}
                <span>{formatShortDate(activeDate)}</span>
            </div>

            <div className="mt-2">
                <svg
                    viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                    className="h-[210px] w-full"
                    onPointerMove={handlePointerMove}
                    onPointerLeave={() => {
                        onActiveIndexChange(null)
                        onHoveredDivisionChange(null)
                    }}
                >
                    {gridValues.map((value) => (
                        <g key={value}>
                            <line
                                x1={CHART_PADDING.left}
                                x2={CHART_WIDTH - CHART_PADDING.right}
                                y1={getY(value)}
                                y2={getY(value)}
                                className="stroke-border"
                                strokeDasharray={value === 0 ? undefined : "3 5"}
                            />
                            <text
                                x={CHART_PADDING.left - 8}
                                y={getY(value) + 4}
                                className="fill-muted-foreground text-[9px]"
                                textAnchor="end"
                            >
                                {value}
                            </text>
                        </g>
                    ))}

                    {Array.from({ length: pointCount }, (_, index) => index)
                        .filter((index) => index === 0 || index === pointCount - 1 || index % 7 === 0)
                        .map((index) => (
                            <line
                                key={index}
                                x1={getX(index)}
                                x2={getX(index)}
                                y1={CHART_PADDING.top}
                                y2={CHART_HEIGHT - CHART_PADDING.bottom}
                                className="stroke-border/60"
                            />
                        ))}

                    {divisions.map((division) => {
                        const isHovered = division.id === hoveredDivisionId
                        const hasHoveredDivision = hoveredDivisionId !== null
                        return (
                            <path
                                key={division.id}
                                d={buildLinePath(division.progressSeries, getX, getY)}
                                fill="none"
                                stroke={division.color}
                                strokeWidth={isHovered ? 2.5 : 1.35}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                opacity={hasHoveredDivision ? (isHovered ? 1 : 0.16) : 0.42}
                                className="cursor-pointer"
                                onPointerEnter={() => onHoveredDivisionChange(division.id)}
                            />
                        )
                    })}

                    {hoveredDivision && hoveredDivision.expectedSeries.length > 0 && (
                        <path
                            d={buildLinePath(hoveredDivision.expectedSeries, getX, getY)}
                            fill="none"
                            stroke={hoveredDivision.color}
                            strokeWidth={1.5}
                            strokeDasharray="5 5"
                            strokeLinecap="round"
                            opacity={0.9}
                        />
                    )}

                    <line
                        x1={getX(activeIndex)}
                        x2={getX(activeIndex)}
                        y1={CHART_PADDING.top}
                        y2={CHART_HEIGHT - CHART_PADDING.bottom}
                        className="stroke-foreground/30"
                        strokeDasharray="4 4"
                    />

                    <text x={CHART_PADDING.left} y={CHART_HEIGHT - 6} className="fill-muted-foreground text-[10px]">
                        {formatShortDate(divisions[0].progressSeries[0]?.date ?? null)}
                    </text>
                    <text
                        x={CHART_WIDTH - CHART_PADDING.right}
                        y={CHART_HEIGHT - 6}
                        className="fill-muted-foreground text-[10px]"
                        textAnchor="end"
                    >
                        {formatShortDate(divisions[0].progressSeries[pointCount - 1]?.date ?? null)}
                    </text>
                </svg>
            </div>
        </div>
    )
}

export function ProjectActivityTracker({
    workspaceId,
}: {
    workspaceId: string
}) {
    const { prefetchProjectRoute, pushProjectRoute } = useProjectRoute()
    const rawMonitor = useQuery(api.settings.getProjectActivity, { workspaceId }) as ActivityMonitor | LegacyProjectActivity[] | undefined
    const { monitor } = React.useMemo(() => normalizeMonitorPayload(rawMonitor), [rawMonitor])
    const [hoverIndex, setHoverIndex] = React.useState<number | null>(null)
    const [hoveredDivisionId, setHoveredDivisionId] = React.useState<string | null>(null)
    const [activeTab, setActiveTab] = React.useState<"graph" | "stack">("graph")

    const divisions = monitor?.divisions ?? []
    const sortedDivisions = React.useMemo(
        () =>
            divisions
                .slice()
                .sort((left, right) => right.riskScore - left.riskScore || left.name.localeCompare(right.name)),
        [divisions]
    )

    const pointCount = divisions[0]?.progressSeries.length ?? 0
    const activeIndex = hoverIndex ?? Math.max(pointCount - 1, 0)

    const openDivision = React.useCallback((divisionId: string) => {
        pushProjectRoute(`/dashboard/projects/${divisionId}`, divisionId)
    }, [pushProjectRoute])

    if (monitor === undefined) {
        return (
            <section className="border border-border rounded-lg p-3 lg:h-[440px]">
                <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            </section>
        )
    }

    if (divisions.length === 0) {
        return (
            <section className="border border-border rounded-lg p-3 lg:h-[440px]">
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No active divisions found.</div>
            </section>
        )
    }

    return (
        <section className="border border-border rounded-lg bg-card/60 p-3 lg:h-[440px]">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "graph" | "stack")} className="flex h-full min-h-0 flex-col">
                <TabsList className="grid h-8 w-full grid-cols-2">
                            <TabsTrigger value="graph" className="text-xs">Graph</TabsTrigger>
                            <TabsTrigger value="stack" className="text-xs">Stack</TabsTrigger>
                </TabsList>

                <TabsContent value="graph" className="mt-3 min-h-0 flex-1">
                    <OverlayChart
                        divisions={divisions}
                        hoveredDivisionId={hoveredDivisionId}
                        activeIndex={activeIndex}
                        onActiveIndexChange={setHoverIndex}
                        onHoveredDivisionChange={setHoveredDivisionId}
                        onOpenDivision={openDivision}
                    />
                </TabsContent>

                <TabsContent value="stack" className="mt-3 min-h-0 flex-1">
                    <div className="h-full rounded-lg border bg-background/80 p-2">
                        <div className="h-full space-y-1 overflow-y-auto pr-1">
                            {sortedDivisions.map((division) => {
                                const livePct = division.progressSeries[activeIndex]?.completedPct ?? 0
                                const currentPct = division.totalTasks > 0 ? (division.completedTasks / division.totalTasks) * 100 : 0

                                return (
                                    <button
                                        key={division.id}
                                        type="button"
                                        onClick={() => openDivision(division.id)}
                                        onMouseEnter={() => {
                                            setHoveredDivisionId(division.id)
                                            void prefetchProjectRoute(division.id)
                                        }}
                                        onMouseLeave={() => setHoveredDivisionId((current) => (current === division.id ? null : current))}
                                        className="block w-full rounded-md border border-border bg-background/60 px-2 py-1.5 text-left transition-colors hover:bg-muted/40"
                                    >
                                        <div className="truncate text-[11px] font-medium">{division.name}</div>
                                        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                                            <span>{livePct.toFixed(0)}% cum</span>
                                            <span>{currentPct.toFixed(0)}% now</span>
                                            <span>{division.inReviewCount} rev</span>
                                            <span>{formatDelta(division.scheduleDeltaPct)}</span>
                                        </div>

                                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                                            <div
                                                className="h-full rounded-full"
                                                style={{ width: `${Math.max(currentPct, 2)}%`, backgroundColor: division.color }}
                                            />
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </section>
    )
}
