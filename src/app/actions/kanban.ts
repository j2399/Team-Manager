'use server'

import { revalidatePath } from 'next/cache'
import { sendDiscordNotification } from '@/lib/discord'
import { getCurrentUser } from '@/lib/auth'
import { getProjectContext, getWorkspaceUserIds } from '@/lib/access'
import { resolveProjectColumnId } from '@/lib/kanban-columns'
import { driveConfigTableExists, getDriveFolderCache, isFolderWithinRoot } from '@/lib/googleDrive'
import { getWorkspaceProjectColumns } from '@/lib/convex/projects'
import {
    createTaskInConvex,
    updateTaskStatusInConvex,
    updateTaskDetailsInConvex,
    deleteTaskInConvex,
    updateTaskProgressInConvex,
} from '@/lib/convex/kanban'
import { api, fetchQuery } from '@/lib/convex/server'

type CreateTaskInput = {
    title: string
    projectId: string
    boardId?: string
    columnId?: string | null
    description?: string
    assigneeId?: string
    assigneeIds?: string[]
    requireAttachment?: boolean
    enableProgress?: boolean
    progress?: number
    pushId?: string
    attachmentFolderId?: string | null
    attachmentFolderName?: string | null
}

async function getWorkspaceDriveConfig(workspaceId: string) {
    if (!(await driveConfigTableExists())) return null
    return fetchQuery(api.settings.getWorkspaceDriveConfig, { workspaceId })
}

async function getHydratedTask(taskId: string) {
    return fetchQuery(api.tasks.getById, { taskId })
}

async function resolveTaskStatusColumnId(
    columnId: string,
    projectId: string,
    workspaceId: string
) {
    if (!columnId || columnId.startsWith("column_")) {
        return columnId
    }

    const projectColumns = await getWorkspaceProjectColumns(projectId, workspaceId)
    if (!projectColumns || projectColumns.length === 0) {
        return columnId
    }

    return resolveProjectColumnId(columnId, projectColumns) ?? columnId
}

// ─────────────────────────────────────────────────────────────
// createTask
// ─────────────────────────────────────────────────────────────

