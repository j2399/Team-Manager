import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import type { DatabaseReader, DatabaseWriter, MutationCtx } from "./_generated/server"
import {
    createLegacyId,
    getUserByLegacyId,
    getWorkspaceByLegacyId,
    getWorkspaceMemberByUserAndWorkspace,
    stripDoc,
} from "./lib"

type Db = DatabaseReader | DatabaseWriter

async function getDocByLegacyId(db: Db, table: string, legacyId: string) {
    const rows = await (db.query(table as never) as any)
        .withIndex("by_legacy_id", (q: any) => q.eq("id", legacyId))
        .collect()

    return rows[0] ?? null
}

function sortByName<T extends { name: string }>(items: T[]) {
    return items.slice().sort((a, b) => a.name.localeCompare(b.name))
}

async function getWorkspaceProjects(db: Db, workspaceId: string) {
    return db
        .query("projects")
        .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
        .collect()
}

async function getWorkspaceActiveProjectIds(db: Db, workspaceId: string) {
    const projects = await getWorkspaceProjects(db, workspaceId)
    return new Set(
        projects
            .filter((project) => project.archivedAt === undefined)
            .map((project) => project.id)
    )
}

async function getUserWorkspaceProjectIds(db: Db, workspaceId: string, userId: string) {
    const [projectMembers, leadAssignments, activeProjectIds] = await Promise.all([
        db
            .query("projectMembers")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .collect(),
        db
            .query("projectLeadAssignments")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .collect(),
        getWorkspaceActiveProjectIds(db, workspaceId),
    ])

    return Array.from(
        new Set([
            ...projectMembers
                .filter((membership) => activeProjectIds.has(membership.projectId))
                .map((membership) => membership.projectId),
            ...leadAssignments
                .filter((assignment) => activeProjectIds.has(assignment.projectId))
                .map((assignment) => assignment.projectId),
        ])
    )
}

async function getTaskWorkspaceInfo(db: Db, task: { columnId?: string; pushId?: string }) {
    if (task.columnId) {
        const column = await getDocByLegacyId(db, "columns", task.columnId)
        if (column) {
            const board = await getDocByLegacyId(db, "boards", column.boardId)
            if (board) {
                const project = await getDocByLegacyId(db, "projects", board.projectId)
                if (project) {
                    return {
                        workspaceId: project.workspaceId ?? null,
                        archivedAt: project.archivedAt,
                    }
                }
            }
        }
    }

    if (task.pushId) {
        const push = await getDocByLegacyId(db, "pushes", task.pushId)
        if (push) {
            const project = await getDocByLegacyId(db, "projects", push.projectId)
            if (project) {
                return {
                    workspaceId: project.workspaceId ?? null,
                    archivedAt: project.archivedAt,
                }
            }
        }
    }

    return null
}

async function clearUserAssignmentsInWorkspace(ctx: MutationCtx, userId: string, workspaceId: string) {
    const directTasks = await ctx.db
        .query("tasks")
        .withIndex("by_assigneeId", (q) => q.eq("assigneeId", userId))
        .collect()

    for (const task of directTasks) {
        const info = await getTaskWorkspaceInfo(ctx.db, task)
        if (info?.workspaceId === workspaceId && info.archivedAt === undefined) {
            await ctx.db.patch(task._id, {
                assigneeId: undefined,
                updatedAt: Date.now(),
            })
        }
    }

    const assignmentRows = await ctx.db
        .query("taskAssignees")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect()

    for (const assignment of assignmentRows) {
        const task = await getDocByLegacyId(ctx.db, "tasks", assignment.taskId)
        if (!task) continue
        const info = await getTaskWorkspaceInfo(ctx.db, task)
        if (info?.workspaceId === workspaceId && info.archivedAt === undefined) {
            await ctx.db.delete(assignment._id)
        }
    }
}

