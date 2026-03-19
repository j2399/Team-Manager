import { query } from "./_generated/server"
import { v } from "convex/values"
import type { Doc } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"
import {
    getBoardForProject,
    getByLegacyId,
    getColumnsForBoard,
    getProjectByLegacyId,
    getProjectLeadUsers,
    getProjectMemberIds,
    getProjectTasks,
    getUserByLegacyId,
} from "./boardData"

function toIso(timestamp: number | null | undefined) {
    return typeof timestamp === "number" ? new Date(timestamp).toISOString() : null
}

function uniqueStrings(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0)))
}

function isActiveProject(project: Doc<"projects">) {
    return project.archivedAt === undefined
}

function sortProjectsByCreatedDesc(a: Doc<"projects">, b: Doc<"projects">) {
    return (b.createdAt ?? 0) - (a.createdAt ?? 0) || a.name.localeCompare(b.name)
}

function sortTasksByDueThenUpdated<T extends { dueDate: string | null; endDate: string | null; updatedAt: string | null }>(
    tasks: T[]
) {
    return tasks.slice().sort((left, right) => {
        const leftDue = left.dueDate ?? left.endDate
        const rightDue = right.dueDate ?? right.endDate

        if (leftDue && rightDue) {
            const byDue = new Date(leftDue).getTime() - new Date(rightDue).getTime()
            if (byDue !== 0) return byDue
        } else if (leftDue) {
            return -1
        } else if (rightDue) {
            return 1
        }

        return new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime()
    })
}

type ProjectSummary = {
    id: string
    name: string
    color: string | null
}

type HydratedTask = {
    id: string
    title: string
    description: string | null
    assigneeId: string | null
    assignee: { id: string; name: string } | null
    assignees: { userId: string; user: { id: string; name: string } }[]
    columnId: string | null
    column: {
        id: string
        name: string
        board: {
            id: string
            columns?: { id: string; name: string }[]
            project: ProjectSummary | null
        } | null
    } | null
    push: {
        id: string
        name: string
        color: string
        status?: string
    } | null
    startDate: string | null
    endDate: string | null
    dueDate: string | null
    submittedAt: string | null
    approvedAt: string | null
    createdAt: string
    updatedAt: string
    progress: number
    enableProgress: boolean
    requireAttachment: boolean
    commentsCount: number
    attachmentsCount: number
    checklistItems: { id: string; completed: boolean }[]
    helpRequests: { id: string; status: string; createdAt: string }[]
    activityLogs: { createdAt: string; action: string }[]
}

async function getActiveWorkspaceProjects(ctx: QueryCtx, workspaceId: string) {
    const projects = await ctx.db
        .query("projects")
        .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
        .collect()

    return projects.filter(isActiveProject).sort(sortProjectsByCreatedDesc)
}

async function getProjectIdsForMember(ctx: QueryCtx, userId: string) {
    const rows = await ctx.db
        .query("projectMembers")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect()

    return new Set(rows.map((row) => row.projectId))
}

async function getLeadProjectIds(ctx: QueryCtx, userId: string) {
    const rows = await ctx.db
        .query("projectLeadAssignments")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect()

    return new Set(rows.map((row) => row.projectId))
}

async function getTasksForProjectIds(ctx: QueryCtx, projectIds: string[]) {
    const taskGroups = await Promise.all(projectIds.map((projectId) => getProjectTasks(ctx, projectId)))
    return taskGroups.flat()
}

async function buildWorkspaceMembers(ctx: QueryCtx, workspaceId: string) {
    const memberships = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
        .collect()

    const users = await Promise.all(memberships.map((membership) => getUserByLegacyId(ctx, membership.userId)))
    const userMap = new Map(
        users
            .filter((user): user is NonNullable<typeof user> => user !== null)
            .map((user) => [user.id, user] as const)
    )

    return memberships
        .map((membership) => {
            const user = userMap.get(membership.userId)
            if (!user) return null

            return {
                userId: membership.userId,
                name: membership.name || user.name,
                role: membership.role,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    avatar: user.avatar ?? null,
                },
            }
        })
        .filter((membership): membership is NonNullable<typeof membership> => membership !== null)
        .sort((left, right) => left.name.localeCompare(right.name))
}

