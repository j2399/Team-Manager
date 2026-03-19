import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { createLegacyId, getUserByLegacyId, getWorkspaceByLegacyId, stripDoc } from "./lib"
import { getBoardForProject, getColumnsForBoard, getProjectTasks, getPushesForProject } from "./boardData"

async function getActiveWorkspaceProjects(ctx: any, workspaceId: string) {
    const projects = await ctx.db
        .query("projects")
        .withIndex("by_workspaceId", (q: any) => q.eq("workspaceId", workspaceId))
        .collect()

    return projects
        .filter((project: any) => !project.archivedAt)
        .sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || a.name.localeCompare(b.name))
}

async function getProjectTaskSet(ctx: any, projectId: string) {
    const taskMap = new Map<string, any>()

    const columnTasks = await getProjectTasks(ctx, projectId)
    for (const task of columnTasks) {
        taskMap.set(task.id, task)
    }

    const pushes = await getPushesForProject(ctx, projectId)
    for (const push of pushes) {
        const pushTasks = await ctx.db
            .query("tasks")
            .withIndex("by_pushId", (q: any) => q.eq("pushId", push.id))
            .collect()

        for (const task of pushTasks) {
            taskMap.set(task.id, task)
        }
    }

    return Array.from(taskMap.values())
}

async function getWorkspaceProjectTaskSet(ctx: any, workspaceId: string) {
    const projects = await getActiveWorkspaceProjects(ctx, workspaceId)
    const taskMap = new Map<string, any>()

    for (const project of projects) {
        const tasks = await getProjectTaskSet(ctx, project.id)
        for (const task of tasks) {
            taskMap.set(task.id, task)
        }
    }

    return {
        projects,
        tasks: Array.from(taskMap.values()),
    }
}

const DAY_MS = 24 * 60 * 60 * 1000
const MONITOR_WINDOW_DAYS = 42
const STALE_TASK_DAYS = 7
const REVIEW_STALE_DAYS = 3
const REWORK_WINDOW_DAYS = 14
const BEHIND_PLAN_PCT = 10

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

function isTaskDone(task: { columnId?: string | null; approvedAt?: number | null }, doneColumnIds: Set<string>) {
    return Boolean((task.columnId && doneColumnIds.has(task.columnId)) || typeof task.approvedAt === "number")
}

function normalizeColumnName(name?: string | null) {
    return (name ?? "").trim().toLowerCase()
}

function getStatusRank(name?: string | null) {
    const normalized = normalizeColumnName(name)
    if (normalized === "done") return 3
    if (normalized === "review") return 2
    if (normalized === "in progress") return 1
    if (normalized === "to do" || normalized === "todo") return 0
    return -1
}

function isBackwardStatusTransition(oldValue?: string | null, newValue?: string | null) {
    const oldRank = getStatusRank(oldValue)
    const newRank = getStatusRank(newValue)
    return oldRank >= 0 && newRank >= 0 && newRank < oldRank
}

function severityRank(severity: "critical" | "warning" | "info") {
    if (severity === "critical") return 3
    if (severity === "warning") return 2
    return 1
}

function buildCumulativeApprovalSeries(tasks: any[], windowStart: number, windowDays: number) {
    const total = tasks.length
    const dailyCounts = Array.from({ length: windowDays }, () => 0)

    for (const task of tasks) {
        if (typeof task.approvedAt !== "number") continue

        const approvedDay = startOfUtcDay(task.approvedAt)
        if (approvedDay <= windowStart) {
            dailyCounts[0] += 1
            continue
        }

        const index = Math.floor((approvedDay - windowStart) / DAY_MS)
        if (index >= 0 && index < windowDays) {
            dailyCounts[index] += 1
        }
    }

    let cumulative = 0

    return dailyCounts.map((count, index) => {
        cumulative += count

        return {
            date: new Date(windowStart + index * DAY_MS).toISOString(),
            completedPct: total > 0 ? roundToTenths((cumulative / total) * 100) : 0,
        }
    })
}

