import type { QueryCtx } from "./_generated/server"
import type { Doc } from "./_generated/dataModel"

type LegacyIdTable =
    | "users"
    | "projects"
    | "boards"
    | "columns"
    | "tasks"
    | "pushes"
    | "projectLeadAssignments"
    | "projectMembers"
    | "taskAssignees"
    | "comments"
    | "taskAttachments"
    | "taskChecklistItems"
    | "helpRequests"
    | "activityLogs"
    | "taskDeletions"
    | "workspaceMembers"
    | "workspaces"

type BoardTaskDoc = Doc<"tasks">

function toIso(timestamp: number | null | undefined) {
    return typeof timestamp === "number" ? new Date(timestamp).toISOString() : null
}

export async function getByLegacyId<TableName extends LegacyIdTable>(
    ctx: QueryCtx,
    table: TableName,
    legacyId: string
): Promise<Doc<TableName> | null> {
    const rows = await (ctx.db.query(table as never) as any)
        .withIndex("by_legacy_id", (q: any) => q.eq("id", legacyId))
        .collect()

    return (rows[0] ?? null) as Doc<TableName> | null
}

export async function getProjectByLegacyId(ctx: QueryCtx, projectId: string) {
    return getByLegacyId(ctx, "projects", projectId)
}

export async function getTaskByLegacyId(ctx: QueryCtx, taskId: string) {
    return getByLegacyId(ctx, "tasks", taskId)
}

export async function getUserByLegacyId(ctx: QueryCtx, userId: string) {
    return getByLegacyId(ctx, "users", userId)
}

export async function getBoardForProject(ctx: QueryCtx, projectId: string) {
    const boards = await ctx.db
        .query("boards")
        .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
        .collect()

    return boards[0] ?? null
}

export async function getColumnsForBoard(ctx: QueryCtx, boardId: string) {
    const columns = await ctx.db
        .query("columns")
        .withIndex("by_boardId", (q) => q.eq("boardId", boardId))
        .collect()

    return columns.slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

export async function getProjectColumns(ctx: QueryCtx, projectId: string) {
    const board = await getBoardForProject(ctx, projectId)
    if (!board) {
        return { board: null, columns: [] as Doc<"columns">[] }
    }

    const columns = await getColumnsForBoard(ctx, board.id)
    return { board, columns }
}

export async function getProjectTasks(
    ctx: QueryCtx,
    projectId: string,
    options?: { pushId?: string | null }
) {
    const { columns } = await getProjectColumns(ctx, projectId)
    const tasksByColumn = await Promise.all(
        columns.map((column) =>
            ctx.db
                .query("tasks")
                .withIndex("by_columnId", (q) => q.eq("columnId", column.id))
                .collect()
        )
    )

    const pushId = options?.pushId

    return tasksByColumn
        .flat()
        .filter((task) => {
            if (pushId === undefined) return true
            if (pushId === null) return !task.pushId
            return task.pushId === pushId
        })
        .sort(compareTasksByUpdatedAtDesc)
}

export function compareTasksByUpdatedAtDesc(a: BoardTaskDoc, b: BoardTaskDoc) {
    const byUpdatedAt = (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    if (byUpdatedAt !== 0) return byUpdatedAt
    return b.id.localeCompare(a.id)
}

export async function getProjectLeadUsers(ctx: QueryCtx, projectId: string) {
    const assignments = await ctx.db
        .query("projectLeadAssignments")
        .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
        .collect()

    const sortedAssignments = assignments
        .slice()
        .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id))

    const users = await Promise.all(sortedAssignments.map((assignment) => getUserByLegacyId(ctx, assignment.userId)))

    return users
        .filter((user): user is NonNullable<typeof user> => user !== null)
        .map((user) => ({ id: user.id, name: user.name }))
}

export async function getProjectMemberIds(ctx: QueryCtx, projectId: string) {
    const [members, leadAssignments] = await Promise.all([
        ctx.db
            .query("projectMembers")
            .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
            .collect(),
        ctx.db
            .query("projectLeadAssignments")
            .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
            .collect(),
    ])

    return new Set([
        ...members.map((member) => member.userId),
        ...leadAssignments.map((assignment) => assignment.userId),
    ])
}