async function removeUserWorkspaceGraph(ctx: MutationCtx, userId: string, workspaceId: string) {
    const membership = await getWorkspaceMemberByUserAndWorkspace(ctx.db, userId, workspaceId)
    if (membership) {
        await ctx.db.delete(membership._id)
    }

    const workspaceProjects = await getWorkspaceProjects(ctx.db, workspaceId)
    const workspaceProjectMap = new Map(workspaceProjects.map((project) => [project.id, project] as const))

    const userProjectMemberships = await ctx.db
        .query("projectMembers")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect()

    for (const projectMembership of userProjectMemberships) {
        const project = workspaceProjectMap.get(projectMembership.projectId)
        if (project && project.archivedAt === undefined) {
            await ctx.db.delete(projectMembership._id)
        }
    }

    const leadAssignments = await ctx.db
        .query("projectLeadAssignments")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect()

    const affectedProjectIds = new Set<string>()
    for (const assignment of leadAssignments) {
        const project = workspaceProjectMap.get(assignment.projectId)
        if (!project) continue
        affectedProjectIds.add(project.id)
        await ctx.db.delete(assignment._id)
    }

    for (const project of workspaceProjects) {
        if (project.leadId === userId) {
            affectedProjectIds.add(project.id)
        }
    }

    for (const projectId of affectedProjectIds) {
        const project = workspaceProjectMap.get(projectId)
        if (!project) continue

        const remainingAssignments = await ctx.db
            .query("projectLeadAssignments")
            .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
            .collect()

        const nextLead = remainingAssignments
            .slice()
            .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0]

        await ctx.db.patch(project._id, {
            leadId: nextLead?.userId,
        })
    }

    await clearUserAssignmentsInWorkspace(ctx, userId, workspaceId)
}

async function deleteProjectGraph(ctx: MutationCtx, projectId: string, workspaceId: string) {
    const boards = await ctx.db
        .query("boards")
        .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
        .collect()
    const pushes = await ctx.db
        .query("pushes")
        .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
        .collect()
    const leadAssignments = await ctx.db
        .query("projectLeadAssignments")
        .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
        .collect()
    const members = await ctx.db
        .query("projectMembers")
        .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
        .collect()
    const userOrders = await ctx.db
        .query("projectUserOrders")
        .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
        .collect()

    const taskMap = new Map<string, any>()

    for (const board of boards) {
        const columns = await ctx.db
            .query("columns")
            .withIndex("by_boardId", (q) => q.eq("boardId", board.id))
            .collect()

        for (const column of columns) {
            const tasks = await ctx.db
                .query("tasks")
                .withIndex("by_columnId", (q) => q.eq("columnId", column.id))
                .collect()

            for (const task of tasks) {
                taskMap.set(task.id, task)
            }
        }

        for (const column of columns) {
            await ctx.db.delete(column._id)
        }

        await ctx.db.delete(board._id)
    }

    for (const push of pushes) {
        const tasks = await ctx.db
            .query("tasks")
            .withIndex("by_pushId", (q) => q.eq("pushId", push.id))
            .collect()
        for (const task of tasks) {
            taskMap.set(task.id, task)
        }
    }

    for (const task of taskMap.values()) {
        const [taskAssignees, comments, attachments, checklistItems, helpRequests, activityLogs] = await Promise.all([
            ctx.db.query("taskAssignees").withIndex("by_taskId", (q) => q.eq("taskId", task.id)).collect(),
            ctx.db.query("comments").withIndex("by_taskId", (q) => q.eq("taskId", task.id)).collect(),
            ctx.db.query("taskAttachments").withIndex("by_taskId", (q) => q.eq("taskId", task.id)).collect(),
            ctx.db.query("taskChecklistItems").withIndex("by_taskId", (q) => q.eq("taskId", task.id)).collect(),
            ctx.db.query("helpRequests").withIndex("by_taskId", (q) => q.eq("taskId", task.id)).collect(),
            ctx.db.query("activityLogs").withIndex("by_taskId", (q) => q.eq("taskId", task.id)).collect(),
        ])

        const taskDeletion = await ctx.db
            .query("taskDeletions")
            .withIndex("by_taskId", (q) => q.eq("taskId", task.id))
            .unique()

        for (const row of [...taskAssignees, ...comments, ...attachments, ...checklistItems, ...helpRequests, ...activityLogs]) {
            await ctx.db.delete(row._id)
        }
        if (taskDeletion && taskDeletion.workspaceId === workspaceId) {
            await ctx.db.delete(taskDeletion._id)
        }

        await ctx.db.delete(task._id)
    }

    for (const row of [...leadAssignments, ...members, ...userOrders, ...pushes]) {
        await ctx.db.delete(row._id)
    }

    const project = await getDocByLegacyId(ctx.db, "projects", projectId)
    if (project) {
        await ctx.db.delete(project._id)
    }
}