async function buildProjectMembershipMap(ctx: QueryCtx, projects: Doc<"projects">[]) {
    const projectUserIds = await Promise.all(
        projects.map((project) => getProjectMemberIds(ctx, project.id))
    )

    const memberships = new Map<string, Array<{ project: ProjectSummary }>>()

    projects.forEach((project, index) => {
        for (const userId of projectUserIds[index]) {
            const existing = memberships.get(userId) ?? []
            existing.push({
                project: {
                    id: project.id,
                    name: project.name,
                    color: project.color ?? null,
                },
            })
            memberships.set(userId, existing)
        }
    })

    return memberships
}

async function hydrateTasks(
    ctx: QueryCtx,
    tasks: Doc<"tasks">[],
    options?: { includeBoardColumns?: boolean }
) {
    const includeBoardColumns = options?.includeBoardColumns ?? false

    const [columns, pushes] = await Promise.all([
        Promise.all(uniqueStrings(tasks.map((task) => task.columnId)).map((id) => getByLegacyId(ctx, "columns", id))),
        Promise.all(uniqueStrings(tasks.map((task) => task.pushId)).map((id) => getByLegacyId(ctx, "pushes", id))),
    ])
    const resolvedColumns = columns.filter((column): column is NonNullable<typeof column> => column !== null)
    const resolvedPushes = pushes.filter((push): push is NonNullable<typeof push> => push !== null)

    const boards = await Promise.all(uniqueStrings(resolvedColumns.map((column) => column.boardId)).map((id) => getByLegacyId(ctx, "boards", id)))
    const resolvedBoards = boards.filter((board): board is NonNullable<typeof board> => board !== null)
    const projects = await Promise.all(
        uniqueStrings([
            ...resolvedBoards.map((board) => board.projectId),
            ...resolvedPushes.map((push) => push.projectId),
        ]).map((id) => getByLegacyId(ctx, "projects", id))
    )
    const resolvedProjects = projects.filter((project): project is NonNullable<typeof project> => project !== null)

    const taskAssignees = await Promise.all(
        tasks.map((task) =>
            ctx.db
                .query("taskAssignees")
                .withIndex("by_taskId", (q) => q.eq("taskId", task.id))
                .collect()
        )
    )
    const comments = await Promise.all(
        tasks.map((task) =>
            ctx.db
                .query("comments")
                .withIndex("by_taskId", (q) => q.eq("taskId", task.id))
                .collect()
        )
    )
    const attachments = await Promise.all(
        tasks.map((task) =>
            ctx.db
                .query("taskAttachments")
                .withIndex("by_taskId", (q) => q.eq("taskId", task.id))
                .collect()
        )
    )
    const checklistItems = await Promise.all(
        tasks.map((task) =>
            ctx.db
                .query("taskChecklistItems")
                .withIndex("by_taskId", (q) => q.eq("taskId", task.id))
                .collect()
        )
    )
    const helpRequests = await Promise.all(
        tasks.map((task) =>
            ctx.db
                .query("helpRequests")
                .withIndex("by_taskId", (q) => q.eq("taskId", task.id))
                .collect()
        )
    )
    const activityLogs = await Promise.all(
        tasks.map((task) =>
            ctx.db
                .query("activityLogs")
                .withIndex("by_taskId", (q) => q.eq("taskId", task.id))
                .collect()
        )
    )

    const assigneeIds = uniqueStrings([
        ...tasks.map((task) => task.assigneeId),
        ...taskAssignees.flat().map((assignee) => assignee.userId),
    ])
    const users = await Promise.all(assigneeIds.map((id) => getByLegacyId(ctx, "users", id)))
    const resolvedUsers = users.filter((user): user is NonNullable<typeof user> => user !== null)

    const userMap = new Map(resolvedUsers.map((user) => [user.id, user] as const))
    const columnMap = new Map(resolvedColumns.map((column) => [column.id, column] as const))
    const boardMap = new Map(resolvedBoards.map((board) => [board.id, board] as const))
    const projectMap = new Map(resolvedProjects.map((project) => [project.id, project] as const))
    const pushMap = new Map(resolvedPushes.map((push) => [push.id, push] as const))
    const boardColumnsEntries = includeBoardColumns
        ? await Promise.all(
            resolvedBoards.map(async (board) => [
                board.id,
                (await getColumnsForBoard(ctx, board.id)).map((column) => ({
                    id: column.id,
                    name: column.name,
                })),
            ] as const)
        )
        : []
    const boardColumnsMap = new Map(boardColumnsEntries)

    return tasks.map((task, index): HydratedTask => {
        const column = task.columnId ? columnMap.get(task.columnId) ?? null : null
        const board = column ? boardMap.get(column.boardId) ?? null : null
        const push = task.pushId ? pushMap.get(task.pushId) ?? null : null
        const project = board
            ? projectMap.get(board.projectId) ?? null
            : push
                ? projectMap.get(push.projectId) ?? null
                : null
        const taskUserIds = uniqueStrings([
            task.assigneeId,
            ...taskAssignees[index].map((assignee) => assignee.userId),
        ])
        const openHelpRequests = helpRequests[index]
            .filter((request) => request.status === "open" || request.status === "acknowledged")
            .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0) || left.id.localeCompare(right.id))
        const latestActivity = activityLogs[index]
            .slice()
            .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0) || left.id.localeCompare(right.id))
            .slice(0, 1)

        return {
            id: task.id,
            title: task.title,
            description: task.description ?? null,
            assigneeId: task.assigneeId ?? null,
            assignee: task.assigneeId && userMap.get(task.assigneeId)
                ? {
                    id: task.assigneeId,
                    name: userMap.get(task.assigneeId)!.name,
                }
                : null,
            assignees: taskUserIds
                .map((userId) => userMap.get(userId))
                .filter((user): user is NonNullable<typeof user> => user !== undefined)
                .map((user) => ({
                    userId: user.id,
                    user: {
                        id: user.id,
                        name: user.name,
                    },
                })),
            columnId: task.columnId ?? null,
            column: column
                ? {
                    id: column.id,
                    name: column.name,
                    board: board
                        ? {
                            id: board.id,
                            columns: boardColumnsMap.get(board.id),
                            project: project
                                ? {
                                    id: project.id,
                                    name: project.name,
                                    color: project.color ?? null,
                                }
                                : null,
                        }
                        : null,
                }
                : null,
            push: push
                ? {
                    id: push.id,
                    name: push.name,
                    color: push.color,
                    status: push.status,
                }
                : null,
            startDate: toIso(task.startDate),
            endDate: toIso(task.endDate),
            dueDate: toIso(task.dueDate),
            submittedAt: toIso(task.submittedAt),
            approvedAt: toIso(task.approvedAt),
            createdAt: new Date(task.createdAt).toISOString(),
            updatedAt: new Date(task.updatedAt).toISOString(),
            progress: task.progress,
            enableProgress: task.enableProgress,
            requireAttachment: task.requireAttachment,
            commentsCount: comments[index].length,
            attachmentsCount: attachments[index].length,
            checklistItems: checklistItems[index].map((item) => ({
                id: item.id,
                completed: item.completed,
            })),
            helpRequests: openHelpRequests.map((request) => ({
                id: request.id,
                status: request.status,
                createdAt: new Date(request.createdAt).toISOString(),
            })),
            activityLogs: latestActivity.map((log) => ({
                createdAt: new Date(log.createdAt).toISOString(),
                action: log.action,
            })),
        }
    })
}