export async function createTask(input: CreateTaskInput) {

    const { title, projectId, columnId, description, assigneeId, pushId } = input

    if (!title || !projectId) {
        return { error: 'Title and Project are required' }
    }

    try {
        const user = await getCurrentUser()
        if (!user || !user.workspaceId) {
            return { error: 'Unauthorized' }
        }

        const projectContext = await getProjectContext(projectId)
        if (!projectContext || projectContext.workspaceId !== user.workspaceId) {
            return { error: 'Project not found' }
        }

        const userIdsToCheck = [
            ...(assigneeId ? [assigneeId] : []),
            ...(input.assigneeIds || [])
        ]

        if (userIdsToCheck.length > 0) {
            const validUserIds = await getWorkspaceUserIds(userIdsToCheck, user.workspaceId)
            if (validUserIds.length !== Array.from(new Set(userIdsToCheck)).length) {
                return { error: 'One or more assignees are not in this workspace' }
            }
        }

        const driveConfig = await getWorkspaceDriveConfig(user.workspaceId)
        let attachmentFolderId = input.attachmentFolderId?.trim() || null
        let attachmentFolderName = input.attachmentFolderName?.trim() || null

        if (driveConfig?.refreshToken && driveConfig.folderId) {
            if (attachmentFolderId && attachmentFolderId !== driveConfig.folderId) {
                const cached = await getDriveFolderCache(user.workspaceId)
                if (!isFolderWithinRoot(cached, driveConfig.folderId, attachmentFolderId)) {
                    return { error: "Selected upload folder is outside the configured Drive root" }
                }
            } else if (attachmentFolderId === driveConfig.folderId && !attachmentFolderName) {
                attachmentFolderName = driveConfig.folderName || attachmentFolderName || "Drive"
            }
        } else {
            attachmentFolderId = null
            attachmentFolderName = null
        }

        const result = await createTaskInConvex({
            title: title.trim(),
            projectId,
            workspaceId: user.workspaceId,
            columnId: columnId ?? null,
            description: description?.trim() || undefined,
            assigneeId: assigneeId && assigneeId !== "" ? assigneeId : undefined,
            assigneeIds: input.assigneeIds,
            requireAttachment: input.requireAttachment !== undefined ? input.requireAttachment : false,
            enableProgress: input.enableProgress !== undefined ? input.enableProgress : false,
            progress: input.progress || 0,
            pushId: pushId,
            attachmentFolderId,
            attachmentFolderName,
            createdBy: user.id,
            createdByName: user.name || 'Unknown',
        })

        if (!result || 'error' in result) {
            return { error: ((result as Record<string, unknown> | null)?.error as string) || 'Failed to create task' }
        }

        const taskResult = result as {
            success: true
            task: { id: string; columnId: string; assigneeIds: string[] }
            projectName: string
            workspaceDiscordChannelId: string | null
        }

        // Discord: ping only when someone is assigned
        const assignedIds = taskResult.task.assigneeIds ?? []
        const webhookUrl = taskResult.workspaceDiscordChannelId ?? null
        if (assignedIds.length > 0 && webhookUrl) {
            const assignedUsers = await fetchQuery(api.auth.getUserDiscordIds, { userIds: assignedIds })

            if (assignedUsers.length > 0) {
                const mentions = assignedUsers.map((u) => `<@${u.discordId}>`).join(" ")
                if (mentions) {
                    await sendDiscordNotification(
                        "",
                        [{
                            title: "📌 Task Assignment",
                            description: `${mentions}, you have been assigned **${title.trim()}** in project **${taskResult.projectName}**`,
                            color: 0x5865F2,
                            timestamp: new Date().toISOString(),
                        }],
                        webhookUrl
                    )
                }
            }
        }

        revalidatePath(`/dashboard/projects/${projectId}`)
        const hydratedTask = await getHydratedTask(taskResult.task.id)
        const fallbackTask = {
            id: taskResult.task.id,
            title: title.trim(),
            columnId: taskResult.task.columnId,
            assigneeId: assigneeId || null,
            assignees: (taskResult.task.assigneeIds || []).map((userId: string) => ({ user: { id: userId, name: '' } })),
            description: input.description?.trim() || null,
            requireAttachment: input.requireAttachment !== undefined ? input.requireAttachment : false,
            enableProgress: input.enableProgress !== undefined ? input.enableProgress : false,
        }

        return {
            success: true,
            task: hydratedTask ?? fallbackTask,
        }
    } catch (error) {
        console.error("Create task error:", error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return { error: `Failed to create task: ${errorMessage}` }
    }
}

// ─────────────────────────────────────────────────────────────
// updateTaskStatus
// ─────────────────────────────────────────────────────────────

export async function updateTaskStatus(taskId: string, columnId: string, projectId: string) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { error: 'Unauthorized', success: false as const, task: null }
        }

        if (!user.workspaceId) {
            return { error: 'Unauthorized: No workspace', success: false as const, task: null }
        }

        const resolvedColumnId = await resolveTaskStatusColumnId(columnId, projectId, user.workspaceId)

        const result = await updateTaskStatusInConvex(
            taskId,
            resolvedColumnId,
            user.workspaceId,
            user.role,
            user.id,
            user.name || 'Unknown'
        )

        if (!result) {
            return { error: 'Failed to update task status', success: false as const, task: null }
        }

        if ('error' in result) {
            const r = result as { error: string; message?: string }
            return { error: r.error, message: r.message, success: false as const, task: null }
        }

        const r = result as {
            success: true
            sourceColumnName: string
            targetColumnName: string
            projectId: string
            taskTitle: string
            workspaceDiscordChannelId: string | null
            leadDiscordIds: string[]
            push: { id: string; status: string } | null
        }

        revalidatePath(`/dashboard/projects/${r.projectId}`)
        revalidatePath('/dashboard/my-board')

        // Discord: ping when task moved into Review
        if (r.targetColumnName === 'Review' && r.workspaceDiscordChannelId && r.leadDiscordIds && r.leadDiscordIds.length > 0) {
            const uniqueLeadDiscordIds = Array.from(new Set(r.leadDiscordIds))
            await sendDiscordNotification(
                "",
                [{
                    title: "🔍 Needs Review",
                    description: `${uniqueLeadDiscordIds.map((id) => `<@${id}>`).join(' ')}, **${r.taskTitle}** needs review`,
                    color: 0xFEE75C,
                    timestamp: new Date().toISOString(),
                }],
                r.workspaceDiscordChannelId
            )
        }

        const hydratedTask = await getHydratedTask(taskId)

        return {
            success: true as const,
            task: hydratedTask ?? { id: taskId, title: r.taskTitle, columnId: resolvedColumnId },
        }
    } catch (e) {
        console.error("Update task error:", e)
        const errorMessage = e instanceof Error ? e.message : 'Unknown error'
        return { error: `Failed to move task: ${errorMessage}`, success: false as const, task: null }
    }
}

