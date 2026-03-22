import { query } from "./_generated/server"
import { v } from "convex/values"
import {
    buildBoardTasks,
    buildTaskContext,
    buildTaskMeta,
    getProjectTasks as getProjectTasksForBoard,
    getTaskByLegacyId,
} from "./boardData"
import { stripDoc } from "./lib"

export const getContext = query({
    args: {
        taskId: v.string(),
    },
    handler: async (ctx, args) => buildTaskContext(ctx, args.taskId),
})

export const getMeta = query({
    args: {
        taskId: v.string(),
        workspaceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => buildTaskMeta(ctx, args.taskId, args.workspaceId),
})

export const getLeanProjectTasks = query({
    args: {
        projectId: v.string(),
        pushId: v.optional(v.union(v.string(), v.null())),
    },
    handler: async (ctx, args) => {
        const tasks = await getProjectTasksForBoard(ctx, args.projectId, { pushId: args.pushId })
        return buildBoardTasks(ctx, tasks, { latestAttachmentsOnly: true })
    },
})

export const getProjectTasks = query({
    args: {
        projectId: v.string(),
        pushId: v.optional(v.union(v.string(), v.null())),
    },
    handler: async (ctx, args) => {
        const tasks = await getProjectTasksForBoard(ctx, args.projectId, { pushId: args.pushId })
        return buildBoardTasks(ctx, tasks, { latestAttachmentsOnly: false })
    },
})

export const getById = query({
    args: {
        taskId: v.string(),
    },
    handler: async (ctx, args) => {
        const task = await getTaskByLegacyId(ctx, args.taskId)
        if (!task) return null

        const [boardTask] = await buildBoardTasks(ctx, [task], { latestAttachmentsOnly: false })
        return boardTask ?? null
    },
})

export const getComments = query({
    args: {
        taskId: v.string(),
        since: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        let comments = await ctx.db
            .query("comments")
            .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
            .collect()
        if (args.since !== undefined) {
            comments = comments.filter((c) => c.createdAt > args.since!)
        }
        comments = comments.slice().sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id))
        return Promise.all(comments.map(async (comment) => {
            const replyTo = comment.replyToId
                ? await ctx.db.query("comments").withIndex("by_legacy_id", (q) => q.eq("id", comment.replyToId!)).unique()
                : null
            return {
                ...stripDoc(comment),
                replyTo: replyTo ? { id: replyTo.id, content: replyTo.content, authorName: replyTo.authorName } : null,
            }
        }))
    },
})

export const countComments = query({
    args: { taskId: v.string() },
    handler: async (ctx, args) => {
        const comments = await ctx.db
            .query("comments")
            .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
            .collect()
        return comments.length
    },
})

export const getComment = query({
    args: { commentId: v.string() },
    handler: async (ctx, args) => {
        const comment = await ctx.db.query("comments").withIndex("by_legacy_id", (q) => q.eq("id", args.commentId)).unique()
        if (!comment) return null
        const replies = await ctx.db.query("comments").withIndex("by_replyToId", (q) => q.eq("replyToId", args.commentId)).collect()
        return { ...stripDoc(comment), replies: replies.map((r) => ({ id: r.id })) }
    },
})

export const getChecklistItems = query({
    args: { taskId: v.string() },
    handler: async (ctx, args) => {
        const items = await ctx.db
            .query("taskChecklistItems")
            .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
            .collect()
        return items.slice().sort((a, b) => a.order - b.order).map(stripDoc)
    },
})

export const getMaxChecklistOrder = query({
    args: { taskId: v.string() },
    handler: async (ctx, args) => {
        const items = await ctx.db.query("taskChecklistItems").withIndex("by_taskId", (q) => q.eq("taskId", args.taskId)).collect()
        if (items.length === 0) return -1
        return items.reduce((max, item) => Math.max(max, item.order), -1)
    },
})