function isAssignedToUser(task: HydratedTask, userId: string) {
    return task.assigneeId === userId || task.assignees.some((assignee) => assignee.userId === userId)
}

async function buildRecentActivity(ctx: QueryCtx, taskProjectIdMap: Map<string, string>) {
    const logs = await ctx.db
        .query("activityLogs")
        .withIndex("by_createdAt")
        .order("desc")
        .take(200)

    return logs
        .filter((log) => log.taskId && taskProjectIdMap.has(log.taskId))
        .slice(0, 10)
        .map((log) => ({
            id: log.id,
            action: log.action,
            field: log.field ?? null,
            oldValue: log.oldValue ?? null,
            newValue: log.newValue ?? null,
            taskTitle: log.taskTitle ?? null,
            changedByName: log.changedByName,
            createdAt: new Date(log.createdAt).toISOString(),
            task: log.taskId
                ? {
                    id: log.taskId,
                    column: {
                        board: {
                            project: {
                                id: taskProjectIdMap.get(log.taskId)!,
                            },
                        },
                    },
                }
                : null,
        }))
}

export const getProjectsPageTarget = query({
    args: {
        userId: v.string(),
        workspaceId: v.string(),
        role: v.string(),
    },
    handler: async (ctx, args) => {
        const activeProjects = await getActiveWorkspaceProjects(ctx, args.workspaceId)
        if (activeProjects.length === 0) return null

        if (args.role === "Member") {
            const memberProjectIds = await getProjectIdsForMember(ctx, args.userId)
            const memberProject = activeProjects.find((project) => memberProjectIds.has(project.id))
            return memberProject ? memberProject.id : null
        }

        return activeProjects[0]?.id ?? null
    },
})

