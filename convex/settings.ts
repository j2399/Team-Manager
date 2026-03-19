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

async function getWorkspaceProjectTaskSet(ctx: any, workspaceId: string) {
    const projects = await getActiveWorkspaceProjects(ctx, workspaceId)
    const taskMap = new Map<string, any>()

    for (const project of projects) {
        const columnTasks = await getProjectTasks(ctx, project.id)
        for (const task of columnTasks) {
            taskMap.set(task.id, task)
        }

        const pushes = await getPushesForProject(ctx, project.id)
        for (const push of pushes) {
            const pushTasks = await ctx.db
                .query("tasks")
                .withIndex("by_pushId", (q: any) => q.eq("pushId", push.id))
                .collect()

            for (const task of pushTasks) {
                taskMap.set(task.id, task)
            }
        }
    }

    return {
        projects,
        tasks: Array.from(taskMap.values()),
    }
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

        return Promise.all(
            projects
                .slice()
                .sort((a: any, b: any) => a.name.localeCompare(b.name))
                .map(async (project: any) => {
                    const pushes = await getPushesForProject(ctx, project.id)

                    const pushStats = await Promise.all(
                        pushes
                            .slice()
                            .sort((a, b) => (a.startDate ?? 0) - (b.startDate ?? 0) || a.id.localeCompare(b.id))
                            .map(async (push) => {
                                const tasks = await ctx.db
                                    .query("tasks")
                                    .withIndex("by_pushId", (q) => q.eq("pushId", push.id))
                                    .collect()

                                const timeline = tasks.flatMap((task) => {
                                    const items: Array<{ date: string; type: "submitted" | "approved" }> = []
                                    if (task.submittedAt) {
                                        items.push({ date: new Date(task.submittedAt).toISOString(), type: "submitted" })
                                    }
                                    if (task.approvedAt) {
                                        items.push({ date: new Date(task.approvedAt).toISOString(), type: "approved" })
                                    }
                                    return items
                                }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

                                const doneColumnIds = new Set<string>()
                                const reviewColumnIds = new Set<string>()
                                const inProgressColumnIds = new Set<string>()
                                const todoColumnIds = new Set<string>()
                                const board = await getBoardForProject(ctx, project.id)
                                if (board) {
                                    const columns = await getColumnsForBoard(ctx, board.id)
                                    for (const column of columns) {
                                        const name = column.name.toLowerCase()
                                        if (name === "done") doneColumnIds.add(column.id)
                                        else if (name === "review") reviewColumnIds.add(column.id)
                                        else if (name === "in progress") inProgressColumnIds.add(column.id)
                                        else if (name === "to do" || name === "todo") todoColumnIds.add(column.id)
                                    }
                                }

                                const completed = tasks.filter((task) => task.columnId && doneColumnIds.has(task.columnId)).length
                                const inReview = tasks.filter((task) => task.columnId && reviewColumnIds.has(task.columnId)).length
                                const inProgress = tasks.filter((task) => task.columnId && inProgressColumnIds.has(task.columnId)).length
                                const todo = tasks.filter((task) => task.columnId && todoColumnIds.has(task.columnId)).length

                                return {
                                    id: push.id,
                                    name: push.name,
                                    startDate: new Date(push.startDate).toISOString(),
                                    endDate: push.endDate ? new Date(push.endDate).toISOString() : null,
                                    status: push.status,
                                    total: tasks.length,
                                    completed,
                                    inReview,
                                    inProgress,
                                    todo,
                                    timeline,
                                }
                            })
                    )

                    const totalTasks = pushStats.reduce((sum, push) => sum + push.total, 0)
                    const totalCompleted = pushStats.reduce((sum, push) => sum + push.completed, 0)
                    const totalInReview = pushStats.reduce((sum, push) => sum + push.inReview, 0)

                    return {
                        id: project.id,
                        name: project.name,
                        color: project.color,
                        totalTasks,
                        totalCompleted,
                        totalInReview,
                        completionRate: totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0,
                        pushes: pushStats,
                    }
                })
        )
    },
})
