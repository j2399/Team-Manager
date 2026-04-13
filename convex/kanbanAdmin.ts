import { mutation } from "./_generated/server"
import { v } from "convex/values"
import { createLegacyId, stripDoc } from "./lib"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getByLegacyId(db: any, table: string, legacyId: string) {
    const rows = await db
        .query(table)
        .withIndex("by_legacy_id", (q: any) => q.eq("id", legacyId))
        .collect()
    return rows[0] ?? null
}

async function getFirstColumnForProject(db: any, projectId: string): Promise<string | null> {
    const boards = await db
        .query("boards")
        .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
        .collect()
    const board = boards[0] ?? null
    if (!board) return null

    const columns = await db
        .query("columns")
        .withIndex("by_boardId", (q: any) => q.eq("boardId", board.id))
        .collect()

    const sorted = (columns as any[]).slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    return sorted[0]?.id ?? null
}

async function getColumnBoardProject(db: any, columnId: string) {
    const column = await getByLegacyId(db, "columns", columnId)
    if (!column) return null
    const board = await getByLegacyId(db, "boards", column.boardId)
    if (!board) return null
    const project = await getByLegacyId(db, "projects", board.projectId)
    if (!project) return null
    return { column, board, project }
}

async function insertActivityLog(
    db: any,
    data: {
        taskId: string
        taskTitle: string
        action: string
        field?: string
        oldValue?: string
        newValue?: string
        changedBy: string
        changedByName: string
        details?: string
        createdAt: number
    }
) {
    await db.insert("activityLogs", {
        id: createLegacyId("activity_log"),
        taskId: data.taskId,
        taskTitle: data.taskTitle,
        action: data.action,
        field: data.field,
        oldValue: data.oldValue,
        newValue: data.newValue,
        changedBy: data.changedBy,
        changedByName: data.changedByName,
        details: data.details,
        createdAt: data.createdAt,
    })
}

// ---------------------------------------------------------------------------
// createTask
// ---------------------------------------------------------------------------

export const createTask = mutation({
    args: {
        taskId: v.string(),
        title: v.string(),
        projectId: v.string(),
        workspaceId: v.string(),
        columnId: v.optional(v.string()),
        description: v.optional(v.string()),
        assigneeId: v.optional(v.string()),
        assigneeIds: v.optional(v.array(v.string())),
        requireAttachment: v.boolean(),
        enableProgress: v.boolean(),
        progress: v.number(),
        pushId: v.optional(v.string()),
        attachmentFolderId: v.optional(v.union(v.string(), v.null())),
        attachmentFolderName: v.optional(v.union(v.string(), v.null())),
        now: v.number(),
        createdBy: v.string(),
        createdByName: v.string(),
    },
    handler: async (ctx, args) => {
        const primaryTitle = args.title.trim()
        if (!primaryTitle) {
            return { error: "Title is required" }
        }

        // Validate project belongs to workspaceId
        const project = await getByLegacyId(ctx.db, "projects", args.projectId)
        if (!project || project.workspaceId !== args.workspaceId) {
            return { error: "Project not found" }
        }

        // Resolve target column
        let targetColumnId = args.columnId
        if (!targetColumnId) {
            const firstColId = await getFirstColumnForProject(ctx.db, args.projectId)
            if (!firstColId) {
                return { error: "No column found for this project" }
            }
            targetColumnId = firstColId
        }

        // Validate target column exists and belongs to project
        const colBoardProject = await getColumnBoardProject(ctx.db, targetColumnId)
        if (!colBoardProject || colBoardProject.board.projectId !== args.projectId) {
            return { error: "Column not found" }
        }

        // Validate push if provided
        if (args.pushId) {
            const push = await getByLegacyId(ctx.db, "pushes", args.pushId)
            if (!push || push.projectId !== args.projectId) {
                return { error: "Push not found" }
            }
        }

        // Create taskAssignee rows for all unique assignee IDs
        const allAssigneeIds = Array.from(
            new Set([
                ...(args.assigneeId && args.assigneeId !== "" ? [args.assigneeId] : []),
                ...(args.assigneeIds ?? []),
            ])
        ).filter((id) => id.trim().length > 0)

        await ctx.db.insert("tasks", {
            id: args.taskId,
            title: primaryTitle,
            description: args.description?.trim() || undefined,
            status: "Todo",
            priority: "Medium",
            columnId: targetColumnId,
            assigneeId: args.assigneeId && args.assigneeId !== "" ? args.assigneeId : undefined,
            pushId: args.pushId,
            requireAttachment: args.requireAttachment,
            enableProgress: args.enableProgress,
            progress: args.progress,
            attachmentFolderId: args.attachmentFolderId ?? undefined,
            attachmentFolderName: args.attachmentFolderName ?? undefined,
            createdAt: args.now,
            updatedAt: args.now,
        })

        for (const userId of allAssigneeIds) {
            await ctx.db.insert("taskAssignees", {
                id: createLegacyId("task_assignee"),
                taskId: args.taskId,
                userId,
                createdAt: args.now,
            })
        }

        await insertActivityLog(ctx.db, {
            taskId: args.taskId,
            taskTitle: primaryTitle,
            action: "created",
            changedBy: args.createdBy,
            changedByName: args.createdByName,
            details: `Task "${primaryTitle}" was created`,
            createdAt: args.now,
        })

        // Get workspace discordChannelId for Discord notifications
        const workspace = await ctx.db
            .query("workspaces")
            .withIndex("by_legacy_id", (q: any) => q.eq("id", args.workspaceId))
            .unique()

        return {
            success: true as const,
            task: { id: args.taskId, columnId: targetColumnId, assigneeIds: allAssigneeIds },
            projectName: project.name as string,
            workspaceDiscordChannelId: workspace?.discordChannelId ?? null,
        }
    },
})