function buildExpectedSeries(
    pushWeights: Array<{ startDate: number; endDate: number; taskCount: number }>,
    windowStart: number,
    windowDays: number
) {
    const totalWeightedTasks = pushWeights.reduce((sum, push) => sum + push.taskCount, 0)
    if (totalWeightedTasks === 0) return []

    return Array.from({ length: windowDays }, (_, index) => {
        const dayEnd = windowStart + index * DAY_MS + DAY_MS - 1
        let weightedCompletion = 0

        for (const push of pushWeights) {
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

function buildSignalFromLog(log: any, project: { id: string; name: string }) {
    const createdAt = new Date(log.createdAt).toISOString()
    const taskTitle = log.taskTitle ?? "Untitled task"

    if (log.action === "help_requested") {
        return {
            id: `signal-${project.id}-${log.id}`,
            kind: "help",
            severity: "critical" as const,
            headline: `${project.name}: help requested`,
            detail: `${taskTitle} needs intervention.`,
            createdAt,
            projectId: project.id,
            taskId: log.taskId ?? null,
            taskTitle,
        }
    }

    if (log.action === "help_acknowledged") {
        return {
            id: `signal-${project.id}-${log.id}`,
            kind: "help_acknowledged",
            severity: "info" as const,
            headline: `${project.name}: help acknowledged`,
            detail: `${taskTitle} now has an owner on the issue.`,
            createdAt,
            projectId: project.id,
            taskId: log.taskId ?? null,
            taskTitle,
        }
    }

    if (log.action === "help_resolved") {
        return {
            id: `signal-${project.id}-${log.id}`,
            kind: "help_resolved",
            severity: "info" as const,
            headline: `${project.name}: blocker resolved`,
            detail: `${taskTitle} is no longer blocked by a help request.`,
            createdAt,
            projectId: project.id,
            taskId: log.taskId ?? null,
            taskTitle,
        }
    }

    if (log.action === "deleted") {
        return {
            id: `signal-${project.id}-${log.id}`,
            kind: "deleted",
            severity: "warning" as const,
            headline: `${project.name}: task deleted`,
            detail: `${taskTitle} was removed from the flow.`,
            createdAt,
            projectId: project.id,
            taskId: log.taskId ?? null,
            taskTitle,
        }
    }

    if (log.action === "moved" && log.field === "status") {
        if (isBackwardStatusTransition(log.oldValue, log.newValue)) {
            return {
                id: `signal-${project.id}-${log.id}`,
                kind: "rework",
                severity: "warning" as const,
                headline: `${project.name}: work moved backward`,
                detail: `${taskTitle} moved from ${log.oldValue ?? "unknown"} to ${log.newValue ?? "unknown"}.`,
                createdAt,
                projectId: project.id,
                taskId: log.taskId ?? null,
                taskTitle,
            }
        }

        if (normalizeColumnName(log.newValue) === "review") {
            return {
                id: `signal-${project.id}-${log.id}`,
                kind: "review",
                severity: "info" as const,
                headline: `${project.name}: review queue changed`,
                detail: `${taskTitle} entered review.`,
                createdAt,
                projectId: project.id,
                taskId: log.taskId ?? null,
                taskTitle,
            }
        }
    }

    return null
}

export const getSubteams = query({
    args: {
        workspaceId: v.string(),
    },
    handler: async (ctx, args) => {
        const subteams = await ctx.db
            .query("subteams")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .collect()
        return subteams.map(stripDoc)
    },
})

export const getWorkspaceDriveConfig = query({
    args: {
        workspaceId: v.string(),
    },
    handler: async (ctx, args) => {
        const config = await ctx.db
            .query("workspaceDriveConfigs")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .unique()

        return config ? stripDoc(config) : null
    },
})

export const upsertWorkspaceDriveConfig = mutation({
    args: {
        workspaceId: v.string(),
        now: v.number(),
        provider: v.optional(v.string()),
        accessToken: v.optional(v.union(v.string(), v.null())),
        refreshToken: v.optional(v.union(v.string(), v.null())),
        tokenExpiry: v.optional(v.union(v.number(), v.null())),
        folderId: v.optional(v.union(v.string(), v.null())),
        folderName: v.optional(v.union(v.string(), v.null())),
        folderTree: v.optional(v.any()),
        folderTreeUpdatedAt: v.optional(v.union(v.number(), v.null())),
        connectedById: v.optional(v.union(v.string(), v.null())),
        connectedByName: v.optional(v.union(v.string(), v.null())),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("workspaceDriveConfigs")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .unique()

        const patch: Record<string, unknown> = {
            updatedAt: args.now,
        }

        if (args.provider !== undefined) patch.provider = args.provider
        if (args.accessToken !== undefined) patch.accessToken = args.accessToken ?? undefined
        if (args.refreshToken !== undefined) patch.refreshToken = args.refreshToken ?? undefined
        if (args.tokenExpiry !== undefined) patch.tokenExpiry = args.tokenExpiry ?? undefined
        if (args.folderId !== undefined) patch.folderId = args.folderId ?? undefined
        if (args.folderName !== undefined) patch.folderName = args.folderName ?? undefined
        if (args.folderTree !== undefined) patch.folderTree = args.folderTree
        if (args.folderTreeUpdatedAt !== undefined) patch.folderTreeUpdatedAt = args.folderTreeUpdatedAt ?? undefined
        if (args.connectedById !== undefined) patch.connectedById = args.connectedById ?? undefined
        if (args.connectedByName !== undefined) patch.connectedByName = args.connectedByName ?? undefined

        if (existing) {
            await ctx.db.patch(existing._id, patch)
            return { success: true, id: existing.id }
        }

        const created = {
            id: createLegacyId("workspace_drive_config"),
            workspaceId: args.workspaceId,
            provider: args.provider ?? "google",
            accessToken: args.accessToken ?? undefined,
            refreshToken: args.refreshToken ?? undefined,
            tokenExpiry: args.tokenExpiry ?? undefined,
            folderId: args.folderId ?? undefined,
            folderName: args.folderName ?? undefined,
            folderTree: args.folderTree,
            folderTreeUpdatedAt: args.folderTreeUpdatedAt ?? undefined,
            connectedById: args.connectedById ?? undefined,
            connectedByName: args.connectedByName ?? undefined,
            createdAt: args.now,
            updatedAt: args.now,
        }

        await ctx.db.insert("workspaceDriveConfigs", created)
        return { success: true, id: created.id }
    },
})

export const deleteWorkspaceDriveConfig = mutation({
    args: {
        workspaceId: v.string(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("workspaceDriveConfigs")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .unique()

        if (existing) {
            await ctx.db.delete(existing._id)
        }

        return { success: true }
    },
})

export const getWorkloadConfig = query({
    args: {
        workspaceId: v.string(),
    },
    handler: async (ctx, args) => {
        const config = await ctx.db
            .query("workloadConfigs")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .unique()

        return config ? stripDoc(config) : null
    },
})

export const upsertWorkloadConfig = mutation({
    args: {
        workspaceId: v.string(),
        config: v.any(),
        now: v.number(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("workloadConfigs")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .unique()

        if (existing) {
            await ctx.db.patch(existing._id, {
                config: args.config,
                updatedAt: args.now,
            })
            return { success: true }
        }

        await ctx.db.insert("workloadConfigs", {
            id: createLegacyId("workload_config"),
            workspaceId: args.workspaceId,
            config: args.config,
            createdAt: args.now,
            updatedAt: args.now,
        })

        return { success: true }
    },
})

export const getPageData = query({
    args: {
        workspaceId: v.string(),
    },
    handler: async (ctx, args) => {
        const [workspace, memberships, projects, driveConfig] = await Promise.all([
            getWorkspaceByLegacyId(ctx.db, args.workspaceId),
            ctx.db
                .query("workspaceMembers")
                .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
                .collect(),
            getActiveWorkspaceProjects(ctx, args.workspaceId),
            ctx.db
                .query("workspaceDriveConfigs")
                .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
                .unique(),
        ])

        const projectMemberships = await Promise.all(
            projects.map(async (project: any) => ({
                project,
                memberships: await ctx.db
                    .query("projectMembers")
                    .withIndex("by_projectId", (q) => q.eq("projectId", project.id))
                    .collect(),
            }))
        )

        const members = await Promise.all(
            memberships.map(async (membership: any) => {
                const user = await getUserByLegacyId(ctx.db, membership.userId)
                if (!user) return null

                return {
                    id: user.id,
                    name: membership.name || user.name,
                    email: user.email,
                    role: membership.role,
                    projectMemberships: projectMemberships
                        .filter(({ memberships }: any) => memberships.some((projectMembership: any) => projectMembership.userId === user.id))
                        .map(({ project }: any) => ({
                            project: {
                                id: project.id,
                                name: project.name,
                            },
                        })),
                }
            })
        )

        return {
            workspace: workspace
                ? {
                    id: workspace.id,
                    name: workspace.name,
                    inviteCode: workspace.inviteCode,
                    discordChannelId: workspace.discordChannelId ?? null,
                }
                : null,
            members: members
                .filter((member: any): member is NonNullable<typeof member> => member !== null)
                .sort((a: any, b: any) => a.name.localeCompare(b.name)),
            projects: projects.map((project: any) => ({
                id: project.id,
                name: project.name,
                color: project.color,
            })),
            driveConfig: driveConfig
                ? {
                    refreshToken: driveConfig.refreshToken ?? null,
                    folderId: driveConfig.folderId ?? null,
                    folderName: driveConfig.folderName ?? null,
                    connectedByName: driveConfig.connectedByName ?? null,
                }
                : null,
        }
    },
})

export const getUserWorkloadHistory = query({
    args: {
        workspaceId: v.string(),
        userId: v.string(),
    },
    handler: async (ctx, args) => {
        const membership = await ctx.db
            .query("workspaceMembers")
            .withIndex("by_userId_workspaceId", (q) =>
                q.eq("userId", args.userId).eq("workspaceId", args.workspaceId)
            )
            .unique()

        if (!membership) {
            return null
        }

        const { tasks } = await getWorkspaceProjectTaskSet(ctx, args.workspaceId)
        const relevantTaskMap = new Map(
            tasks
                .filter((task: any) => task.assigneeId === args.userId)
                .map((task: any) => [task.id, task] as const)
        )
        const sharedTaskRows = await ctx.db
            .query("taskAssignees")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .collect()
        const sharedTaskIds = new Set(sharedTaskRows.map((row) => row.taskId))

        for (const task of tasks) {
            if (sharedTaskIds.has(task.id)) {
                relevantTaskMap.set(task.id, task)
            }
        }

        const relevantTasks = Array.from(relevantTaskMap.values())

        const dateMap = new Map<string, { submitted: number; approved: number }>()

        for (const task of relevantTasks) {
            if (task.submittedAt) {
                const dateKey = new Date(task.submittedAt).toISOString().split("T")[0]
                const current = dateMap.get(dateKey) ?? { submitted: 0, approved: 0 }
                current.submitted += 1
                dateMap.set(dateKey, current)
            }
            if (task.approvedAt) {
                const dateKey = new Date(task.approvedAt).toISOString().split("T")[0]
                const current = dateMap.get(dateKey) ?? { submitted: 0, approved: 0 }
                current.approved += 1
                dateMap.set(dateKey, current)
            }
        }

        return Array.from(dateMap.entries())
            .map(([date, counts]) => ({
                date,
                submitted: counts.submitted,
                approved: counts.approved,
            }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    },
})

export const getProjectActivity = query({
    args: {
        workspaceId: v.string(),
    },
    handler: async (ctx, args) => {
        const projects = await getActiveWorkspaceProjects(ctx, args.workspaceId)
        const now = Date.now()
        const windowStart = startOfUtcDay(now - (MONITOR_WINDOW_DAYS - 1) * DAY_MS)
        const reworkCutoff = now - REWORK_WINDOW_DAYS * DAY_MS
        const recentSignalCutoff = now - 21 * DAY_MS

        const [recentLogs, openHelpRequests, acknowledgedHelpRequests] = await Promise.all([
            ctx.db
                .query("activityLogs")
                .withIndex("by_createdAt")
                .order("desc")
                .take(2000),
            ctx.db
                .query("helpRequests")
                .withIndex("by_status", (q) => q.eq("status", "open"))
                .collect(),
            ctx.db
                .query("helpRequests")
                .withIndex("by_status", (q) => q.eq("status", "acknowledged"))
                .collect(),
        ])

        const activeHelpRequests = [...openHelpRequests, ...acknowledgedHelpRequests]

        const divisions = await Promise.all(
            projects
                .slice()
                .sort((a: any, b: any) => a.name.localeCompare(b.name))
                .map(async (project: any) => {
                    const [board, pushes, tasks] = await Promise.all([
                        getBoardForProject(ctx, project.id),
                        getPushesForProject(ctx, project.id),
                        getProjectTaskSet(ctx, project.id),
                    ])

                    const columns = board ? await getColumnsForBoard(ctx, board.id) : []
                    const doneColumnIds = new Set<string>()
                    const reviewColumnIds = new Set<string>()
                    const inProgressColumnIds = new Set<string>()
                    const todoColumnIds = new Set<string>()

                    for (const column of columns) {
                        const name = normalizeColumnName(column.name)
                        if (name === "done") doneColumnIds.add(column.id)
                        else if (name === "review") reviewColumnIds.add(column.id)
                        else if (name === "in progress") inProgressColumnIds.add(column.id)
                        else if (name === "to do" || name === "todo") todoColumnIds.add(column.id)
                    }

                    const taskIdSet = new Set(tasks.map((task) => task.id))
                    const divisionLogs = recentLogs
                        .filter((log: any) => log.taskId && taskIdSet.has(log.taskId))
                        .sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || b.id.localeCompare(a.id))

                    const divisionHelpRequests = activeHelpRequests.filter((request: any) => taskIdSet.has(request.taskId))
                    const blockedTaskIds = new Set(divisionHelpRequests.map((request: any) => request.taskId))

                    const totalTasks = tasks.length
                    const completedTasks = tasks.filter((task) => isTaskDone(task, doneColumnIds)).length
                    const inReviewCount = tasks.filter((task) => task.columnId && reviewColumnIds.has(task.columnId)).length
                    const inProgressCount = tasks.filter((task) => task.columnId && inProgressColumnIds.has(task.columnId)).length
                    const todoCount = tasks.filter((task) => task.columnId && todoColumnIds.has(task.columnId)).length
                    const activeCount = totalTasks - completedTasks
                    const completedLast7d = tasks.filter((task) => typeof task.approvedAt === "number" && task.approvedAt >= now - 7 * DAY_MS).length
                    const overdueCount = tasks.filter((task) => {
                        const isDone = isTaskDone(task, doneColumnIds)
                        if (isDone) return false

                        const dueAt = task.dueDate ?? task.endDate
                        return typeof dueAt === "number" && dueAt < now
                    }).length
                    const staleCount = tasks.filter((task) => {
                        const isDone = isTaskDone(task, doneColumnIds)
                        if (isDone) return false

                        const lastTouchedAt = task.updatedAt ?? task.submittedAt ?? task.createdAt ?? now
                        return lastTouchedAt < now - STALE_TASK_DAYS * DAY_MS
                    }).length
                    const reviewAges = tasks
                        .filter((task) => task.columnId && reviewColumnIds.has(task.columnId))
                        .map((task) => {
                            const enteredReviewAt = task.submittedAt ?? task.updatedAt ?? task.createdAt ?? now
                            return Math.max(0, Math.floor((now - enteredReviewAt) / DAY_MS))
                        })
                    const oldestReviewDays = reviewAges.length > 0 ? Math.max(...reviewAges) : null
                    const progressSeries = buildCumulativeApprovalSeries(tasks, windowStart, MONITOR_WINDOW_DAYS)

                    const pushTaskCounts = new Map<string, number>()
                    for (const task of tasks) {
                        if (!task.pushId) continue
                        pushTaskCounts.set(task.pushId, (pushTaskCounts.get(task.pushId) ?? 0) + 1)
                    }

                    const plannedPushWeights = pushes
                        .map((push: any) => ({
                            startDate: typeof push.startDate === "number" ? push.startDate : null,
                            endDate: typeof push.endDate === "number" ? push.endDate : null,
                            taskCount: pushTaskCounts.get(push.id) ?? 0,
                        }))
                        .filter((push) => Boolean(push.startDate && push.endDate && push.taskCount > 0))
                        .map((push) => ({
                            startDate: push.startDate as number,
                            endDate: push.endDate as number,
                            taskCount: push.taskCount,
                        }))

                    const expectedSeries = buildExpectedSeries(plannedPushWeights, windowStart, MONITOR_WINDOW_DAYS)
                    const plannedPushIdSet = new Set(
                        pushes
                            .filter((push: any) => {
                                const taskCount = pushTaskCounts.get(push.id) ?? 0
                                return typeof push.startDate === "number" && typeof push.endDate === "number" && taskCount > 0
                            })
                            .map((push: any) => push.id)
                    )
                    const plannedTaskCount = plannedPushWeights.reduce((sum, push) => sum + push.taskCount, 0)
                    const plannedDoneCount = tasks.filter(
                        (task) => task.pushId && plannedPushIdSet.has(task.pushId) && isTaskDone(task, doneColumnIds)
                    ).length
                    const actualPlannedPct = plannedTaskCount > 0 ? roundToTenths((plannedDoneCount / plannedTaskCount) * 100) : null
                    const expectedPlannedPct = expectedSeries.length > 0 ? expectedSeries[expectedSeries.length - 1].completedPct : null
                    const scheduleDeltaPct = actualPlannedPct !== null && expectedPlannedPct !== null
                        ? roundToTenths(actualPlannedPct - expectedPlannedPct)
                        : null

                    const reworkCount14d = divisionLogs.filter(
                        (log: any) =>
                            log.createdAt >= reworkCutoff &&
                            log.action === "moved" &&
                            log.field === "status" &&
                            isBackwardStatusTransition(log.oldValue, log.newValue)
                    ).length

                    const lastActivityAt = Math.max(
                        0,
                        ...tasks.map((task) => task.updatedAt ?? task.createdAt ?? 0),
                        ...divisionLogs.map((log: any) => log.createdAt ?? 0)
                    )

                    const riskScore =
                        overdueCount * 8 +
                        blockedTaskIds.size * 6 +
                        staleCount * 4 +
                        reworkCount14d * 4 +
                        (oldestReviewDays !== null && oldestReviewDays >= REVIEW_STALE_DAYS ? oldestReviewDays * 2 : 0) +
                        (scheduleDeltaPct !== null && scheduleDeltaPct < 0 ? Math.abs(scheduleDeltaPct) : 0)

                    const summarySignals = [
                        scheduleDeltaPct !== null && scheduleDeltaPct <= -BEHIND_PLAN_PCT
                            ? {
                                id: `summary-behind-${project.id}`,
                                kind: "pace",
                                severity: "critical" as const,
                                headline: `${project.name}: behind plan`,
                                detail: `${Math.abs(scheduleDeltaPct)} percentage points behind the active push schedule.`,
                                createdAt: new Date(lastActivityAt || now).toISOString(),
                                projectId: project.id,
                                taskId: null,
                                taskTitle: null,
                            }
                            : null,
                        overdueCount > 0
                            ? {
                                id: `summary-overdue-${project.id}`,
                                kind: "overdue",
                                severity: "critical" as const,
                                headline: `${project.name}: overdue work`,
                                detail: `${overdueCount} active task${overdueCount === 1 ? "" : "s"} past due.`,
                                createdAt: new Date(lastActivityAt || now).toISOString(),
                                projectId: project.id,
                                taskId: null,
                                taskTitle: null,
                            }
                            : null,
                        oldestReviewDays !== null && oldestReviewDays >= REVIEW_STALE_DAYS
                            ? {
                                id: `summary-review-${project.id}`,
                                kind: "review_stale",
                                severity: "warning" as const,
                                headline: `${project.name}: review queue aging`,
                                detail: `${inReviewCount} task${inReviewCount === 1 ? "" : "s"} in review, oldest for ${oldestReviewDays}d.`,
                                createdAt: new Date(lastActivityAt || now).toISOString(),
                                projectId: project.id,
                                taskId: null,
                                taskTitle: null,
                            }
                            : null,
                        blockedTaskIds.size > 0
                            ? {
                                id: `summary-blocked-${project.id}`,
                                kind: "blocked",
                                severity: "warning" as const,
                                headline: `${project.name}: blocked work`,
                                detail: `${blockedTaskIds.size} task${blockedTaskIds.size === 1 ? "" : "s"} waiting on help.`,
                                createdAt: new Date(lastActivityAt || now).toISOString(),
                                projectId: project.id,
                                taskId: null,
                                taskTitle: null,
                            }
                            : null,
                        reworkCount14d > 0
                            ? {
                                id: `summary-rework-${project.id}`,
                                kind: "rework",
                                severity: "warning" as const,
                                headline: `${project.name}: rework observed`,
                                detail: `${reworkCount14d} backward status move${reworkCount14d === 1 ? "" : "s"} in the last ${REWORK_WINDOW_DAYS}d.`,
                                createdAt: new Date(lastActivityAt || now).toISOString(),
                                projectId: project.id,
                                taskId: null,
                                taskTitle: null,
                            }
                            : null,
                    ].filter((signal): signal is NonNullable<typeof signal> => signal !== null)

                    const eventSignals = divisionLogs
                        .filter((log: any) => log.createdAt >= recentSignalCutoff)
                        .map((log: any) => buildSignalFromLog(log, { id: project.id, name: project.name }))
                        .filter((signal): signal is NonNullable<typeof signal> => signal !== null)

                    const signals = [...summarySignals, ...eventSignals]
                        .sort((left, right) => {
                            const severityDelta = severityRank(right.severity) - severityRank(left.severity)
                            if (severityDelta !== 0) return severityDelta
                            return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
                        })
                        .slice(0, 6)

                    return {
                        id: project.id,
                        name: project.name,
                        color: project.color ?? "#64748b",
                        totalTasks,
                        completedTasks,
                        activeCount,
                        inReviewCount,
                        inProgressCount,
                        todoCount,
                        blockedCount: blockedTaskIds.size,
                        overdueCount,
                        staleCount,
                        reworkCount14d,
                        completedLast7d,
                        oldestReviewDays,
                        scheduleDeltaPct,
                        actualPlannedPct,
                        expectedPlannedPct,
                        riskScore,
                        lastActivityAt: lastActivityAt > 0 ? new Date(lastActivityAt).toISOString() : null,
                        progressSeries,
                        expectedSeries,
                        signals,
                    }
                })
        )

        const signals = divisions
            .flatMap((division) => division.signals)
            .sort((left, right) => {
                const severityDelta = severityRank(right.severity) - severityRank(left.severity)
                if (severityDelta !== 0) return severityDelta
                return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
            })
            .slice(0, 10)

        return {
            generatedAt: new Date(now).toISOString(),
            windowDays: MONITOR_WINDOW_DAYS,
            summary: {
                behindPlanCount: divisions.filter(
                    (division) => division.scheduleDeltaPct !== null && division.scheduleDeltaPct <= -BEHIND_PLAN_PCT
                ).length,
                blockedTasks: divisions.reduce((sum, division) => sum + division.blockedCount, 0),
                staleTasks: divisions.reduce((sum, division) => sum + division.staleCount, 0),
                overdueTasks: divisions.reduce((sum, division) => sum + division.overdueCount, 0),
                reworkEvents14d: divisions.reduce((sum, division) => sum + division.reworkCount14d, 0),
            },
            divisions,
            signals,
        }
    },
})