export const getWorkspaceUsers = query({
    args: {
        workspaceId: v.string(),
        role: v.optional(v.string()),
        page: v.optional(v.number()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const memberships = await ctx.db
            .query("workspaceMembers")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .collect()

        const filtered = args.role === "leads"
            ? memberships.filter((membership) => membership.role === "Admin" || membership.role === "Team Lead")
            : memberships

        const sorted = sortByName(filtered.map((membership) => ({ ...membership })))
        const page = args.page ?? null
        const limit = args.limit ?? null
        const start = page && limit ? (page - 1) * limit : 0
        const slice = page && limit ? sorted.slice(start, start + limit) : sorted

        const users = await Promise.all(
            slice.map(async (membership) => {
                const user = await getUserByLegacyId(ctx.db, membership.userId)
                if (!user) return null
                return {
                    id: user.id,
                    name: membership.name || user.name,
                    email: user.email,
                    avatar: user.avatar ?? null,
                    skills: user.skills,
                    interests: user.interests ?? null,
                    hasOnboarded: user.hasOnboarded,
                    role: membership.role,
                }
            })
        )

        return {
            users: users.filter((user): user is NonNullable<typeof user> => user !== null),
            total: filtered.length,
        }
    },
})

export const getManagedUser = query({
    args: {
        workspaceId: v.string(),
        userId: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await getUserByLegacyId(ctx.db, args.userId)
        if (!user) return null

        const membership = await getWorkspaceMemberByUserAndWorkspace(ctx.db, args.userId, args.workspaceId)
        const isMember = Boolean(membership) || user.workspaceId === args.workspaceId
        if (!isMember) return null

        return {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                avatar: user.avatar ?? null,
                role: user.role,
                workspaceId: user.workspaceId ?? null,
            },
            membership: membership
                ? {
                    id: membership.id,
                    role: membership.role,
                    name: membership.name,
                }
                : null,
            activeProjectIds: await getUserWorkspaceProjectIds(ctx.db, args.workspaceId, args.userId),
        }
    },
})

export const countWorkspaceAdmins = query({
    args: {
        workspaceId: v.string(),
    },
    handler: async (ctx, args) => {
        const memberships = await ctx.db
            .query("workspaceMembers")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .collect()

        return memberships.filter((membership) => membership.role === "Admin").length
    },
})

export const validateActiveProjectIds = query({
    args: {
        workspaceId: v.string(),
        projectIds: v.array(v.string()),
    },
    handler: async (ctx, args) => {
        const activeProjectIds = await getWorkspaceActiveProjectIds(ctx.db, args.workspaceId)
        return args.projectIds.filter((projectId) => activeProjectIds.has(projectId))
    },
})

export const getWorkspace = query({
    args: {
        workspaceId: v.string(),
    },
    handler: async (ctx, args) => {
        const workspace = await getWorkspaceByLegacyId(ctx.db, args.workspaceId)
        return workspace ? stripDoc(workspace) : null
    },
})