// ---------------------------------------------------------------------------
// updateTaskStatus
// ---------------------------------------------------------------------------

export const updateTaskStatus = mutation({
    args: {
        taskId: v.string(),
        columnId: v.string(),
        workspaceId: v.string(),
        userRole: v.string(),
        now: v.number(),
        changedBy: v.string(),
        changedByName: v.string(),
    },
    handler: async (ctx, args) => {
        // Get task
        const task = await getByLegacyId(ctx.db, "tasks", args.taskId)
        if (!task) {
            return { error: "Task not found" }
        }

        // Validate workspace via column→board→project
        if (!task.columnId) {
            return { error: "Task has no column" }
        }
        const sourceCtx = await getColumnBoardProject(ctx.db, task.columnId)
        if (!sourceCtx || sourceCtx.project.workspaceId !== args.workspaceId) {
            return { error: "Task not found" }
        }

        // Get target column
        const targetColCtx = await getColumnBoardProject(ctx.db, args.columnId)
        if (!targetColCtx || targetColCtx.board.projectId !== sourceCtx.board.projectId) {
            return { error: "Target column not found" }
        }

        const sourceColumnName = sourceCtx.column.name as string
        const targetColumnName = targetColCtx.column.name as string
        const projectId = sourceCtx.board.projectId as string

        // RBAC: Members cannot move to Done
        if (args.userRole === "Member" && targetColumnName === "Done") {
            return { error: "Unauthorized: Only Admins and Team Leads can move tasks to Done" }
        }
        // Members cannot move out of Review or Done
        if (args.userRole === "Member" && (sourceColumnName === "Review" || sourceColumnName === "Done")) {
            return { error: "Unauthorized: Only Admins and Team Leads can move tasks from Review or Done" }
        }

        // Attachment check for non-admin/lead moving to Review or Done
        const canOverride = args.userRole === "Admin" || args.userRole === "Team Lead"
        if (!canOverride && (targetColumnName === "Review" || targetColumnName === "Done") && task.requireAttachment) {
            const attachments = await ctx.db
                .query("taskAttachments")
                .withIndex("by_taskId", (q: any) => q.eq("taskId", args.taskId))
                .collect()
            if (attachments.length === 0) {
                return {
                    error: "ATTACHMENT_REQUIRED" as const,
                    message: "This task requires a file upload before it can be submitted for review or completion.",
                }
            }
        }

        // Build patch
        const patch: Record<string, unknown> = {
            columnId: args.columnId,
            updatedAt: args.now,
        }
        if (targetColumnName === "Review" && !task.submittedAt) {
            patch.submittedAt = args.now
        }
        if (targetColumnName === "Done") {
            patch.approvedAt = args.now
        }
        if (sourceColumnName === "Done" && targetColumnName !== "Done") {
            patch.approvedAt = undefined
        }

        // Patch task
        const taskDoc = await ctx.db
            .query("tasks")
            .withIndex("by_legacy_id", (q: any) => q.eq("id", args.taskId))
            .unique()
        if (taskDoc) {
            await ctx.db.patch(taskDoc._id, patch)
        }

        // Insert activity log
        await insertActivityLog(ctx.db, {
            taskId: args.taskId,
            taskTitle: task.title,
            action: "moved",
            field: "status",
            oldValue: sourceColumnName,
            newValue: targetColumnName,
            changedBy: args.changedBy,
            changedByName: args.changedByName,
            details: `Moved from "${sourceColumnName}" to "${targetColumnName}"`,
            createdAt: args.now,
        })

        // If push is Completed and task moved out of Done, reopen push
        if (task.pushId && targetColumnName !== "Done") {
            const push = await getByLegacyId(ctx.db, "pushes", task.pushId)
            if (push && push.status === "Completed") {
                const pushDoc = await ctx.db
                    .query("pushes")
                    .withIndex("by_legacy_id", (q: any) => q.eq("id", task.pushId))
                    .unique()
                if (pushDoc) {
                    await ctx.db.patch(pushDoc._id, { status: "Active", updatedAt: args.now })
                }
            }
        }

        // Get workspace discordChannelId and lead discordIds for Discord notifications
        const workspace = await ctx.db
            .query("workspaces")
            .withIndex("by_legacy_id", (q: any) => q.eq("id", args.workspaceId))
            .unique()

        const leadAssignments = await ctx.db
            .query("projectLeadAssignments")
            .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
            .collect()

        const leadDiscordIds: string[] = []
        for (const assignment of leadAssignments) {
            const user = await ctx.db
                .query("users")
                .withIndex("by_legacy_id", (q: any) => q.eq("id", assignment.userId))
                .unique()
            if (user?.discordId) {
                leadDiscordIds.push(user.discordId)
            }
        }

        // Get push status for UI update
        let pushInfo: { id: string; status: string } | null = null
        if (task.pushId) {
            const push = await getByLegacyId(ctx.db, "pushes", task.pushId)
            if (push) {
                pushInfo = { id: push.id as string, status: push.status as string }
            }
        }

        return {
            success: true as const,
            sourceColumnName,
            targetColumnName,
            projectId,
            taskTitle: task.title as string,
            workspaceDiscordChannelId: workspace?.discordChannelId ?? null,
            leadDiscordIds,
            push: pushInfo,
        }
    },
})