export const getChecklistItem = query({
    args: { itemId: v.string() },
    handler: async (ctx, args) => {
        const item = await ctx.db
            .query("taskChecklistItems")
            .withIndex("by_legacy_id", (q) => q.eq("id", args.itemId))
            .unique()
        if (!item) return null
        return stripDoc(item)
    },
})

export const getAttachments = query({
    args: { taskId: v.string() },
    handler: async (ctx, args) => {
        const items = await ctx.db
            .query("taskAttachments")
            .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
            .collect()
        return items.slice().sort((a, b) => a.order - b.order).map(stripDoc)
    },
})

export const getAttachment = query({
    args: { attachmentId: v.string() },
    handler: async (ctx, args) => {
        const item = await ctx.db
            .query("taskAttachments")
            .withIndex("by_legacy_id", (q) => q.eq("id", args.attachmentId))
            .unique()
        if (!item) return null
        return stripDoc(item)
    },
})

export const getTaskById = query({
    args: { taskId: v.string() },
    handler: async (ctx, args) => {
        const task = await ctx.db.query("tasks").withIndex("by_legacy_id", (q) => q.eq("id", args.taskId)).unique()
        if (!task) return null
        return stripDoc(task)
    },
})

export const getOverdueTasks = query({
    args: {
        userId: v.string(),
        workspaceId: v.string(),
        now: v.number(),
    },
    handler: async (ctx, args) => {
        // Get all active (non-archived) projects in workspace
        const projects = await ctx.db
            .query("projects")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .collect()
        const activeProjectIds = new Set(
            projects.filter((p) => !p.archivedAt).map((p) => p.id)
        )

        // Build map of columnId -> column name for workspace boards
        const boards = await Promise.all(
            Array.from(activeProjectIds).map((projectId) =>
                ctx.db
                    .query("boards")
                    .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
                    .unique()
            )
        )
        const boardIds = boards.filter(Boolean).map((b) => b!.id)

        const columnsByBoard = await Promise.all(
            boardIds.map((boardId) =>
                ctx.db
                    .query("columns")
                    .withIndex("by_boardId", (q) => q.eq("boardId", boardId))
                    .collect()
            )
        )

        const columnNameMap = new Map<string, string>()
        const columnBoardMap = new Map<string, string>()
        for (const cols of columnsByBoard) {
            for (const col of cols) {
                columnNameMap.set(col.id, col.name)
                columnBoardMap.set(col.id, col.boardId)
            }
        }

        const boardProjectMap = new Map<string, string>()
        for (const board of boards) {
            if (board) boardProjectMap.set(board.id, board.projectId)
        }

        // Get tasks assigned to user via primary assigneeId
        const primaryAssignedTasks = await ctx.db
            .query("tasks")
            .withIndex("by_assigneeId", (q) => q.eq("assigneeId", args.userId))
            .collect()

        // Get tasks assigned to user via taskAssignees table
        const sharedAssignments = await ctx.db
            .query("taskAssignees")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .collect()

        const sharedTaskIds = new Set(sharedAssignments.map((a) => a.taskId))
        const sharedTasks = sharedTaskIds.size > 0
            ? await Promise.all(
                Array.from(sharedTaskIds).map((taskId) =>
                    ctx.db.query("tasks").withIndex("by_legacy_id", (q) => q.eq("id", taskId)).unique()
                )
            ).then((tasks) => tasks.filter((t): t is NonNullable<typeof t> => t !== null))
            : []

        // Merge all tasks, deduplicate by id
        const taskMap = new Map<string, typeof primaryAssignedTasks[0]>()
        for (const task of [...primaryAssignedTasks, ...sharedTasks]) {
            taskMap.set(task.id, task)
        }

        // Filter: overdue (dueDate < now), not in Done column, in active workspace project
        const result: Array<{
            id: string
            title: string
            projectId: string | null
        }> = []

        for (const task of taskMap.values()) {
            if (!task.dueDate || task.dueDate >= args.now) continue

            // Check column membership
            if (task.columnId) {
                const colName = columnNameMap.get(task.columnId)
                if (colName === 'Done') continue
                const boardId = columnBoardMap.get(task.columnId)
                if (!boardId) continue
                const projectId = boardProjectMap.get(boardId)
                if (!projectId || !activeProjectIds.has(projectId)) continue
                result.push({ id: task.id, title: task.title, projectId })
            } else if (task.pushId) {
                // Task in a push - find its project via push
                const push = await ctx.db
                    .query("pushes")
                    .withIndex("by_legacy_id", (q) => q.eq("id", task.pushId!))
                    .unique()
                if (!push || !activeProjectIds.has(push.projectId)) continue
                result.push({ id: task.id, title: task.title, projectId: push.projectId })
            }
        }

        return result
    },
})

