import prisma from '@/lib/prisma'

export type WorkloadStatus = 'struggling' | 'on-track' | 'available'

export type WorkloadConfig = {
    lookbackDays: number
    minCompletedTasks: number
    baseline: {
        defaultCycleDays: number
        defaultThroughputPerWeek: number
        minCycleDays: number
        maxCycleDays: number
    }
    capacity: {
        wipMultiplier: number
        minWip: number
        maxWip: number
        availableLoadRatio: number
        overloadLoadRatio: number
        overloadMinTasks: number
    }
    thresholds: {
        dueSoonDays: number
        stuckDays: number
        reviewStaleDays: number
        agingMultiplier: number
        progressLagPercent: number
    }
    weights: {
        overdue: number
        stuck: number
        help: number
        dueSoon: number
        age: number
        progress: number
        review: number
        load: number
    }
    status: {
        strugglingScore: number
        criticalOverdueCount: number
        criticalHelpCount: number
        criticalStuckCount: number
        availableRequiresNoRisk: boolean
    }
}

export const DEFAULT_WORKLOAD_CONFIG: WorkloadConfig = {
    lookbackDays: 90,
    minCompletedTasks: 5,
    baseline: {
        defaultCycleDays: 5,
        defaultThroughputPerWeek: 2,
        minCycleDays: 1,
        maxCycleDays: 30
    },
    capacity: {
        wipMultiplier: 1,
        minWip: 1,
        maxWip: 8,
        availableLoadRatio: 0.5,
        overloadLoadRatio: 1.35,
        overloadMinTasks: 3
    },
    thresholds: {
        dueSoonDays: 3,
        stuckDays: 3,
        reviewStaleDays: 3,
        agingMultiplier: 1.5,
        progressLagPercent: 20
    },
    weights: {
        overdue: 4,
        stuck: 2,
        help: 2,
        dueSoon: 1,
        age: 1,
        progress: 1,
        review: 1,
        load: 1
    },
    status: {
        strugglingScore: 4,
        criticalOverdueCount: 1,
        criticalHelpCount: 1,
        criticalStuckCount: 2,
        availableRequiresNoRisk: true
    }
}

export type WorkloadTask = {
    id: string
    title: string
    columnName: string
    columnId: string | null
    projectId: string
    projectName: string
    projectColor: string
    pushId: string | null
    pushName: string | null
    assigneeIds: string[]
    dueDate: Date | null
    startDate: Date | null
    createdAt: Date
    updatedAt: Date
    submittedAt: Date | null
    approvedAt: Date | null
    progress: number
    enableProgress: boolean
    helpRequestCount: number
    lastActivityAt: Date | null
    daysSinceActivity: number | null
    isOverdue: boolean
    daysUntilDue: number | null
    isStuck: boolean
    isBlockedByHelp: boolean
    isUnassigned: boolean
    isReviewStale: boolean
    checklistTotal: number
    checklistCompleted: number
}

export type WorkloadUser = {
    id: string
    name: string
    avatar: string | null
    role: string
}

export type WorkloadUserStat = {
    id: string
    name: string
    avatar: string | null
    role: string
    totalTasks: number
    activeTasks: number
    todoTasks: number
    inProgressTasks: number
    reviewTasks: number
    doneTasks: number
    overdueTasks: number
    stuckTasks: number
    helpRequestTasks: number
    dueSoonTasks: number
    reviewStaleTasks: number
    progressLagTasks: number
    agingTasks: number
    workloadScore: number
    loadRatio: number
    expectedWip: number
    medianCycleDays: number
    throughputPerWeek: number
    status: WorkloadStatus
    tasks: WorkloadTask[]
}

type WorkloadTaskInput = {
    id: string
    title: string
    columnId?: string | null
    assigneeId?: string | null
    assignees?: Array<{ userId?: string | null; user?: { id?: string | null } | null }> | null
    column?: {
        name?: string | null
        board?: {
            project?: {
                id?: string | null
                name?: string | null
                color?: string | null
            } | null
        } | null
    } | null
    push?: { id?: string | null; name?: string | null } | null
    dueDate?: Date | null
    endDate?: Date | null
    startDate?: Date | null
    createdAt: Date
    updatedAt: Date
    submittedAt?: Date | null
    approvedAt?: Date | null
    progress?: number | null
    enableProgress?: boolean | null
    helpRequests?: Array<unknown> | null
    activityLogs?: Array<{ createdAt?: Date | null }> | null
    checklistItems?: Array<{ completed?: boolean | null }> | null
}