export async function getWorkspaceUsersForProject(ctx: QueryCtx, workspaceId: string, projectId: string) {
    const [memberships, projectMemberIds] = await Promise.all([
        ctx.db
            .query("workspaceMembers")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
            .collect(),
        getProjectMemberIds(ctx, projectId),
    ])

    const users = await Promise.all(
        memberships.map(async (membership) => {
            const user = await getUserByLegacyId(ctx, membership.userId)
            if (!user) return null

            return {
                id: user.id,
                name: membership.name || user.name || "Unknown",
                role: membership.role || "Member",
                isProjectMember: projectMemberIds.has(user.id),
            }
        })
    )

    return users
        .filter((user): user is NonNullable<typeof user> => user !== null)
        .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getPushesForProject(ctx: QueryCtx, projectId: string) {
    const pushes = await ctx.db
        .query("pushes")
        .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
        .collect()

    return pushes.slice().sort((a, b) => (a.startDate ?? 0) - (b.startDate ?? 0) || a.id.localeCompare(b.id))
}

async function buildTaskAssigneeMap(ctx: QueryCtx, tasks: BoardTaskDoc[]) {
    const rows = await Promise.all(
        tasks.map((task) =>
            ctx.db
                .query("taskAssignees")
                .withIndex("by_taskId", (q) => q.eq("taskId", task.id))
                .collect()
        )
    )

    const userIds = new Set(rows.flat().map((row) => row.userId))
    const users = await Promise.all(Array.from(userIds).map((userId) => getUserByLegacyId(ctx, userId)))
    const userMap = new Map(
        users
            .filter((user): user is NonNullable<typeof user> => user !== null)
            .map((user) => [user.id, user] as const)
    )

    return new Map(
        tasks.map((task, index) => [
            task.id,
            rows[index]
                .map((row) => userMap.get(row.userId))
                .filter((user): user is NonNullable<typeof user> => user !== undefined)
                .map((user) => ({
                    user: {
                        id: user.id,
                        name: user.name,
                    },
                })),
        ])
    )
}

async function buildLatestDoneLogMap(ctx: QueryCtx, tasks: BoardTaskDoc[]) {
    const rows = await Promise.all(
        tasks.map((task) =>
            ctx.db
                .query("activityLogs")
                .withIndex("by_taskId", (q) => q.eq("taskId", task.id))
                .collect()
        )
    )

    return new Map(
        tasks.map((task, index) => {
            const latestDoneLog = rows[index]
                .filter((log) => log.newValue === "Done")
                .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || b.id.localeCompare(a.id))[0]

            return [
                task.id,
                latestDoneLog
                    ? [{
                        changedByName: latestDoneLog.changedByName,
                        createdAt: new Date(latestDoneLog.createdAt).toISOString(),
                    }]
                    : [],
            ] as const
        })
    )
}

async function buildLatestCommentMap(ctx: QueryCtx, tasks: BoardTaskDoc[]) {
    const rows = await Promise.all(
        tasks.map((task) =>
            ctx.db
                .query("comments")
                .withIndex("by_taskId", (q) => q.eq("taskId", task.id))
                .collect()
        )
    )

    return new Map(
        tasks.map((task, index) => {
            const latestComment = rows[index]
                .slice()
                .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || b.id.localeCompare(a.id))[0]

            return [
                task.id,
                latestComment ? [{ createdAt: new Date(latestComment.createdAt).toISOString() }] : [],
            ] as const
        })
    )
}

async function buildAttachmentMap(ctx: QueryCtx, tasks: BoardTaskDoc[], latestOnly: boolean) {
    const rows = await Promise.all(
        tasks.map((task) =>
            ctx.db
                .query("taskAttachments")
                .withIndex("by_taskId", (q) => q.eq("taskId", task.id))
                .collect()
        )
    )

    return new Map(
        tasks.map((task, index) => {
            const sortedAttachments = rows[index]
                .slice()
                .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || b.id.localeCompare(a.id))
            const attachments = (latestOnly ? sortedAttachments.slice(0, 1) : sortedAttachments).map((attachment) => ({
                id: attachment.id,
                createdAt: new Date(attachment.createdAt).toISOString(),
            }))

            return [task.id, attachments] as const
        })
    )
}