// ---------------------------------------------------------------------------
// updateTaskDetails
// ---------------------------------------------------------------------------

export const updateTaskDetails = mutation({
    args: {
        taskId: v.string(),
        workspaceId: v.string(),
        userRole: v.string(),
        now: v.number(),
        changedBy: v.string(),
        changedByName: v.string(),
        // Optional fields
        title: v.optional(v.string()),
        description: v.optional(v.union(v.string(), v.null())),
        assigneeId: v.optional(v.union(v.string(), v.null())),
        assigneeIds: v.optional(v.array(v.string())),
        requireAttachment: v.optional(v.boolean()),
        enableProgress: v.optional(v.boolean()),
        progress: v.optional(v.number()),
        attachmentFolderId: v.optional(v.union(v.string(), v.null())),
        attachmentFolderName: v.optional(v.union(v.string(), v.null())),
    },
    handler: async (ctx, args) => {
        // Get task
        const task = await getByLegacyId(ctx.db, "tasks", args.taskId)
        if (!task) {
            return { error: "Task not found" }
        }

        // Validate workspace via column→board→project
        if (!task.columnId) {
            return { error: "Task has no column" }
        }
        const colCtx = await getColumnBoardProject(ctx.db, task.columnId)
        if (!colCtx || colCtx.project.workspaceId !== args.workspaceId) {
            return { error: "Task not found" }
        }

        // Members cannot edit tasks in Review or Done
        if (args.userRole === "Member") {
            const columnName = colCtx.column.name as string
            if (columnName === "Review" || columnName === "Done") {
                return { error: "Unauthorized: Cannot edit tasks in Review or Done" }
            }
        }

        const projectId = colCtx.board.projectId as string

        // Get old assignee IDs
        const existingAssigneeRows = await ctx.db
            .query("taskAssignees")
            .withIndex("by_taskId", (q: any) => q.eq("taskId", args.taskId))
            .collect()
        const oldAssignedIds = new Set<string>([
            ...(task.assigneeId ? [task.assigneeId as string] : []),
            ...existingAssigneeRows.map((row: any) => row.userId as string),
        ])

        // Get old assignee name for change tracking
        let oldAssigneeName = "Unassigned"
        if (task.assigneeId) {
            const oldAssigneeUser = await ctx.db
                .query("users")
                .withIndex("by_legacy_id", (q: any) => q.eq("id", task.assigneeId))
                .unique()
            oldAssigneeName = oldAssigneeUser?.name ?? "Unassigned"
        }

        // Track changes
        const activityEntries: Array<{
            action: string
            field: string
            oldValue: string
            newValue: string
        }> = []

        // Title
        const nextTitle = args.title !== undefined ? args.title.trim() : undefined
        if (nextTitle !== undefined && nextTitle.length === 0) {
            return { error: "Title is required" }
        }
        const titleChanged = nextTitle !== undefined && nextTitle !== task.title
        if (titleChanged) {
            activityEntries.push({
                action: "updated",
                field: "title",
                oldValue: task.title,
                newValue: nextTitle!,
            })
        }

        // Assignee (direct)
        let newAssigneeName = oldAssigneeName
        if (args.assigneeId !== undefined && args.assigneeId !== task.assigneeId) {
            if (args.assigneeId && args.assigneeId !== "") {
                const newAssigneeUser = await ctx.db
                    .query("users")
                    .withIndex("by_legacy_id", (q: any) => q.eq("id", args.assigneeId))
                    .unique()
                newAssigneeName = newAssigneeUser?.name ?? "Unassigned"
            } else {
                newAssigneeName = "Unassigned"
            }
            activityEntries.push({
                action: "updated",
                field: "assignee",
                oldValue: oldAssigneeName,
                newValue: newAssigneeName,
            })
        }

        // Description
        if (args.description !== undefined && args.description !== task.description) {
            activityEntries.push({
                action: "updated",
                field: "description",
                oldValue: task.description ?? "",
                newValue: args.description ?? "",
            })
        }

        // Build task patch
        const taskPatch: Record<string, unknown> = { updatedAt: args.now }
        if (titleChanged) taskPatch.title = nextTitle
        if (args.description !== undefined) taskPatch.description = args.description ?? undefined
        if (args.assigneeId !== undefined) {
            taskPatch.assigneeId = args.assigneeId && args.assigneeId !== "" ? args.assigneeId : undefined
        }
        if (args.requireAttachment !== undefined) taskPatch.requireAttachment = args.requireAttachment
        if (args.enableProgress !== undefined) taskPatch.enableProgress = args.enableProgress
        if (args.progress !== undefined) taskPatch.progress = args.progress
        if (args.attachmentFolderId !== undefined) taskPatch.attachmentFolderId = args.attachmentFolderId ?? undefined
        if (args.attachmentFolderName !== undefined) taskPatch.attachmentFolderName = args.attachmentFolderName ?? undefined

        const taskDoc = await ctx.db
            .query("tasks")
            .withIndex("by_legacy_id", (q: any) => q.eq("id", args.taskId))
            .unique()
        if (taskDoc) {
            await ctx.db.patch(taskDoc._id, taskPatch)
        }

        // Compute newly assigned IDs before modifying assignees
        const nextAssignedIds = new Set<string>([...oldAssignedIds])
        if (args.assigneeIds !== undefined) {
            nextAssignedIds.clear()
            for (const id of args.assigneeIds) nextAssignedIds.add(id)
        }
        if (args.assigneeId !== undefined) {
            if (task.assigneeId) nextAssignedIds.delete(task.assigneeId as string)
            if (args.assigneeId && args.assigneeId !== "") nextAssignedIds.add(args.assigneeId)
        }
        const newlyAssignedIds = Array.from(nextAssignedIds).filter((id) => !oldAssignedIds.has(id))

        // Update taskAssignees if assigneeIds provided
        if (args.assigneeIds !== undefined) {
            // Delete all existing taskAssignee rows for this task
            for (const row of existingAssigneeRows) {
                await ctx.db.delete(row._id)
            }
            // Create new ones
            const uniqueIds = Array.from(new Set(args.assigneeIds)).filter((id) => id.trim().length > 0)
            for (const userId of uniqueIds) {
                await ctx.db.insert("taskAssignees", {
                    id: createLegacyId("task_assignee"),
                    taskId: args.taskId,
                    userId,
                    createdAt: args.now,
                })
            }
        }

        // Insert activity log entries
        const effectiveTitle = titleChanged ? nextTitle! : (task.title as string)
        for (const entry of activityEntries) {
            await insertActivityLog(ctx.db, {
                taskId: args.taskId,
                taskTitle: effectiveTitle,
                action: entry.action,
                field: entry.field,
                oldValue: entry.oldValue,
                newValue: entry.newValue,
                changedBy: args.changedBy,
                changedByName: args.changedByName,
                createdAt: args.now,
            })
        }

        // Fetch updated task for return
        const updatedTaskDoc = await ctx.db
            .query("tasks")
            .withIndex("by_legacy_id", (q: any) => q.eq("id", args.taskId))
            .unique()

        // Get workspace discordChannelId for Discord notifications
        const project = await getByLegacyId(ctx.db, "projects", projectId)
        const workspace = project?.workspaceId
            ? await ctx.db
                .query("workspaces")
                .withIndex("by_legacy_id", (q: any) => q.eq("id", project.workspaceId))
                .unique()
            : null

        return {
            success: true as const,
            task: updatedTaskDoc ? stripDoc(updatedTaskDoc) : null,
            newlyAssignedIds,
            discordWebhookUrl: workspace?.discordChannelId ?? null,
            projectName: project?.name ?? null,
            taskTitle: effectiveTitle,
            projectId,
        }
    },
})