export const createWorkspaceUser = mutation({
    args: {
        id: v.string(),
        workspaceMemberId: v.string(),
        workspaceId: v.string(),
        email: v.string(),
        name: v.string(),
        role: v.string(),
        now: v.number(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .unique()

        if (existing) {
            return { error: "duplicate_email" as const }
        }

        await ctx.db.insert("users", {
            id: args.id,
            name: args.name,
            email: args.email,
            role: args.role,
            workspaceId: args.workspaceId,
            skills: [],
            hasOnboarded: false,
            createdAt: args.now,
            updatedAt: args.now,
        })

        await ctx.db.insert("workspaceMembers", {
            id: args.workspaceMemberId,
            userId: args.id,
            workspaceId: args.workspaceId,
            role: args.role,
            name: args.name,
            joinedAt: args.now,
        })

        return {
            success: true,
            id: args.id,
            name: args.name,
            email: args.email,
            role: args.role,
            workspaceId: args.workspaceId,
            skills: [],
            hasOnboarded: false,
            avatar: null,
            interests: null,
            createdAt: args.now,
            updatedAt: args.now,
        }
    },
})

export const setWorkspaceMemberRole = mutation({
    args: {
        workspaceId: v.string(),
        userId: v.string(),
        role: v.string(),
        fallbackName: v.string(),
    },
    handler: async (ctx, args) => {
        const membership = await getWorkspaceMemberByUserAndWorkspace(ctx.db, args.userId, args.workspaceId)
        if (membership) {
            await ctx.db.patch(membership._id, { role: args.role })
            return { success: true }
        }

        const user = await getUserByLegacyId(ctx.db, args.userId)
        if (!user || user.workspaceId !== args.workspaceId) {
            return { error: "user_not_found" as const }
        }

        await ctx.db.insert("workspaceMembers", {
            id: createLegacyId("workspace_member"),
            userId: args.userId,
            workspaceId: args.workspaceId,
            role: args.role,
            name: args.fallbackName,
            joinedAt: Date.now(),
        })

        return { success: true }
    },
})

export const replaceUserProjectMemberships = mutation({
    args: {
        workspaceId: v.string(),
        userId: v.string(),
        projectIds: v.array(v.string()),
    },
    handler: async (ctx, args) => {
        const [activeProjectIds, leadAssignments] = await Promise.all([
            getWorkspaceActiveProjectIds(ctx.db, args.workspaceId),
            ctx.db
                .query("projectLeadAssignments")
                .withIndex("by_userId", (q) => q.eq("userId", args.userId))
                .collect(),
        ])

        const nextProjectIds = Array.from(
            new Set([
                ...args.projectIds.filter((projectId) => activeProjectIds.has(projectId)),
                ...leadAssignments
                    .filter((assignment) => activeProjectIds.has(assignment.projectId))
                    .map((assignment) => assignment.projectId),
            ])
        )

        const existing = await ctx.db
            .query("projectMembers")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .collect()

        for (const membership of existing) {
            if (activeProjectIds.has(membership.projectId)) {
                await ctx.db.delete(membership._id)
            }
        }

        for (const projectId of nextProjectIds) {
            await ctx.db.insert("projectMembers", {
                id: createLegacyId("project_member"),
                userId: args.userId,
                projectId,
                createdAt: Date.now(),
            })
        }

        return { success: true, projectIds: nextProjectIds }
    },
})

export const removeWorkspaceMember = mutation({
    args: {
        workspaceId: v.string(),
        userId: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await getUserByLegacyId(ctx.db, args.userId)
        if (!user) {
            return { error: "user_not_found" as const }
        }

        await removeUserWorkspaceGraph(ctx, args.userId, args.workspaceId)

        if (user.workspaceId === args.workspaceId) {
            await ctx.db.patch(user._id, {
                workspaceId: undefined,
                role: "Member",
                updatedAt: Date.now(),
            })
        }

        return { success: true }
    },
})

export const updateUserDisplayName = mutation({
    args: {
        userId: v.string(),
        name: v.string(),
        updatedAt: v.number(),
    },
    handler: async (ctx, args) => {
        const user = await getUserByLegacyId(ctx.db, args.userId)
        if (!user) {
            return { error: "user_not_found" as const }
        }

        await ctx.db.patch(user._id, {
            name: args.name,
            updatedAt: args.updatedAt,
        })

        const memberships = await ctx.db
            .query("workspaceMembers")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .collect()

        for (const membership of memberships) {
            await ctx.db.patch(membership._id, { name: args.name })
        }

        return { success: true }
    },
})

export const updateWorkspaceMemberName = mutation({
    args: {
        workspaceId: v.string(),
        userId: v.string(),
        name: v.string(),
    },
    handler: async (ctx, args) => {
        const membership = await getWorkspaceMemberByUserAndWorkspace(ctx.db, args.userId, args.workspaceId)
        if (!membership) {
            return { error: "membership_not_found" as const }
        }

        const user = await getUserByLegacyId(ctx.db, args.userId)
        if (!user) {
            return { error: "user_not_found" as const }
        }

        await ctx.db.patch(user._id, {
            name: args.name,
            updatedAt: Date.now(),
        })

        const memberships = await ctx.db
            .query("workspaceMembers")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .collect()

        for (const currentMembership of memberships) {
            await ctx.db.patch(currentMembership._id, { name: args.name })
        }

        return { success: true }
    },
})

export const updateWorkspaceDiscordChannel = mutation({
    args: {
        workspaceId: v.string(),
        discordChannelId: v.optional(v.string()),
        updatedAt: v.number(),
    },
    handler: async (ctx, args) => {
        const workspace = await getWorkspaceByLegacyId(ctx.db, args.workspaceId)
        if (!workspace) {
            return { error: "workspace_not_found" as const }
        }

        await ctx.db.patch(workspace._id, {
            discordChannelId: args.discordChannelId,
            updatedAt: args.updatedAt,
        })

        return { success: true }
    },
})

export const updateUserProfileDetails = mutation({
    args: {
        userId: v.string(),
        skills: v.array(v.string()),
        interests: v.optional(v.string()),
        updatedAt: v.number(),
    },
    handler: async (ctx, args) => {
        const user = await getUserByLegacyId(ctx.db, args.userId)
        if (!user) {
            return { error: "user_not_found" as const }
        }

        await ctx.db.patch(user._id, {
            skills: args.skills,
            interests: args.interests,
            updatedAt: args.updatedAt,
        })

        return { success: true }
    },
})

export const deleteUserAccount = mutation({
    args: {
        userId: v.string(),
        updatedAt: v.number(),
    },
    handler: async (ctx, args) => {
        const user = await getUserByLegacyId(ctx.db, args.userId)
        if (!user) {
            return { error: "user_not_found" as const }
        }

        const ownedWorkspaces = await ctx.db
            .query("workspaces")
            .withIndex("by_ownerId", (q) => q.eq("ownerId", args.userId))
            .collect()

        const transfers = []
        for (const workspace of ownedWorkspaces) {
            const members = (await ctx.db
                .query("workspaceMembers")
                .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspace.id))
                .collect())
                .filter((member) => member.userId !== args.userId)
                .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))

            const replacement =
                members.find((member) => member.role === "Admin") ||
                members.find((member) => member.role === "Team Lead") ||
                members[0]

            if (!replacement) {
                return {
                    error: `Delete or transfer workspace "${workspace.name}" before deleting your account.`,
                }
            }

            transfers.push({ workspace, replacement })
        }

        const activityLogs = await ctx.db.query("activityLogs").collect()
        for (const log of activityLogs) {
            if (log.changedBy === args.userId) {
                await ctx.db.patch(log._id, { changedByName: "Deleted User" })
            }
        }

        const comments = await ctx.db.query("comments").collect()
        for (const comment of comments) {
            if (comment.authorId === args.userId) {
                await ctx.db.patch(comment._id, { authorName: "Deleted User" })
            }
        }

        const chatMessages = await ctx.db
            .query("generalChatMessages")
            .withIndex("by_authorId", (q) => q.eq("authorId", args.userId))
            .collect()
        for (const message of chatMessages) {
            await ctx.db.patch(message._id, { authorName: "Deleted User" })
        }

        for (const transfer of transfers) {
            await ctx.db.patch(transfer.workspace._id, {
                ownerId: transfer.replacement.userId,
                updatedAt: args.updatedAt,
            })

            if (transfer.replacement.role !== "Admin") {
                await ctx.db.patch(transfer.replacement._id, { role: "Admin" })
            }
        }

        const memberships = await ctx.db
            .query("workspaceMembers")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .collect()

        for (const membership of memberships) {
            await removeUserWorkspaceGraph(ctx, args.userId, membership.workspaceId)
        }

        const sessions = await ctx.db
            .query("sessions")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .collect()
        for (const session of sessions) {
            await ctx.db.delete(session._id)
        }

        const reads = await ctx.db
            .query("notificationReads")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .collect()
        for (const read of reads) {
            await ctx.db.delete(read._id)
        }

        const typing = await ctx.db
            .query("chatTypings")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .unique()
        if (typing) {
            await ctx.db.delete(typing._id)
        }

        await ctx.db.delete(user._id)
        return { success: true }
    },
})

