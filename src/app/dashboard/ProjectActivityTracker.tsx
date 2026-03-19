"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import {
    AlertTriangle,
    ArrowRight,
    Clock3,
    GitPullRequestArrow,
    Loader2,
    ShieldAlert,
    Target,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useProjectRoute } from "@/features/projects/useProjectRoute"

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

const CHART_WIDTH = 760
const CHART_HEIGHT = 260
const CHART_PADDING = { top: 18, right: 16, bottom: 28, left: 36 }

function formatShortDate(value: string | null) {
    if (!value) return "No data"
    return new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
    })
}

function formatRelativeTime(value: string | null) {
    if (!value) return "No recent movement"
    const now = Date.now()
    const then = new Date(value).getTime()
    const diff = Math.max(0, now - then)
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return "just now"
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

function signalTone(signal: Signal["severity"]) {
    if (signal === "critical") {
        return {
            border: "border-red-200/80 dark:border-red-900/60",
            bg: "bg-red-50/70 dark:bg-red-950/20",
            text: "text-red-700 dark:text-red-300",
        }
    }

    if (signal === "warning") {
        return {
            border: "border-amber-200/80 dark:border-amber-900/60",
            bg: "bg-amber-50/70 dark:bg-amber-950/20",
            text: "text-amber-700 dark:text-amber-300",
        }
    }

    return {
        border: "border-sky-200/80 dark:border-sky-900/60",
        bg: "bg-sky-50/70 dark:bg-sky-950/20",
        text: "text-sky-700 dark:text-sky-300",
    }
}

function StatChip({
    icon,
    label,
    value,
}: {
    icon: React.ReactNode
    label: string
    value: string | number
}) {
    return (
        <div className="rounded-lg border bg-background/80 px-3 py-2">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {icon}
                <span>{label}</span>
            </div>
            <div className="mt-1 text-lg font-semibold leading-none">{value}</div>
        </div>
    )
}

function MetricBox({
    label,
    value,
    detail,
    tone = "default",
}: {
    label: string
    value: string | number
    detail?: string
    tone?: "default" | "warning" | "critical"
}) {
    return (
        <div
            className={cn(
                "rounded-lg border px-3 py-2",
                tone === "critical" && "border-red-200/80 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/20",
                tone === "warning" && "border-amber-200/80 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20",
                tone === "default" && "border-border bg-background/70"
            )}
        >
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
            <div className="mt-1 text-base font-semibold">{value}</div>
            {detail && <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>}
        </div>
    )
}

function OverlayChart({
    divisions,
    selectedDivision,
    activeIndex,
    onActiveIndexChange,
    onSelectDivision,
}: {
    divisions: Division[]
    selectedDivision: Division | null
    activeIndex: number
    onActiveIndexChange: (index: number | null) => void
    onSelectDivision: (divisionId: string) => void
}) {
    const pointCount = divisions[0]?.progressSeries.length ?? 0
    const chartInnerWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right
    const chartInnerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom

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
            <div className="flex h-[250px] items-center justify-center rounded-lg border bg-background/70 text-sm text-muted-foreground">
                No approved work yet. The overlay will populate as divisions finish tasks.
            </div>
        )
    }

    const activeDate = divisions[0].progressSeries[activeIndex]?.date ?? null
    const selectedActual = selectedDivision?.progressSeries[activeIndex]?.completedPct ?? null
    const selectedExpected = selectedDivision?.expectedSeries[activeIndex]?.completedPct ?? null
    const gridValues = [0, 25, 50, 75, 100]

    return (
        <div className="rounded-lg border bg-background/80 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        All Divisions Superimposed
                    </div>
                    <div className="mt-1 text-sm font-medium">
                        {selectedDivision ? selectedDivision.name : "Division"} throughput at {formatShortDate(activeDate)}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>Approved: {selectedActual !== null ? `${selectedActual.toFixed(1)}%` : "0.0%"}</span>
                    {selectedExpected !== null && <span>Plan: {selectedExpected.toFixed(1)}%</span>}
                </div>
            </div>

            <div className="mt-3">
                <svg
                    viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                    className="h-[250px] w-full"
                    onPointerMove={handlePointerMove}
                    onPointerLeave={() => onActiveIndexChange(null)}
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
                                className="fill-muted-foreground text-[10px]"
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
                        const isSelected = division.id === selectedDivision?.id
                        return (
                            <path
                                key={division.id}
                                d={buildLinePath(division.progressSeries, getX, getY)}
                                fill="none"
                                stroke={division.color}
                                strokeWidth={isSelected ? 3 : 1.75}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                opacity={isSelected ? 1 : 0.22}
                            />
                        )
                    })}

                    {selectedDivision && selectedDivision.expectedSeries.length > 0 && (
                        <path
                            d={buildLinePath(selectedDivision.expectedSeries, getX, getY)}
                            fill="none"
                            stroke={selectedDivision.color}
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

                    {selectedDivision && (
                        <>
                            <circle
                                cx={getX(activeIndex)}
                                cy={getY(selectedDivision.progressSeries[activeIndex]?.completedPct ?? 0)}
                                r={4}
                                fill={selectedDivision.color}
                            />
                            {selectedDivision.expectedSeries.length > 0 && (
                                <circle
                                    cx={getX(activeIndex)}
                                    cy={getY(selectedDivision.expectedSeries[activeIndex]?.completedPct ?? 0)}
                                    r={3}
                                    fill="transparent"
                                    stroke={selectedDivision.color}
                                    strokeWidth={1.5}
                                />
                            )}
                        </>
                    )}

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

            <div className="mt-3 flex flex-wrap gap-1.5">
                {divisions.map((division) => {
                    const isSelected = division.id === selectedDivision?.id
                    const activeValue = division.progressSeries[activeIndex]?.completedPct ?? 0

                    return (
                        <button
                            key={division.id}
                            type="button"
                            onClick={() => onSelectDivision(division.id)}
                            className={cn(
                                "rounded-md border px-2 py-1 text-left transition-colors",
                                isSelected ? "bg-background shadow-sm" : "bg-background/50 hover:bg-background"
                            )}
                            style={{
                                borderColor: isSelected ? `${division.color}66` : undefined,
                                boxShadow: isSelected ? `inset 0 0 0 1px ${division.color}20` : undefined,
                            }}
                        >
                            <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: division.color }} />
                                <span className="text-xs font-medium">{division.name}</span>
                            </div>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                                {activeValue.toFixed(1)}% complete
                            </div>
                        </button>
                    )
                })}
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
    const monitor = useQuery(api.settings.getProjectActivity, { workspaceId }) as ActivityMonitor | undefined
    const [selectedDivisionId, setSelectedDivisionId] = React.useState<string | null>(null)
    const [hoverIndex, setHoverIndex] = React.useState<number | null>(null)

    const divisions = monitor?.divisions ?? []
    const sortedDivisions = React.useMemo(
        () =>
            divisions
                .slice()
                .sort((left, right) => right.riskScore - left.riskScore || left.name.localeCompare(right.name)),
        [divisions]
    )

    React.useEffect(() => {
        if (sortedDivisions.length === 0) return
        if (selectedDivisionId && sortedDivisions.some((division) => division.id === selectedDivisionId)) return
        setSelectedDivisionId(sortedDivisions[0].id)
    }, [selectedDivisionId, sortedDivisions])

    const selectedDivision = sortedDivisions.find((division) => division.id === selectedDivisionId) ?? sortedDivisions[0] ?? null
    const pointCount = divisions[0]?.progressSeries.length ?? 0
    const activeIndex = hoverIndex ?? Math.max(pointCount - 1, 0)

    const openDivision = React.useCallback((divisionId: string, taskId?: string | null) => {
        const href = taskId
            ? `/dashboard/projects/${divisionId}?task=${taskId}`
            : `/dashboard/projects/${divisionId}`
        pushProjectRoute(href, divisionId)
    }, [pushProjectRoute])

    if (monitor === undefined) {
        return (
            <section className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            </section>
        )
    }

    if (divisions.length === 0) {
        return (
            <section className="border border-border rounded-lg p-4">
                <h2 className="text-sm font-medium">Division Intelligence</h2>
                <p className="mt-3 text-xs text-muted-foreground">No active divisions found.</p>
            </section>
        )
    }

    return (
        <section className="border border-border rounded-lg p-4 bg-card/60">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        Division Intelligence
                    </div>
                    <h2 className="mt-1 text-lg font-semibold">Progress over time, queue pressure, and reversals</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        The overlay shows cumulative completions across all divisions. The rest of the panel only surfaces pace misses,
                        blocked work, review aging, stale tasks, and backward movement.
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <StatChip icon={<Target className="h-3.5 w-3.5" />} label="Behind Plan" value={monitor.summary.behindPlanCount} />
                    <StatChip icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Blocked" value={monitor.summary.blockedTasks} />
                    <StatChip icon={<Clock3 className="h-3.5 w-3.5" />} label="Stale" value={monitor.summary.staleTasks} />
                    <StatChip icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Overdue" value={monitor.summary.overdueTasks} />
                    <StatChip icon={<GitPullRequestArrow className="h-3.5 w-3.5" />} label="Rework 14d" value={monitor.summary.reworkEvents14d} />
                </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
                <OverlayChart
                    divisions={divisions}
                    selectedDivision={selectedDivision}
                    activeIndex={activeIndex}
                    onActiveIndexChange={setHoverIndex}
                    onSelectDivision={setSelectedDivisionId}
                />

                <div className="space-y-4">
                    {selectedDivision && (
                        <div className="rounded-lg border bg-background/80 p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: selectedDivision.color }} />
                                        <h3 className="truncate text-sm font-semibold">{selectedDivision.name}</h3>
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Current state, not vanity activity. Updated {formatRelativeTime(selectedDivision.lastActivityAt)}.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => openDivision(selectedDivision.id)}
                                    onMouseEnter={() => void prefetchProjectRoute(selectedDivision.id)}
                                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted/50"
                                >
                                    Open
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </button>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <MetricBox
                                    label="Done Now"
                                    value={`${selectedDivision.completedTasks}/${selectedDivision.totalTasks}`}
                                    detail={`${selectedDivision.totalTasks > 0 ? Math.round((selectedDivision.completedTasks / selectedDivision.totalTasks) * 100) : 0}% of current scope`}
                                />
                                <MetricBox label="Throughput 7d" value={selectedDivision.completedLast7d} detail="Tasks approved in the last week" />
                                <MetricBox
                                    label="Review Queue"
                                    value={selectedDivision.inReviewCount}
                                    detail={
                                        selectedDivision.oldestReviewDays !== null
                                            ? `Oldest item has waited ${selectedDivision.oldestReviewDays}d`
                                            : "No waiting review items"
                                    }
                                    tone={selectedDivision.oldestReviewDays !== null && selectedDivision.oldestReviewDays >= 3 ? "warning" : "default"}
                                />
                                <MetricBox
                                    label="Blocked"
                                    value={selectedDivision.blockedCount}
                                    detail="Open or acknowledged help requests"
                                    tone={selectedDivision.blockedCount > 0 ? "warning" : "default"}
                                />
                                <MetricBox
                                    label="Stale"
                                    value={selectedDivision.staleCount}
                                    detail="Active tasks untouched for 7+ days"
                                    tone={selectedDivision.staleCount > 0 ? "warning" : "default"}
                                />
                                <MetricBox
                                    label="Rework 14d"
                                    value={selectedDivision.reworkCount14d}
                                    detail="Backward status moves"
                                    tone={selectedDivision.reworkCount14d > 0 ? "critical" : "default"}
                                />
                            </div>

                            <div className="mt-3 rounded-lg border bg-muted/30 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Pace Vs Plan</div>
                                        <div className="mt-1 text-sm font-medium">
                                            {selectedDivision.scheduleDeltaPct === null
                                                ? "No scheduled pushes with dates"
                                                : `${formatDelta(selectedDivision.scheduleDeltaPct)} against current push plan`}
                                        </div>
                                    </div>
                                    {selectedDivision.scheduleDeltaPct !== null && (
                                        <span
                                            className={cn(
                                                "rounded-md px-2 py-1 text-xs font-medium",
                                                selectedDivision.scheduleDeltaPct <= -10 && "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
                                                selectedDivision.scheduleDeltaPct > -10 && selectedDivision.scheduleDeltaPct < 5 && "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
                                                selectedDivision.scheduleDeltaPct >= 5 && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                            )}
                                        >
                                            {formatDelta(selectedDivision.scheduleDeltaPct)}
                                        </span>
                                    )}
                                </div>
                                {selectedDivision.actualPlannedPct !== null && selectedDivision.expectedPlannedPct !== null && (
                                    <div className="mt-2 text-xs text-muted-foreground">
                                        Actual: {selectedDivision.actualPlannedPct.toFixed(1)}% | Planned: {selectedDivision.expectedPlannedPct.toFixed(1)}%
                                    </div>
                                )}
                            </div>

                            {selectedDivision.signals.length > 0 && (
                                <div className="mt-3 border-t pt-3">
                                    <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Division Signals</div>
                                    <div className="mt-2 space-y-2">
                                        {selectedDivision.signals.slice(0, 3).map((signal) => {
                                            const tone = signalTone(signal.severity)
                                            return (
                                                <button
                                                    key={signal.id}
                                                    type="button"
                                                    onClick={() => openDivision(signal.projectId, signal.taskId)}
                                                    onMouseEnter={() => void prefetchProjectRoute(signal.projectId)}
                                                    className={cn(
                                                        "w-full rounded-lg border px-3 py-2 text-left transition-colors hover:bg-background",
                                                        tone.border,
                                                        tone.bg
                                                    )}
                                                >
                                                    <div className={cn("text-xs font-semibold", tone.text)}>{signal.headline}</div>
                                                    <div className="mt-1 text-[11px] text-muted-foreground">{signal.detail}</div>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="rounded-lg border bg-background/80 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Division Stack</div>
                                <div className="mt-1 text-sm font-medium">Ranked by attention needed</div>
                            </div>
                            <div className="text-[11px] text-muted-foreground">risk = pace + blocked + stale + rework</div>
                        </div>

                        <div className="mt-3 space-y-2">
                            {sortedDivisions.map((division) => {
                                const isSelected = division.id === selectedDivision?.id
                                const livePct = division.progressSeries[activeIndex]?.completedPct ?? 0
                                const currentPct = division.totalTasks > 0 ? (division.completedTasks / division.totalTasks) * 100 : 0

                                return (
                                    <div
                                        key={division.id}
                                        className={cn(
                                            "rounded-lg border px-3 py-2 transition-colors",
                                            isSelected ? "border-foreground/20 bg-muted/40" : "border-border bg-background/60"
                                        )}
                                        onMouseEnter={() => void prefetchProjectRoute(division.id)}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedDivisionId(division.id)}
                                                className="min-w-0 flex-1 text-left"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: division.color }} />
                                                    <span className="truncate text-sm font-medium">{division.name}</span>
                                                </div>
                                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                                    <span>{livePct.toFixed(1)}% cumulative</span>
                                                    <span>{currentPct.toFixed(0)}% done now</span>
                                                    <span>{division.blockedCount} blocked</span>
                                                    <span>{division.staleCount} stale</span>
                                                    <span>{formatDelta(division.scheduleDeltaPct)}</span>
                                                </div>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => openDivision(division.id)}
                                                className="rounded-md border p-1.5 hover:bg-muted/50"
                                                aria-label={`Open ${division.name}`}
                                            >
                                                <ArrowRight className="h-3.5 w-3.5" />
                                            </button>
                                        </div>

                                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                                            <div
                                                className="h-full rounded-full"
                                                style={{ width: `${Math.max(currentPct, 2)}%`, backgroundColor: division.color }}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-4 rounded-lg border bg-background/80 p-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Signal Feed</div>
                        <div className="mt-1 text-sm font-medium">Meaningful changes only</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                        Generated {formatRelativeTime(monitor.generatedAt)} from blockers, pace misses, rework, and review movement.
                    </div>
                </div>

                {monitor.signals.length === 0 ? (
                    <div className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        No material signals right now.
                    </div>
                ) : (
                    <div className="mt-3 grid gap-2 lg:grid-cols-2">
                        {monitor.signals.map((signal) => {
                            const tone = signalTone(signal.severity)

                            return (
                                <button
                                    key={signal.id}
                                    type="button"
                                    onClick={() => openDivision(signal.projectId, signal.taskId)}
                                    onMouseEnter={() => void prefetchProjectRoute(signal.projectId)}
                                    className={cn(
                                        "rounded-lg border px-3 py-3 text-left transition-colors hover:bg-background",
                                        tone.border,
                                        tone.bg
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className={cn("text-xs font-semibold", tone.text)}>{signal.headline}</div>
                                            <div className="mt-1 text-[11px] text-muted-foreground">{signal.detail}</div>
                                        </div>
                                        <div className="shrink-0 text-[11px] text-muted-foreground">
                                            {formatRelativeTime(signal.createdAt)}
                                        </div>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>
        </section>
    )
}