// ---------------------------------------------------------------------------
// deleteTask
// ---------------------------------------------------------------------------

export const deleteTask = mutation({
    args: {
        taskId: v.string(),
        projectId: v.string(),
        workspaceId: v.string(),
        userRole: v.string(),
        now: v.number(),
        deletedBy: v.string(),
        deletedByName: v.string(),
    },
    handler: async (ctx, args) => {
        // Get task
        const task = await getByLegacyId(ctx.db, "tasks", args.taskId)
        if (!task) {
            return { error: "Task not found" }
        }

        // Validate workspace via column→board→project
        if (!task.columnId) {
            return { error: "Task has no column" }
        }
        const colCtx = await getColumnBoardProject(ctx.db, task.columnId)
        if (!colCtx || colCtx.project.workspaceId !== args.workspaceId) {
            return { error: "Task not found" }
        }

        const taskProjectId = colCtx.board.projectId as string

        // Validate projectId matches
        if (taskProjectId !== args.projectId) {
            return { error: "Invalid project" }
        }

        // Members cannot delete tasks in Review or Done
        if (args.userRole === "Member") {
            const columnName = colCtx.column.name as string
            if (columnName === "Review" || columnName === "Done") {
                return { error: "Unauthorized: Cannot delete tasks in Review or Done" }
            }
        }

        // Upsert taskDeletion record
        const existingDeletion = await ctx.db
            .query("taskDeletions")
            .withIndex("by_taskId", (q: any) => q.eq("taskId", args.taskId))
            .unique()

        if (existingDeletion) {
            await ctx.db.patch(existingDeletion._id, {
                projectId: taskProjectId,
                workspaceId: args.workspaceId,
                deletedBy: args.deletedBy,
                deletedByName: args.deletedByName,
                deletedAt: args.now,
            })
        } else {
            await ctx.db.insert("taskDeletions", {
                id: createLegacyId("task_deletion"),
                taskId: args.taskId,
                projectId: taskProjectId,
                workspaceId: args.workspaceId,
                deletedBy: args.deletedBy,
                deletedByName: args.deletedByName,
                deletedAt: args.now,
            })
        }

        // Insert activity log before deletion
        await insertActivityLog(ctx.db, {
            taskId: args.taskId,
            taskTitle: task.title,
            action: "deleted",
            oldValue: task.title,
            changedBy: args.deletedBy,
            changedByName: args.deletedByName,
            details: `Task "${task.title}" was deleted`,
            createdAt: args.now,
        })

        // Delete related records
        const taskAssigneeRows = await ctx.db
            .query("taskAssignees")
            .withIndex("by_taskId", (q: any) => q.eq("taskId", args.taskId))
            .collect()
        for (const row of taskAssigneeRows) {
            await ctx.db.delete(row._id)
        }

        const commentRows = await ctx.db
            .query("comments")
            .withIndex("by_taskId", (q: any) => q.eq("taskId", args.taskId))
            .collect()
        for (const row of commentRows) {
            await ctx.db.delete(row._id)
        }

        const attachmentRows = await ctx.db
            .query("taskAttachments")
            .withIndex("by_taskId", (q: any) => q.eq("taskId", args.taskId))
            .collect()
        for (const row of attachmentRows) {
            await ctx.db.delete(row._id)
        }

        const checklistRows = await ctx.db
            .query("taskChecklistItems")
            .withIndex("by_taskId", (q: any) => q.eq("taskId", args.taskId))
            .collect()
        for (const row of checklistRows) {
            await ctx.db.delete(row._id)
        }

        const activityLogRows = await ctx.db
            .query("activityLogs")
            .withIndex("by_taskId", (q: any) => q.eq("taskId", args.taskId))
            .collect()
        for (const row of activityLogRows) {
            await ctx.db.delete(row._id)
        }

        // Delete the task itself
        const taskDoc = await ctx.db
            .query("tasks")
            .withIndex("by_legacy_id", (q: any) => q.eq("id", args.taskId))
            .unique()
        if (taskDoc) {
            await ctx.db.delete(taskDoc._id)
        }

        return {
            success: true as const,
            projectId: taskProjectId,
        }
    },
})