export const deleteWorkspace = mutation({
    args: {
        workspaceId: v.string(),
    },
    handler: async (ctx, args) => {
        const workspace = await getWorkspaceByLegacyId(ctx.db, args.workspaceId)
        if (!workspace) {
            return { error: "workspace_not_found" as const }
        }

        const projects = await getWorkspaceProjects(ctx.db, args.workspaceId)
        for (const project of projects) {
            await deleteProjectGraph(ctx, project.id, args.workspaceId)
        }

        const invites = await ctx.db
            .query("invites")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .collect()
        for (const invite of invites) {
            await ctx.db.delete(invite._id)
        }

        const driveConfig = await ctx.db
            .query("workspaceDriveConfigs")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .unique()
        if (driveConfig) {
            await ctx.db.delete(driveConfig._id)
        }

        const workloadConfig = await ctx.db
            .query("workloadConfigs")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .unique()
        if (workloadConfig) {
            await ctx.db.delete(workloadConfig._id)
        }

        const notifications = await ctx.db
            .query("notifications")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .collect()
        for (const notification of notifications) {
            const reads = await ctx.db
                .query("notificationReads")
                .withIndex("by_notificationId", (q) => q.eq("notificationId", notification.id))
                .collect()
            for (const read of reads) {
                await ctx.db.delete(read._id)
            }
            await ctx.db.delete(notification._id)
        }

        const chatMessages = await ctx.db
            .query("generalChatMessages")
            .withIndex("by_workspaceId_createdAt", (q) => q.eq("workspaceId", args.workspaceId))
            .collect()
        for (const message of chatMessages) {
            await ctx.db.delete(message._id)
        }

        const members = await ctx.db
            .query("workspaceMembers")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .collect()
        for (const member of members) {
            await ctx.db.delete(member._id)
        }

        const users = await ctx.db
            .query("users")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .collect()
        for (const user of users) {
            await ctx.db.patch(user._id, {
                workspaceId: undefined,
                updatedAt: Date.now(),
            })
        }

        await ctx.db.delete(workspace._id)
        return { success: true }
    },
})