// ─────────────────────────────────────────────────────────────
// updateTaskDetails
// ─────────────────────────────────────────────────────────────

export async function updateTaskDetails(taskId: string, input: Partial<CreateTaskInput>) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { error: 'Unauthorized' }
        }

        if (!user.workspaceId) {
            return { error: 'Unauthorized: No workspace' }
        }

        const assigneeIdsToCheck = [
            ...(input.assigneeId !== undefined && input.assigneeId !== "" ? [input.assigneeId] : []),
            ...(input.assigneeIds || [])
        ]

        if (assigneeIdsToCheck.length > 0) {
            const validAssigneeIds = await getWorkspaceUserIds(assigneeIdsToCheck, user.workspaceId)
            const uniqueAssigneeIds = Array.from(new Set(assigneeIdsToCheck))
            if (validAssigneeIds.length !== uniqueAssigneeIds.length) {
                return { error: 'One or more assignees are not in this workspace' }
            }
        }

        // Resolve attachment folder details
        let nextAttachmentFolderId: string | null | undefined = undefined
        let nextAttachmentFolderName: string | null | undefined = undefined
        if (input.attachmentFolderId !== undefined) {
            const driveConfig = await getWorkspaceDriveConfig(user.workspaceId)
            const requestedId = input.attachmentFolderId?.trim() || ""
            const requestedName = input.attachmentFolderName?.trim() || null

            if (driveConfig?.refreshToken && driveConfig.folderId) {
                if (!requestedId) {
                    nextAttachmentFolderId = null
                    nextAttachmentFolderName = null
                } else if (requestedId !== driveConfig.folderId) {
                    const cached = await getDriveFolderCache(user.workspaceId)
                    if (!isFolderWithinRoot(cached, driveConfig.folderId, requestedId)) {
                        return { error: "Selected upload folder is outside the configured Drive root" }
                    }
                    nextAttachmentFolderId = requestedId
                    nextAttachmentFolderName = requestedName
                } else {
                    nextAttachmentFolderId = requestedId
                    nextAttachmentFolderName = driveConfig.folderName || requestedName
                }
            } else {
                nextAttachmentFolderId = null
                nextAttachmentFolderName = null
            }
        }

        const result = await updateTaskDetailsInConvex(
            taskId,
            user.workspaceId,
            user.role,
            user.id,
            user.name || 'Unknown',
            {
                title: input.title,
                description: input.description !== undefined ? (input.description || null) : undefined,
                assigneeId: input.assigneeId !== undefined ? (input.assigneeId && input.assigneeId !== "" ? input.assigneeId : null) : undefined,
                assigneeIds: input.assigneeIds,
                requireAttachment: input.requireAttachment,
                enableProgress: input.enableProgress,
                progress: input.progress,
                attachmentFolderId: nextAttachmentFolderId,
                attachmentFolderName: nextAttachmentFolderName,
            }
        )

        if (!result || 'error' in result) {
            return { error: ((result as Record<string, unknown> | null)?.error as string) || 'Failed to update task' }
        }

        const r = result as {
            success: true
            task: Record<string, unknown> | null
            newlyAssignedIds: string[]
            discordWebhookUrl: string | null
            projectName: string | null
            taskTitle: string
            projectId: string
        }

        // Discord: ping newly assigned users
        if (r.newlyAssignedIds && r.newlyAssignedIds.length > 0 && r.discordWebhookUrl && r.projectName) {
            const assignedUsers = await fetchQuery(api.auth.getUserDiscordIds, { userIds: r.newlyAssignedIds })
            const mentions = assignedUsers.map((u) => `<@${u.discordId}>`).join(" ")

            if (mentions) {
                await sendDiscordNotification(
                    "",
                    [{
                        title: "📌 Task Assignment",
                        description: `${mentions}, you have been assigned **${r.taskTitle}** in project **${r.projectName}**`,
                        color: 0x5865F2,
                        timestamp: new Date().toISOString(),
                    }],
                    r.discordWebhookUrl
                )
            }
        }

        if (r.projectId) {
            revalidatePath(`/dashboard/projects/${r.projectId}`)
        }
        const hydratedTask = await getHydratedTask(taskId)

        return { success: true, task: hydratedTask ?? r.task }
    } catch (e) {
        console.error("Update details error:", e)
        const errorMessage = e instanceof Error ? e.message : 'Unknown error'
        return { error: `Failed to update task: ${errorMessage}` }
    }
}