export async function buildBoardTasks(
    ctx: QueryCtx,
    tasks: BoardTaskDoc[],
    options?: { latestAttachmentsOnly?: boolean }
) {
    const latestAttachmentsOnly = options?.latestAttachmentsOnly ?? true
    const directAssigneeIds = Array.from(
        new Set(tasks.map((task) => task.assigneeId).filter((assigneeId): assigneeId is string => Boolean(assigneeId)))
    )
    const pushIds = Array.from(
        new Set(tasks.map((task) => task.pushId).filter((pushId): pushId is string => Boolean(pushId)))
    )

    const [directAssignees, pushes, taskAssignees, latestDoneLogs, latestComments, attachments] = await Promise.all([
        Promise.all(directAssigneeIds.map((userId) => getUserByLegacyId(ctx, userId))),
        Promise.all(pushIds.map((pushId) => getByLegacyId(ctx, "pushes", pushId))),
        buildTaskAssigneeMap(ctx, tasks),
        buildLatestDoneLogMap(ctx, tasks),
        buildLatestCommentMap(ctx, tasks),
        buildAttachmentMap(ctx, tasks, latestAttachmentsOnly),
    ])

    const directAssigneeMap = new Map(
        directAssignees
            .filter((user): user is NonNullable<typeof user> => user !== null)
            .map((user) => [user.id, user] as const)
    )
    const pushMap = new Map(
        pushes
            .filter((push): push is NonNullable<typeof push> => push !== null)
            .map((push) => [push.id, push] as const)
    )

    return tasks.map((task) => {
        const directAssignee = task.assigneeId ? directAssigneeMap.get(task.assigneeId) ?? null : null
        const push = task.pushId ? pushMap.get(task.pushId) ?? null : null

        return {
            id: task.id,
            title: task.title,
            description: task.description ?? null,
            status: task.status,
            assigneeId: task.assigneeId ?? null,
            columnId: task.columnId ?? null,
            priority: task.priority,
            requireAttachment: task.requireAttachment,
            attachmentFolderId: task.attachmentFolderId ?? null,
            attachmentFolderName: task.attachmentFolderName ?? null,
            instructionsFileUrl: task.instructionsFileUrl ?? null,
            instructionsFileName: task.instructionsFileName ?? null,
            progress: task.progress,
            enableProgress: task.enableProgress,
            startDate: toIso(task.startDate),
            endDate: toIso(task.endDate),
            dueDate: toIso(task.dueDate),
            submittedAt: toIso(task.submittedAt),
            approvedAt: toIso(task.approvedAt),
            createdAt: new Date(task.createdAt).toISOString(),
            updatedAt: new Date(task.updatedAt).toISOString(),
            assignee: directAssignee
                ? {
                    id: directAssignee.id,
                    name: directAssignee.name,
                }
                : null,
            assignees: taskAssignees.get(task.id) ?? [],
            activityLogs: latestDoneLogs.get(task.id) ?? [],
            comments: latestComments.get(task.id) ?? [],
            attachments: attachments.get(task.id) ?? [],
            push: push
                ? {
                    id: push.id,
                    name: push.name,
                    color: push.color,
                    status: push.status,
                }
                : null,
        }
    })
}

export async function buildPushSummaries(ctx: QueryCtx, projectId: string, columns: Doc<"columns">[], tasks: BoardTaskDoc[]) {
    const pushes = await getPushesForProject(ctx, projectId)
    const doneColumnIds = new Set(
        columns
            .filter((column) => column.name === "Done")
            .map((column) => column.id)
    )

    return pushes.map((push) => {
        const pushTasks = tasks.filter((task) => task.pushId === push.id)
        const completedCount = pushTasks.filter((task) => task.columnId && doneColumnIds.has(task.columnId)).length

        return {
            id: push.id,
            name: push.name,
            startDate: new Date(push.startDate).toISOString(),
            endDate: toIso(push.endDate) ?? "",
            status: push.status,
            color: push.color,
            projectId: push.projectId,
            dependsOnId: push.dependsOnId ?? null,
            taskCount: pushTasks.length,
            completedCount,
        }
    })
}

export async function buildProjectPageData(
    ctx: QueryCtx,
    projectId: string,
    workspaceId?: string | null
) {
    const project = await getProjectByLegacyId(ctx, projectId)
    if (!project) return null
    if (workspaceId && project.workspaceId !== workspaceId) return null

    const [{ board, columns }, leads, users, tasks] = await Promise.all([
        getProjectColumns(ctx, projectId),
        getProjectLeadUsers(ctx, projectId),
        project.workspaceId ? getWorkspaceUsersForProject(ctx, project.workspaceId, projectId) : Promise.resolve([]),
        getProjectTasks(ctx, projectId),
    ])

    const boardTasks = await buildBoardTasks(ctx, tasks, { latestAttachmentsOnly: true })
    const tasksByColumnId = new Map<string, typeof boardTasks>()

    for (const task of boardTasks) {
        if (!task.columnId) continue
        const existing = tasksByColumnId.get(task.columnId) ?? []
        existing.push(task)
        tasksByColumnId.set(task.columnId, existing)
    }

    const pushes = await buildPushSummaries(ctx, projectId, columns, tasks)

    return {
        project: {
            id: project.id,
            name: project.name,
            color: project.color,
            archivedAt: toIso(project.archivedAt),
            leads,
        },
        board: board
            ? {
                id: board.id,
                name: board.name,
                columns: columns.map((column) => ({
                    id: column.id,
                    name: column.name,
                    order: column.order,
                    tasks: tasksByColumnId.get(column.id) ?? [],
                })),
            }
            : null,
        users,
        pushes,
    }
}