export const getDashboardPageData = query({
    args: {
        userId: v.string(),
        workspaceId: v.string(),
        role: v.string(),
    },
    handler: async (ctx, args) => {
        const [activeProjects, memberProjectIds, leadProjectIds, workspaceMembers, driveConfigDoc] = await Promise.all([
            getActiveWorkspaceProjects(ctx, args.workspaceId),
            args.role === "Member" ? getProjectIdsForMember(ctx, args.userId) : Promise.resolve(new Set<string>()),
            args.role === "Team Lead" ? getLeadProjectIds(ctx, args.userId) : Promise.resolve(new Set<string>()),
            args.role === "Admin" || args.role === "Team Lead"
                ? buildWorkspaceMembers(ctx, args.workspaceId)
                : Promise.resolve([]),
            args.role === "Admin" || args.role === "Team Lead"
                ? ctx.db
                    .query("workspaceDriveConfigs")
                    .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
                    .unique()
                : Promise.resolve(null),
        ])

        const projectIds = activeProjects.map((project) => project.id)
        const allTasks = await hydrateTasks(ctx, await getTasksForProjectIds(ctx, projectIds), { includeBoardColumns: true })
        const taskProjectIdMap = new Map(
            allTasks
                .map((task) => [task.id, task.column?.board?.project?.id ?? ""] as const)
                .filter((entry) => entry[1])
        )
        const accessibleProjectIds = args.role === "Member"
            ? new Set(projectIds.filter((projectId) => memberProjectIds.has(projectId)))
            : new Set(projectIds)

        const myTasks = sortTasksByDueThenUpdated(
            allTasks.filter((task) => {
                const projectId = task.column?.board?.project?.id
                return !!projectId && accessibleProjectIds.has(projectId) && isAssignedToUser(task, args.userId)
            })
        ).slice(0, 50)

        const pendingApproval = (args.role === "Admin" || args.role === "Team Lead")
            ? allTasks
                .filter((task) => {
                    const projectId = task.column?.board?.project?.id
                    if (!projectId || task.column?.name !== "Review") return false
                    return args.role === "Admin" ? true : leadProjectIds.has(projectId)
                })
                .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
                .slice(0, 20)
            : []

        const teamStats = workspaceMembers.length > 0
            ? {
                users: workspaceMembers
                    .map((member) => {
                        const userTasks = allTasks.filter((task) => isAssignedToUser(task, member.userId))
                        return {
                            id: member.userId,
                            name: member.name,
                            avatar: member.user.avatar,
                            done: userTasks.filter((task) => task.column?.name === "Done").length,
                            inProgress: userTasks.filter((task) => task.column?.name === "In Progress").length,
                            review: userTasks.filter((task) => task.column?.name === "Review").length,
                            todo: userTasks.filter((task) => task.column?.name === "To Do" || task.column?.name === "Todo").length,
                            total: userTasks.length,
                            tasks: userTasks.map((task) => ({
                                id: task.id,
                                title: task.title,
                                columnName: task.column?.name || "Unknown",
                                projectId: task.column?.board?.project?.id || "",
                                projectName: task.column?.board?.project?.name || "",
                                dueDate: task.dueDate ?? task.endDate,
                            })),
                        }
                    })
                    .sort(
                        (left, right) =>
                            (right.inProgress + right.todo + right.review) - (left.inProgress + left.todo + left.review)
                    ),
                totalTasks: allTasks.length,
            }
            : null

        return {
            myTasks,
            pendingApproval,
            teamStats,
            recentActivity: args.role === "Admin" || args.role === "Team Lead"
                ? await buildRecentActivity(ctx, taskProjectIdMap)
                : [],
            driveConfig: driveConfigDoc
                ? {
                    connected: Boolean(driveConfigDoc.refreshToken),
                    folderId: driveConfigDoc.folderId ?? null,
                    folderName: driveConfigDoc.folderName ?? null,
                    connectedByName: driveConfigDoc.connectedByName ?? null,
                }
                : null,
        }
    },
})