// ---------------------------------------------------------------------------
// updateTaskProgress
// ---------------------------------------------------------------------------

export const updateTaskProgress = mutation({
    args: {
        taskId: v.string(),
        progress: v.number(),
        workspaceId: v.string(),
        userRole: v.string(),
        userId: v.string(),
        forceMoveToReview: v.boolean(),
        now: v.number(),
    },
    handler: async (ctx, args) => {
        // Get task
        const task = await getByLegacyId(ctx.db, "tasks", args.taskId)
        if (!task) {
            return { error: "Task not found" }
        }

        // Validate workspace
        if (!task.columnId) {
            return { error: "Task has no column" }
        }
        const colCtx = await getColumnBoardProject(ctx.db, task.columnId)
        if (!colCtx || colCtx.project.workspaceId !== args.workspaceId) {
            return { error: "Task not found" }
        }

        // Check if user is assignee
        const assigneeRows = await ctx.db
            .query("taskAssignees")
            .withIndex("by_taskId", (q: any) => q.eq("taskId", args.taskId))
            .collect()
        const isAssignee =
            task.assigneeId === args.userId ||
            assigneeRows.some((row: any) => row.userId === args.userId)

        if (!isAssignee && args.userRole !== "Admin") {
            return { error: "Only assignees can update progress" }
        }

        // Handle force-move to Review if progress is 100
        if (args.forceMoveToReview && isAssignee && args.progress === 100) {
            // Get all columns for this board
            const boardColumns = await ctx.db
                .query("columns")
                .withIndex("by_boardId", (q: any) => q.eq("boardId", colCtx.board.id))
                .collect()
            const reviewColumn = boardColumns.find((c: any) => c.name === "Review") ?? null

            if (reviewColumn && reviewColumn.id !== task.columnId) {
                const taskDoc = await ctx.db
                    .query("tasks")
                    .withIndex("by_legacy_id", (q: any) => q.eq("id", args.taskId))
                    .unique()
                if (taskDoc) {
                    await ctx.db.patch(taskDoc._id, {
                        progress: args.progress,
                        columnId: reviewColumn.id,
                        submittedAt: args.now,
                        updatedAt: args.now,
                    })
                }
                return { success: true as const, movedToReview: true }
            }
        }

        // Otherwise just update progress
        const taskDoc = await ctx.db
            .query("tasks")
            .withIndex("by_legacy_id", (q: any) => q.eq("id", args.taskId))
            .unique()
        if (taskDoc) {
            await ctx.db.patch(taskDoc._id, {
                progress: args.progress,
                updatedAt: args.now,
            })
        }

        return { success: true as const }
    },
})