const DAY_MS = 1000 * 60 * 60 * 24

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const toNumber = (value: unknown, fallback: number) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    return fallback
}

const toInt = (value: unknown, fallback: number) => Math.round(toNumber(value, fallback))

export const mergeWorkloadConfig = (base: WorkloadConfig, patch?: Partial<WorkloadConfig> | null) => {
    if (!patch || !isRecord(patch)) return base
    const thresholds = isRecord(patch.thresholds) ? patch.thresholds : {}
    const weights = isRecord(patch.weights) ? patch.weights : {}
    const capacity = isRecord(patch.capacity) ? patch.capacity : {}
    const baseline = isRecord(patch.baseline) ? patch.baseline : {}
    const status = isRecord(patch.status) ? patch.status : {}

    return {
        ...base,
        lookbackDays: patch.lookbackDays ?? base.lookbackDays,
        minCompletedTasks: patch.minCompletedTasks ?? base.minCompletedTasks,
        baseline: { ...base.baseline, ...baseline },
        capacity: { ...base.capacity, ...capacity },
        thresholds: { ...base.thresholds, ...thresholds },
        weights: { ...base.weights, ...weights },
        status: { ...base.status, ...status }
    }
}

export const normalizeWorkloadConfig = (config?: Partial<WorkloadConfig> | null): WorkloadConfig => {
    const merged = mergeWorkloadConfig(DEFAULT_WORKLOAD_CONFIG, config)

    const minCycleDays = clamp(
        toNumber(merged.baseline.minCycleDays, DEFAULT_WORKLOAD_CONFIG.baseline.minCycleDays),
        0.5,
        14
    )
    const maxCycleDays = Math.max(
        minCycleDays,
        clamp(
            toNumber(merged.baseline.maxCycleDays, DEFAULT_WORKLOAD_CONFIG.baseline.maxCycleDays),
            7,
            120
        )
    )
    const minWip = clamp(
        toNumber(merged.capacity.minWip, DEFAULT_WORKLOAD_CONFIG.capacity.minWip),
        0.5,
        10
    )
    const maxWip = Math.max(
        minWip,
        clamp(toNumber(merged.capacity.maxWip, DEFAULT_WORKLOAD_CONFIG.capacity.maxWip), 2, 20)
    )

    return {
        lookbackDays: clamp(toInt(merged.lookbackDays, DEFAULT_WORKLOAD_CONFIG.lookbackDays), 14, 365),
        minCompletedTasks: clamp(toInt(merged.minCompletedTasks, DEFAULT_WORKLOAD_CONFIG.minCompletedTasks), 1, 50),
        baseline: {
            defaultCycleDays: clamp(
                toNumber(merged.baseline.defaultCycleDays, DEFAULT_WORKLOAD_CONFIG.baseline.defaultCycleDays),
                1,
                60
            ),
            defaultThroughputPerWeek: clamp(
                toNumber(merged.baseline.defaultThroughputPerWeek, DEFAULT_WORKLOAD_CONFIG.baseline.defaultThroughputPerWeek),
                0.1,
                20
            ),
            minCycleDays,
            maxCycleDays
        },
        capacity: {
            wipMultiplier: clamp(
                toNumber(merged.capacity.wipMultiplier, DEFAULT_WORKLOAD_CONFIG.capacity.wipMultiplier),
                0.5,
                3
            ),
            minWip,
            maxWip,
            availableLoadRatio: clamp(
                toNumber(merged.capacity.availableLoadRatio, DEFAULT_WORKLOAD_CONFIG.capacity.availableLoadRatio),
                0.1,
                1
            ),
            overloadLoadRatio: clamp(
                toNumber(merged.capacity.overloadLoadRatio, DEFAULT_WORKLOAD_CONFIG.capacity.overloadLoadRatio),
                1,
                3
            ),
            overloadMinTasks: clamp(
                toInt(merged.capacity.overloadMinTasks, DEFAULT_WORKLOAD_CONFIG.capacity.overloadMinTasks),
                1,
                10
            )
        },
        thresholds: {
            dueSoonDays: clamp(
                toInt(merged.thresholds.dueSoonDays, DEFAULT_WORKLOAD_CONFIG.thresholds.dueSoonDays),
                1,
                14
            ),
            stuckDays: clamp(
                toInt(merged.thresholds.stuckDays, DEFAULT_WORKLOAD_CONFIG.thresholds.stuckDays),
                1,
                14
            ),
            reviewStaleDays: clamp(
                toInt(merged.thresholds.reviewStaleDays, DEFAULT_WORKLOAD_CONFIG.thresholds.reviewStaleDays),
                1,
                21
            ),
            agingMultiplier: clamp(
                toNumber(merged.thresholds.agingMultiplier, DEFAULT_WORKLOAD_CONFIG.thresholds.agingMultiplier),
                1,
                5
            ),
            progressLagPercent: clamp(
                toInt(merged.thresholds.progressLagPercent, DEFAULT_WORKLOAD_CONFIG.thresholds.progressLagPercent),
                5,
                80
            )
        },
        weights: {
            overdue: clamp(toNumber(merged.weights.overdue, DEFAULT_WORKLOAD_CONFIG.weights.overdue), 0, 10),
            stuck: clamp(toNumber(merged.weights.stuck, DEFAULT_WORKLOAD_CONFIG.weights.stuck), 0, 10),
            help: clamp(toNumber(merged.weights.help, DEFAULT_WORKLOAD_CONFIG.weights.help), 0, 10),
            dueSoon: clamp(toNumber(merged.weights.dueSoon, DEFAULT_WORKLOAD_CONFIG.weights.dueSoon), 0, 10),
            age: clamp(toNumber(merged.weights.age, DEFAULT_WORKLOAD_CONFIG.weights.age), 0, 10),
            progress: clamp(toNumber(merged.weights.progress, DEFAULT_WORKLOAD_CONFIG.weights.progress), 0, 10),
            review: clamp(toNumber(merged.weights.review, DEFAULT_WORKLOAD_CONFIG.weights.review), 0, 10),
            load: clamp(toNumber(merged.weights.load, DEFAULT_WORKLOAD_CONFIG.weights.load), 0, 10)
        },
        status: {
            strugglingScore: clamp(
                toNumber(merged.status.strugglingScore, DEFAULT_WORKLOAD_CONFIG.status.strugglingScore),
                0,
                20
            ),
            criticalOverdueCount: clamp(
                toInt(merged.status.criticalOverdueCount, DEFAULT_WORKLOAD_CONFIG.status.criticalOverdueCount),
                0,
                10
            ),
            criticalHelpCount: clamp(
                toInt(merged.status.criticalHelpCount, DEFAULT_WORKLOAD_CONFIG.status.criticalHelpCount),
                0,
                10
            ),
            criticalStuckCount: clamp(
                toInt(merged.status.criticalStuckCount, DEFAULT_WORKLOAD_CONFIG.status.criticalStuckCount),
                0,
                10
            ),
            availableRequiresNoRisk:
                typeof merged.status.availableRequiresNoRisk === 'boolean'
                    ? merged.status.availableRequiresNoRisk
                    : DEFAULT_WORKLOAD_CONFIG.status.availableRequiresNoRisk
        }
    }
}