export const getMembersPageData = query({
    args: {
        workspaceId: v.string(),
    },
    handler: async (ctx, args) => {
        const [activeProjects, workspaceMembers] = await Promise.all([
            getActiveWorkspaceProjects(ctx, args.workspaceId),
            buildWorkspaceMembers(ctx, args.workspaceId),
        ])

        const projectIds = activeProjects.map((project) => project.id)
        const [allTasks, projectMemberships] = await Promise.all([
            hydrateTasks(ctx, await getTasksForProjectIds(ctx, projectIds)),
            buildProjectMembershipMap(ctx, activeProjects),
        ])

        const userIds = workspaceMembers.map((member) => member.userId)
        const userIdSet = new Set(userIds)
        const taskProjectIdMap = new Set(allTasks.map((task) => task.id))
        const activityLogs = await ctx.db
            .query("activityLogs")
            .withIndex("by_createdAt")
            .order("desc")
            .take(500)

        return {
            users: workspaceMembers.map((member) => ({
                id: member.userId,
                name: member.name,
                email: member.user.email,
                avatar: member.user.avatar,
                role: member.role,
                projectMemberships: projectMemberships.get(member.userId) ?? [],
            })),
            workspaceTasks: allTasks.map((task) => ({
                id: task.id,
                title: task.title,
                description: task.description,
                dueDate: task.dueDate,
                endDate: task.endDate,
                startDate: task.startDate,
                updatedAt: task.updatedAt,
                progress: task.progress,
                enableProgress: task.enableProgress,
                assigneeId: task.assigneeId,
                assignees: task.assignees.map((assignee) => ({ userId: assignee.userId })),
                column: task.column
                    ? {
                        name: task.column.name,
                        board: {
                            project: task.column.board?.project,
                        },
                    }
                    : null,
                push: task.push
                    ? {
                        name: task.push.name,
                        color: task.push.color,
                    }
                    : null,
            })),
            activityLogs: activityLogs
                .filter(
                    (log) =>
                        userIdSet.has(log.changedBy) &&
                        (log.taskId === undefined || log.taskId === null || taskProjectIdMap.has(log.taskId))
                )
                .slice(0, 100)
                .map((log) => ({
                    id: log.id,
                    action: log.action,
                    field: log.field ?? null,
                    taskTitle: log.taskTitle ?? null,
                    createdAt: new Date(log.createdAt).toISOString(),
                    details: log.details ?? null,
                    changedBy: log.changedBy,
                })),
            allProjects: activeProjects.map((project) => ({
                id: project.id,
                name: project.name,
                color: project.color ?? null,
            })),
        }
    },
})