export async function buildTaskMeta(
    ctx: QueryCtx,
    taskId: string,
    workspaceId?: string | null
) {
    const task = await getTaskByLegacyId(ctx, taskId)
    if (!task) return null

    const context = await buildTaskContext(ctx, task.id)
    if (!context) return null
    if (workspaceId && context.workspaceId !== workspaceId) return null

    return {
        id: task.id,
        projectId: context.projectId,
        pushId: task.pushId ?? null,
        columnId: task.columnId ?? null,
    }
}

export async function buildTaskContext(ctx: QueryCtx, taskId: string) {
    const task = await getTaskByLegacyId(ctx, taskId)
    if (!task) return null

    let projectId: string | null = null
    let workspaceId: string | null = null

    if (task.columnId) {
        const column = await getByLegacyId(ctx, "columns", task.columnId)
        if (column) {
            const board = await getByLegacyId(ctx, "boards", column.boardId)
            if (board) {
                projectId = board.projectId
                const project = await getProjectByLegacyId(ctx, board.projectId)
                workspaceId = project?.workspaceId ?? null
            }
        }
    }

    if (!projectId && task.pushId) {
        const push = await getByLegacyId(ctx, "pushes", task.pushId)
        if (push) {
            projectId = push.projectId
            const project = await getProjectByLegacyId(ctx, push.projectId)
            workspaceId = project?.workspaceId ?? null
        }
    }

    return {
        id: task.id,
        title: task.title ?? null,
        projectId,
        workspaceId,
    }
}

export async function buildProjectSyncData(
    ctx: QueryCtx,
    projectId: string,
    args?: {
        workspaceId?: string | null
        since?: string | null
        cursor?: string | null
        limit?: number | null
    }
) {
    const project = await getProjectByLegacyId(ctx, projectId)
    if (!project) return null
    if (args?.workspaceId && project.workspaceId !== args.workspaceId) return null

    const limit = Math.min(200, Math.max(1, args?.limit ?? 100))
    const sinceMs = args?.since ? new Date(args.since).getTime() : null

    let cursor: { updatedAt: number; id: string } | null = null
    if (args?.cursor) {
        const [updatedAtIso, cursorId] = args.cursor.split("::")
        const updatedAt = updatedAtIso ? new Date(updatedAtIso).getTime() : NaN
        if (cursorId && !Number.isNaN(updatedAt)) {
            cursor = { updatedAt, id: cursorId }
        }
    }

    const tasks = await getProjectTasks(ctx, projectId)
    const filteredTasks = tasks.filter((task) => {
        if (sinceMs !== null && (task.updatedAt ?? 0) <= sinceMs) return false
        if (!cursor) return true

        const taskUpdatedAt = task.updatedAt ?? 0
        if (taskUpdatedAt < cursor.updatedAt) return true
        if (taskUpdatedAt === cursor.updatedAt && task.id < cursor.id) return true
        return false
    })

    const sortedTasks = filteredTasks.slice().sort(compareTasksByUpdatedAtDesc)
    const hasMore = sortedTasks.length > limit
    const pageTasks = hasMore ? sortedTasks.slice(0, limit) : sortedTasks
    const nextCursor = hasMore && pageTasks.length > 0
        ? `${toIso(pageTasks[pageTasks.length - 1].updatedAt)}::${pageTasks[pageTasks.length - 1].id}`
        : null

    const boardTasks = await buildBoardTasks(ctx, pageTasks, { latestAttachmentsOnly: true })
    const syncTasks = boardTasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        columnId: task.columnId,
        updatedAt: task.updatedAt,
        assignee: task.assignee,
        assignees: task.assignees,
        push: task.push,
        startDate: task.startDate,
        endDate: task.endDate,
        requireAttachment: task.requireAttachment,
        attachmentFolderId: task.attachmentFolderId,
        attachmentFolderName: task.attachmentFolderName,
        hasAttachment: (task.attachments?.length ?? 0) > 0,
    }))

    const deletions = await ctx.db
        .query("taskDeletions")
        .withIndex("by_projectId_deletedAt", (q) => q.eq("projectId", projectId))
        .collect()

    const filteredDeletions = deletions
        .filter((deletion) => sinceMs === null || deletion.deletedAt > sinceMs)
        .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0) || b.id.localeCompare(a.id))

    const latestUpdate = pageTasks[0] ? toIso(pageTasks[0].updatedAt) : null
    const latestDeletion = filteredDeletions[0] ? toIso(filteredDeletions[0].deletedAt) : null
    const lastUpdate = [latestUpdate, latestDeletion, args?.since ?? null]
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? new Date().toISOString()

    return {
        hasChanges: syncTasks.length > 0 || filteredDeletions.length > 0,
        tasks: syncTasks,
        deletedTaskIds: filteredDeletions.map((deletion) => deletion.taskId),
        latestUpdate,
        latestDeletion,
        hasMore,
        nextCursor,
        lastUpdate,
        serverTime: new Date().toISOString(),
    }
}