// ─────────────────────────────────────────────────────────────
// deleteTask
// ─────────────────────────────────────────────────────────────

export async function deleteTask(taskId: string, projectId: string) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { error: 'Unauthorized' }
        }

        if (!user.workspaceId) {
            return { error: 'Unauthorized: No workspace' }
        }

        const result = await deleteTaskInConvex(
            taskId,
            projectId,
            user.workspaceId,
            user.role,
            user.id,
            user.name || 'Unknown'
        )

        if (!result || 'error' in result) {
            return { error: ((result as Record<string, unknown> | null)?.error as string) || 'Failed to delete task' }
        }

        const { projectId: taskProjectId } = result as { success: true; projectId: string }
        if (taskProjectId) {
            revalidatePath(`/dashboard/projects/${taskProjectId}`)
        }
        return { success: true }
    } catch (e) {
        console.error("Delete task error:", e)
        const errorMessage = e instanceof Error ? e.message : 'Unknown error'
        return { error: `Failed to delete task: ${errorMessage}` }
    }
}

// ─────────────────────────────────────────────────────────────
// acceptReviewTask / denyReviewTask
// ─────────────────────────────────────────────────────────────

export async function acceptReviewTask(taskId: string, columnId: string, projectId: string) {
    // Accept means move to Done
    const result = await updateTaskStatus(taskId, columnId, projectId)
    if (result.success) {
        revalidatePath('/dashboard')
    }
    return result
}

export async function denyReviewTask(taskId: string, columnId: string, projectId: string) {
    // Deny means move back to In Progress
    const result = await updateTaskStatus(taskId, columnId, projectId)
    if (result.success) {
        revalidatePath('/dashboard')
    }
    return result
}

// ─────────────────────────────────────────────────────────────
// updateTaskProgress
// ─────────────────────────────────────────────────────────────

export async function updateTaskProgress(taskId: string, progress: number, projectId: string, forceMoveToReview: boolean = false) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { error: 'Unauthorized' }
        }

        if (!user.workspaceId) {
            return { error: 'Unauthorized: No workspace' }
        }

        const result = await updateTaskProgressInConvex(
            taskId,
            progress,
            user.workspaceId,
            user.role,
            user.id,
            forceMoveToReview
        )

        if (!result || 'error' in result) {
            return { error: ((result as Record<string, unknown> | null)?.error as string) || 'Failed to update progress' }
        }

        return result as { success: true; movedToReview?: boolean }
    } catch (e) {
        console.error("Update progress error:", e)
        return { error: 'Failed to update progress' }
    }
}