export const getMyBoardPageData = query({
    args: {
        userId: v.string(),
        workspaceId: v.string(),
    },
    handler: async (ctx, args) => {
        const activeProjects = await getActiveWorkspaceProjects(ctx, args.workspaceId)
        const tasks = await hydrateTasks(ctx, await getTasksForProjectIds(ctx, activeProjects.map((project) => project.id)))

        const transformedTasks = sortTasksByDueThenUpdated(
            tasks.filter((task) => isAssignedToUser(task, args.userId))
        ).map((task) => ({
            id: task.id,
            title: task.title,
            description: task.description,
            columnName: task.column?.name || "Unknown",
            columnId: task.columnId,
            projectId: task.column?.board?.project?.id || "",
            projectName: task.column?.board?.project?.name || "",
            projectColor: task.column?.board?.project?.color || "#6b7280",
            pushId: task.push?.id || null,
            pushName: task.push?.name || null,
            pushColor: task.push?.color || null,
            dueDate: task.dueDate ?? task.endDate,
            startDate: task.startDate,
            endDate: task.endDate,
            progress: task.progress,
            enableProgress: task.enableProgress,
            commentsCount: task.commentsCount,
            attachmentsCount: task.attachmentsCount,
            checklistTotal: task.checklistItems.length,
            checklistCompleted: task.checklistItems.filter((item) => item.completed).length,
            hasHelpRequest: task.helpRequests.length > 0,
            helpRequestStatus: task.helpRequests[0]?.status || null,
            submittedAt: task.submittedAt,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
        }))

        const columns = [
            { id: "todo", name: "To Do", tasks: transformedTasks.filter((task) => task.columnName === "To Do") },
            { id: "inprogress", name: "In Progress", tasks: transformedTasks.filter((task) => task.columnName === "In Progress") },
            { id: "review", name: "Review", tasks: transformedTasks.filter((task) => task.columnName === "Review") },
            { id: "done", name: "Done", tasks: transformedTasks.filter((task) => task.columnName === "Done") },
        ]

        const projects = Array.from(
            new Map(
                transformedTasks
                    .filter((task) => task.projectId)
                    .map((task) => [task.projectId, { id: task.projectId, name: task.projectName, color: task.projectColor }])
            ).values()
        )

        return {
            columns,
            projects,
        }
    },
})

export const getHeatmapWidgetData = query({
    args: { workspaceId: v.string() },
    handler: async (ctx, args) => {
        const [activeProjects, workspaceMembers, workloadConfigDoc] = await Promise.all([
            getActiveWorkspaceProjects(ctx, args.workspaceId),
            buildWorkspaceMembers(ctx, args.workspaceId),
            ctx.db
                .query("workloadConfigs")
                .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
                .unique(),
        ])

        const projectIds = activeProjects.map((project) => project.id)
        const tasks = await hydrateTasks(ctx, await getTasksForProjectIds(ctx, projectIds))

        const extendedProjects = await Promise.all(
            activeProjects.map(async (project) => {
                const [pushes, board, memberIds] = await Promise.all([
                    ctx.db
                        .query("pushes")
                        .withIndex("by_projectId", (q) => q.eq("projectId", project.id))
                        .collect(),
                    getBoardForProject(ctx, project.id),
                    getProjectMemberIds(ctx, project.id),
                ])

                const activePushes = pushes
                    .filter((push) => push.status === "Active")
                    .map((push) => ({ id: push.id, name: push.name, color: push.color }))

                const columns = board ? await getColumnsForBoard(ctx, board.id) : []

                return {
                    id: project.id,
                    name: project.name,
                    color: project.color ?? "#6b7280",
                    pushes: activePushes,
                    boards: board
                        ? [{ id: board.id, columns: columns.map((col) => ({ id: col.id, name: col.name })) }]
                        : [],
                    members: Array.from(memberIds).map((userId) => ({ userId })),
                }
            })
        )

        return {
            config: workloadConfigDoc?.config ?? null,
            memberships: workspaceMembers.map((member) => ({
                userId: member.userId,
                name: member.name,
                role: member.role,
                user: { name: member.user.name, avatar: member.user.avatar },
            })),
            tasks: tasks.map((task) => ({
                id: task.id,
                title: task.title,
                columnId: task.columnId,
                assigneeId: task.assigneeId,
                assignees: task.assignees.map((a) => ({ userId: a.userId, user: { id: a.user.id } })),
                column: task.column
                    ? {
                        name: task.column.name,
                        board: {
                            project: task.column.board?.project
                                ? { id: task.column.board.project.id, name: task.column.board.project.name, color: task.column.board.project.color }
                                : null,
                        },
                    }
                    : null,
                push: task.push ? { id: task.push.id, name: task.push.name } : null,
                dueDate: task.dueDate,
                endDate: task.endDate,
                startDate: task.startDate,
                createdAt: task.createdAt,
                updatedAt: task.updatedAt,
                submittedAt: task.submittedAt,
                approvedAt: task.approvedAt,
                progress: task.progress,
                enableProgress: task.enableProgress,
                helpRequests: task.helpRequests,
                checklistItems: task.checklistItems,
                activityLogs: task.activityLogs,
            })),
            projects: extendedProjects,
        }
    },
})