export const getAssignedTaskCountsByProject = query({
    args: {
        userId: v.string(),
        workspaceId: v.string(),
    },
    handler: async (ctx, args) => {
        // Get all active projects in workspace
        const projects = await ctx.db
            .query("projects")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .collect()
        const activeProjectIds = new Set(
            projects.filter((p) => !p.archivedAt).map((p) => p.id)
        )

        // Build column -> board -> project maps
        const boards = await Promise.all(
            Array.from(activeProjectIds).map((projectId) =>
                ctx.db
                    .query("boards")
                    .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
                    .unique()
            )
        )
        const boardProjectMap = new Map<string, string>()
        const columnBoardMap = new Map<string, string>()
        const columnNameMap = new Map<string, string>()
        for (const board of boards) {
            if (!board) continue
            boardProjectMap.set(board.id, board.projectId)
            const cols = await ctx.db
                .query("columns")
                .withIndex("by_boardId", (q) => q.eq("boardId", board.id))
                .collect()
            for (const col of cols) {
                columnBoardMap.set(col.id, col.boardId)
                columnNameMap.set(col.id, col.name)
            }
        }

        // Get tasks assigned via primary assigneeId
        const primaryTasks = await ctx.db
            .query("tasks")
            .withIndex("by_assigneeId", (q) => q.eq("assigneeId", args.userId))
            .collect()

        // Get tasks assigned via taskAssignees table
        const sharedAssignments = await ctx.db
            .query("taskAssignees")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .collect()
        const sharedTaskIds = new Set(sharedAssignments.map((a) => a.taskId))
        const sharedTasks = sharedTaskIds.size > 0
            ? await Promise.all(
                Array.from(sharedTaskIds).map((taskId) =>
                    ctx.db.query("tasks").withIndex("by_legacy_id", (q) => q.eq("id", taskId)).unique()
                )
            ).then((tasks) => tasks.filter((t): t is NonNullable<typeof t> => t !== null))
            : []

        // Merge, deduplicate
        const taskMap = new Map<string, typeof primaryTasks[0]>()
        for (const task of [...primaryTasks, ...sharedTasks]) {
            taskMap.set(task.id, task)
        }

        // Count tasks per project, excluding Done columns
        const counts: Record<string, number> = {}
        for (const task of taskMap.values()) {
            if (task.columnId) {
                if (columnNameMap.get(task.columnId) === 'Done') continue
                const boardId = columnBoardMap.get(task.columnId)
                if (!boardId) continue
                const projectId = boardProjectMap.get(boardId)
                if (!projectId || !activeProjectIds.has(projectId)) continue
                counts[projectId] = (counts[projectId] ?? 0) + 1
            } else if (task.pushId) {
                const push = await ctx.db
                    .query("pushes")
                    .withIndex("by_legacy_id", (q) => q.eq("id", task.pushId!))
                    .unique()
                if (!push || !activeProjectIds.has(push.projectId)) continue
                counts[push.projectId] = (counts[push.projectId] ?? 0) + 1
            }
        }

        return counts
    },
})