export async function getWorkloadConfig(workspaceId: string): Promise<WorkloadConfig> {
    const record = await prisma.workloadConfig.findUnique({
        where: { workspaceId },
        select: { config: true }
    })

    return normalizeWorkloadConfig(record?.config as Partial<WorkloadConfig> | undefined)
}

const median = (values: number[]) => {
    if (values.length === 0) return null
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2
    }
    return sorted[mid]
}

const getCycleDays = (task: WorkloadTask, config: WorkloadConfig) => {
    if (!task.approvedAt) return null
    const start = task.startDate ?? task.createdAt
    if (!start) return null
    const diffDays = (task.approvedAt.getTime() - start.getTime()) / DAY_MS
    if (!Number.isFinite(diffDays) || diffDays <= 0) return null
    return clamp(diffDays, config.baseline.minCycleDays, config.baseline.maxCycleDays)
}

const getAssigneeIds = (task: WorkloadTaskInput) => {
    const ids = new Set<string>()
    if (task.assigneeId) ids.add(task.assigneeId)
    if (Array.isArray(task.assignees)) {
        for (const assignee of task.assignees) {
            const id = assignee?.userId ?? assignee?.user?.id
            if (id) ids.add(id)
        }
    }
    return Array.from(ids)
}

export const buildWorkloadTasks = (
    tasks: WorkloadTaskInput[],
    now: Date,
    config: WorkloadConfig
): WorkloadTask[] => {
    return tasks.map(task => {
        const assigneeIds = getAssigneeIds(task)
        const columnName = task.column?.name || 'Unknown'
        const dueDate = task.dueDate ?? task.endDate ?? null
        const lastActivityAt =
            task.activityLogs?.[0]?.createdAt ?? task.updatedAt ?? task.createdAt ?? null
        const daysSinceActivity = lastActivityAt
            ? Math.floor((now.getTime() - new Date(lastActivityAt).getTime()) / DAY_MS)
            : null
        const daysUntilDue = dueDate
            ? Math.ceil((new Date(dueDate).getTime() - now.getTime()) / DAY_MS)
            : null
        const isOverdue = dueDate && columnName !== 'Done' ? new Date(dueDate) < now : false
        const isStuck =
            columnName === 'In Progress' &&
            daysSinceActivity !== null &&
            daysSinceActivity >= config.thresholds.stuckDays
        const helpRequestCount = task.helpRequests?.length ?? 0
        const isBlockedByHelp = helpRequestCount > 0
        const isUnassigned = assigneeIds.length === 0 && columnName !== 'Done'
        const isReviewStale = Boolean(
            columnName === 'Review' &&
            task.submittedAt &&
            Math.floor((now.getTime() - new Date(task.submittedAt).getTime()) / DAY_MS) >=
                config.thresholds.reviewStaleDays
        )
        const checklistItems = task.checklistItems ?? []

        return {
            id: task.id,
            title: task.title,
            columnName,
            columnId: task.columnId ?? null,
            projectId: task.column?.board?.project?.id || '',
            projectName: task.column?.board?.project?.name || '',
            projectColor: task.column?.board?.project?.color || '#6b7280',
            pushId: task.push?.id || null,
            pushName: task.push?.name || null,
            assigneeIds,
            dueDate,
            startDate: task.startDate ?? null,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
            submittedAt: task.submittedAt ?? null,
            approvedAt: task.approvedAt ?? null,
            progress: typeof task.progress === 'number' ? task.progress : 0,
            enableProgress: Boolean(task.enableProgress),
            helpRequestCount,
            lastActivityAt: lastActivityAt ? new Date(lastActivityAt) : null,
            daysSinceActivity,
            isOverdue,
            daysUntilDue,
            isStuck,
            isBlockedByHelp,
            isUnassigned,
            isReviewStale,
            checklistTotal: checklistItems.length,
            checklistCompleted: checklistItems.filter((item) => item?.completed).length
        }
    })
}