export const getHeatmapPageData = query({
    args: {
        workspaceId: v.string(),
    },
    handler: async (ctx, args) => {
        const [activeProjects, workspaceMembers, workloadConfigDoc] = await Promise.all([
            getActiveWorkspaceProjects(ctx, args.workspaceId),
            buildWorkspaceMembers(ctx, args.workspaceId),
            ctx.db
                .query("workloadConfigs")
                .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
                .unique(),
        ])

        const projectIds = activeProjects.map((project) => project.id)
        const tasks = await hydrateTasks(ctx, await getTasksForProjectIds(ctx, projectIds))
        const projectLeads = new Map(
            await Promise.all(
                activeProjects.map(async (project) => [
                    project.id,
                    (await getProjectLeadUsers(ctx, project.id)).map((user) => ({
                        userId: user.id,
                        user: { name: user.name },
                    })),
                ] as const)
            )
        )

        return {
            config: workloadConfigDoc?.config ?? null,
            memberships: workspaceMembers.map((member) => ({
                userId: member.userId,
                name: member.name,
                role: member.role,
                user: {
                    name: member.user.name,
                    avatar: member.user.avatar,
                },
            })),
            tasks: tasks.map((task) => ({
                id: task.id,
                title: task.title,
                columnId: task.columnId,
                assigneeId: task.assigneeId,
                assignees: task.assignees.map((assignee) => ({
                    userId: assignee.userId,
                    user: { id: assignee.user.id },
                })),
                column: task.column
                    ? {
                        name: task.column.name,
                        board: {
                            project: task.column.board?.project
                                ? {
                                    id: task.column.board.project.id,
                                    name: task.column.board.project.name,
                                    color: task.column.board.project.color,
                                    leadAssignments: projectLeads.get(task.column.board.project.id) ?? [],
                                }
                                : null,
                        },
                    }
                    : null,
                push: task.push
                    ? {
                        id: task.push.id,
                        name: task.push.name,
                        color: task.push.color,
                    }
                    : null,
                dueDate: task.dueDate,
                endDate: task.endDate,
                startDate: task.startDate,
                createdAt: task.createdAt,
                updatedAt: task.updatedAt,
                submittedAt: task.submittedAt,
                approvedAt: task.approvedAt,
                progress: task.progress,
                enableProgress: task.enableProgress,
                helpRequests: task.helpRequests,
                checklistItems: task.checklistItems,
                activityLogs: task.activityLogs,
            })),
            projects: activeProjects.map((project) => ({
                id: project.id,
                name: project.name,
                color: project.color ?? "#6b7280",
                leadAssignments: projectLeads.get(project.id) ?? [],
            })),
        }
    },
})