export const computeWorkloadStats = (
    users: WorkloadUser[],
    tasks: WorkloadTask[],
    config: WorkloadConfig,
    now: Date
) => {
    const lookbackStart = new Date(now.getTime() - config.lookbackDays * DAY_MS)
    const lookbackWeeks = config.lookbackDays / 7

    const workspaceCompleted = tasks.filter(task => {
        if (!task.approvedAt) return false
        if (task.assigneeIds.length === 0) return false
        return task.approvedAt >= lookbackStart
    })

    const workspaceCycleDays = workspaceCompleted
        .map(task => getCycleDays(task, config))
        .filter((value): value is number => value !== null)

    const workspaceMedianCycleDays =
        median(workspaceCycleDays) ?? config.baseline.defaultCycleDays
    const workspaceThroughput =
        workspaceCompleted.length > 0
            ? workspaceCompleted.length / lookbackWeeks / Math.max(users.length, 1)
            : config.baseline.defaultThroughputPerWeek

    const userStats = users.map(user => {
        const userTasks = tasks.filter(task => task.assigneeIds.includes(user.id))
        const activeTasks = userTasks.filter(task => task.columnName !== 'Done')
        const todoTasks = activeTasks.filter(task => task.columnName === 'To Do').length
        const inProgressTasks = activeTasks.filter(task => task.columnName === 'In Progress').length
        const reviewTasks = activeTasks.filter(task => task.columnName === 'Review').length
        const doneTasks = userTasks.filter(task => task.columnName === 'Done').length
        const overdueTasks = activeTasks.filter(task => task.isOverdue).length
        const stuckTasks = activeTasks.filter(task => task.isStuck).length
        const helpRequestTasks = activeTasks.filter(task => task.isBlockedByHelp).length
        const dueSoonTasks = activeTasks.filter(
            task =>
                task.daysUntilDue !== null &&
                task.daysUntilDue >= 0 &&
                task.daysUntilDue <= config.thresholds.dueSoonDays
        ).length
        const reviewStaleTasks = activeTasks.filter(task => task.isReviewStale).length

        const completedInWindow = userTasks.filter(task => {
            if (!task.approvedAt) return false
            return task.approvedAt >= lookbackStart
        })

        const cycleDays = completedInWindow
            .map(task => getCycleDays(task, config))
            .filter((value): value is number => value !== null)

        const completionUnits = completedInWindow.reduce((acc, task) => {
            const share = task.assigneeIds.length > 0 ? 1 / task.assigneeIds.length : 0
            return acc + share
        }, 0)

        const userThroughput = completionUnits > 0 ? completionUnits / lookbackWeeks : 0
        const hasUserBaseline = cycleDays.length >= config.minCompletedTasks

        const medianCycleDays = hasUserBaseline
            ? (median(cycleDays) ?? workspaceMedianCycleDays)
            : workspaceMedianCycleDays

        const throughputPerWeek = hasUserBaseline
            ? userThroughput || config.baseline.defaultThroughputPerWeek
            : workspaceThroughput || config.baseline.defaultThroughputPerWeek

        const expectedWipRaw =
            throughputPerWeek * (medianCycleDays / 7) * config.capacity.wipMultiplier
        const expectedWip = clamp(expectedWipRaw, config.capacity.minWip, config.capacity.maxWip)

        const activeLoad = activeTasks.reduce((acc, task) => {
            const share = task.assigneeIds.length > 0 ? 1 / task.assigneeIds.length : 0
            return acc + share
        }, 0)

        const loadRatio = expectedWip > 0 ? activeLoad / expectedWip : activeLoad

        const progressLagTasks = activeTasks.filter(task => {
            if (!task.enableProgress) return false
            if (!task.startDate || !task.dueDate) return false
            const duration = task.dueDate.getTime() - task.startDate.getTime()
            if (duration <= 0) return false
            const elapsed = clamp(now.getTime() - task.startDate.getTime(), 0, duration)
            const expectedProgress = (elapsed / duration) * 100
            return expectedProgress - task.progress >= config.thresholds.progressLagPercent
        }).length

        const agingTasks = activeTasks.filter(task => {
            const start = task.startDate ?? task.createdAt
            const ageDays = (now.getTime() - start.getTime()) / DAY_MS
            return ageDays >= medianCycleDays * config.thresholds.agingMultiplier
        }).length

        const riskScore =
            overdueTasks * config.weights.overdue +
            stuckTasks * config.weights.stuck +
            helpRequestTasks * config.weights.help +
            dueSoonTasks * config.weights.dueSoon +
            reviewStaleTasks * config.weights.review +
            progressLagTasks * config.weights.progress +
            agingTasks * config.weights.age

        const workloadScore = Number((loadRatio * config.weights.load + riskScore).toFixed(2))

        const hasCriticalSignal =
            (config.status.criticalOverdueCount > 0 && overdueTasks >= config.status.criticalOverdueCount) ||
            (config.status.criticalHelpCount > 0 && helpRequestTasks >= config.status.criticalHelpCount) ||
            (config.status.criticalStuckCount > 0 && stuckTasks >= config.status.criticalStuckCount)

        const isOverloaded =
            loadRatio >= config.capacity.overloadLoadRatio &&
            activeTasks.length >= config.capacity.overloadMinTasks

        const isAvailable =
            activeTasks.length === 0 ||
            (loadRatio <= config.capacity.availableLoadRatio &&
                (!config.status.availableRequiresNoRisk || riskScore === 0))

        const isStruggling =
            hasCriticalSignal ||
            riskScore >= config.status.strugglingScore ||
            (isOverloaded && (riskScore > 0 || dueSoonTasks > 0))

        const status: WorkloadStatus = isStruggling
            ? 'struggling'
            : isAvailable
                ? 'available'
                : 'on-track'

        return {
            id: user.id,
            name: user.name,
            avatar: user.avatar,
            role: user.role,
            totalTasks: userTasks.length,
            activeTasks: activeTasks.length,
            todoTasks,
            inProgressTasks,
            reviewTasks,
            doneTasks,
            overdueTasks,
            stuckTasks,
            helpRequestTasks,
            dueSoonTasks,
            reviewStaleTasks,
            progressLagTasks,
            agingTasks,
            workloadScore,
            loadRatio: Number(loadRatio.toFixed(2)),
            expectedWip: Number(expectedWip.toFixed(2)),
            medianCycleDays: Number(medianCycleDays.toFixed(2)),
            throughputPerWeek: Number(throughputPerWeek.toFixed(2)),
            status,
            tasks: userTasks
        }
    })

    const overloadedUsers = userStats
        .filter(stat => stat.loadRatio >= config.capacity.overloadLoadRatio && stat.activeTasks >= config.capacity.overloadMinTasks)
        .map(stat => stat.id)

    const idleUsers = userStats
        .filter(stat => stat.activeTasks === 0)
        .map(stat => stat.id)

    return { userStats, overloadedUsers, idleUsers }
}
