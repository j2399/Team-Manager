'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { sendDiscordNotification } from '@/lib/discord'
import { getCurrentUser } from '@/lib/auth'
import { getProjectContext, getWorkspaceUserIds } from '@/lib/access'
import { driveConfigTableExists, getDriveFolderCache, isFolderWithinRoot } from '@/lib/googleDrive'
import { differenceInCalendarDays } from 'date-fns'
import type { Prisma } from '@prisma/client'

function parseDateOnlyStart(dateStr: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim())
    if (!match) return null
    const year = Number(match[1])
    const monthIndex = Number(match[2]) - 1
    const day = Number(match[3])
    return new Date(year, monthIndex, day, 0, 0, 0, 0)
}

function parseDateInput(dateStr: string, mode: "startOfDay" | "endOfDay") {
    const dateOnly = parseDateOnlyStart(dateStr)
    if (dateOnly) {
        if (mode === "endOfDay") {
            dateOnly.setHours(23, 59, 59, 999)
        }
        return dateOnly
    }
    return new Date(dateStr)
}

function formatDueLine(due: Date | null) {
    if (!due) return 'It has no due date'
    const now = new Date()

    const daysLeft = differenceInCalendarDays(due, now)
    if (daysLeft < 0) {
        const daysOver = Math.abs(daysLeft)
        return `It is overdue by ${daysOver} day${daysOver === 1 ? '' : 's'}`
    }
    if (daysLeft === 0) return 'It is due today'
    return `It is due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
}

type CreateTaskInput = {
    title: string
    projectId: string
    boardId?: string
    columnId?: string | null
    startDate?: string | null
    endDate?: string | null
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
    try {
        return await prisma.workspaceDriveConfig.findUnique({
            where: { workspaceId },
            select: {
                refreshToken: true,
                folderId: true,
                folderName: true
            }
        })
    } catch (error: any) {
        if (error?.code === "P2021" || error?.code === "P2022") return null
        throw error
    }
}

export async function createTask(input: CreateTaskInput) {

    const { title, projectId, columnId, startDate, endDate, description, assigneeId, pushId } = input

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

        let targetColumnId = columnId

        // If no columnId provided, find the first column
        if (!targetColumnId) {
            const board = await prisma.board.findFirst({
                where: { projectId },
                include: { columns: { orderBy: { order: 'asc' } } }
            })

            if (board && board.columns.length > 0) {
                targetColumnId = board.columns[0].id
            }
        }

        if (!targetColumnId) {
            return { error: 'No column found for this project' }
        }


        // Verify column exists and belongs to the project
        const column = await prisma.column.findUnique({
            where: { id: targetColumnId },
            include: { board: true }
        })

        if (!column || column.board.projectId !== projectId) {
            return { error: 'Column not found' }
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

        if (pushId) {
            const push = await prisma.push.findUnique({
                where: { id: pushId },
                select: { projectId: true, project: { select: { workspaceId: true } } }
            })

            if (!push || push.project.workspaceId !== user.workspaceId || push.projectId !== projectId) {
                return { error: 'Push not found' }
            }
        }

        const driveConfig = await getWorkspaceDriveConfig(user.workspaceId)
        let attachmentFolderId = input.attachmentFolderId?.trim() || null
        let attachmentFolderName = input.attachmentFolderName?.trim() || null

        if (driveConfig?.refreshToken && driveConfig.folderId) {
            if (!attachmentFolderId) {
                return { error: "Submission folder is required for Drive uploads" }
            } else if (attachmentFolderId !== driveConfig.folderId) {
                const cached = await getDriveFolderCache(user.workspaceId)
                if (!isFolderWithinRoot(cached, driveConfig.folderId, attachmentFolderId)) {
                    return { error: "Selected upload folder is outside the configured Drive root" }
                }
            } else if (!attachmentFolderName) {
                attachmentFolderName = driveConfig.folderName || attachmentFolderName || "Drive"
            }
        } else {
            attachmentFolderId = null
            attachmentFolderName = null
        }

        const taskData: Prisma.TaskCreateInput = {
            title: title.trim(),
            description: description?.trim() || null,
            column: { connect: { id: targetColumnId } },
            requireAttachment: input.requireAttachment !== undefined ? input.requireAttachment : true,
            enableProgress: input.enableProgress !== undefined ? input.enableProgress : false,
            progress: input.progress || 0,
            startDate: startDate ? parseDateInput(startDate, "startOfDay") : null,
            endDate: endDate ? parseDateInput(endDate, "endOfDay") : null,
            push: pushId ? { connect: { id: pushId } } : undefined,
            attachmentFolderId,
            attachmentFolderName
        }

        // Only connect assignee if provided
        if (assigneeId && assigneeId !== "") {
            taskData.assignee = { connect: { id: assigneeId } }
        }

        const task = await prisma.task.create({
            data: taskData,
            include: {
                assignee: { select: { id: true, name: true, discordId: true } },
                assignees: { include: { user: { select: { id: true, name: true } } } },
                push: { select: { id: true, name: true, color: true, status: true } },
                attachments: { select: { id: true, createdAt: true } },
                comments: { select: { createdAt: true } },
                activityLogs: { select: { changedByName: true, createdAt: true } }
            }
        })

        // Create TaskAssignee entries if assigneeIds provided
        if (input.assigneeIds && input.assigneeIds.length > 0) {
            const uniqueAssigneeIds = Array.from(new Set(input.assigneeIds)).filter((id) => id.trim().length > 0)
            if (uniqueAssigneeIds.length > 0) {
                await prisma.taskAssignee.createMany({
                    data: uniqueAssigneeIds.map(userId => ({
                        taskId: task.id,
                        userId: userId
                    }))
                })
            }

            // Re-fetch to get the assignees relation populated correctly
            const updatedTask = await prisma.task.findUnique({
                where: { id: task.id },
                include: {
                    assignee: { select: { id: true, name: true, discordId: true } },
                    assignees: { include: { user: { select: { id: true, name: true } } } },
                    push: { select: { id: true, name: true, color: true, status: true } },
                    attachments: { select: { id: true, createdAt: true } },
                    comments: { select: { createdAt: true } },
                    activityLogs: { select: { changedByName: true, createdAt: true } }
                }
            })
            if (updatedTask) Object.assign(task, updatedTask)
        }


        // Create activity log for task creation
        if (user && user.id && user.id !== 'pending') {
            await prisma.activityLog.create({
                data: {
                    taskId: task.id,
                    taskTitle: task.title,
                    action: 'created',
                    field: null,
                    oldValue: null,
                    newValue: null,
                    changedBy: user.id,
                    changedByName: user.name || 'Unknown',
                    details: `Task "${task.title}" was created`
                }
            })
        }

        // Discord: ping only when someone is assigned
        const assignedIds = Array.from(new Set([
            ...(assigneeId && assigneeId !== "" ? [assigneeId] : []),
            ...(input.assigneeIds || []),
        ]))

        if (assignedIds.length > 0) {
            // Optimized: Fetch project with workspace in single query, parallelize with user fetch
            const [project, assignedUsers] = await Promise.all([
                prisma.project.findUnique({
                    where: { id: projectId },
                    select: {
                        id: true,
                        name: true,
                        workspace: { select: { discordChannelId: true } }
                    }
                }),
                prisma.user.findMany({
                    where: { id: { in: assignedIds }, discordId: { not: null } },
                    select: { discordId: true }
                })
            ])

            const webhookUrl = project?.workspace?.discordChannelId || null

            if (project && webhookUrl && assignedUsers.length > 0) {
                const mentions = assignedUsers.map((u) => (u.discordId ? `<@${u.discordId}>` : "")).filter(Boolean).join(" ")

                if (mentions) {
                    const dueDate = endDate ? parseDateInput(endDate, "endOfDay") : null
                    await sendDiscordNotification(
                        "",
                        [{
                            title: "📌 Task Assignment",
                            description: `${mentions}, you have been assigned **${task.title}** in project **${project.name}**\n${formatDueLine(dueDate)}`,
                            color: 0x5865F2,
                            timestamp: new Date().toISOString(),
                        }],
                        webhookUrl
                    )
                }
            }
        }

        revalidatePath(`/dashboard/projects/${projectId}`)
        return { success: true, task }
    } catch (error) {
        console.error("Create task error:", error)
        // Return the actual error message for debugging
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return { error: `Failed to create task: ${errorMessage}` }
    }
}

export async function updateTaskStatus(taskId: string, columnId: string, projectId: string) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { error: 'Unauthorized' }
        }

        if (!user.workspaceId) {
            return { error: 'Unauthorized: No workspace' }
        }

        const [targetColumn, task] = await Promise.all([
            prisma.column.findUnique({
                where: { id: columnId },
                include: { board: true }
            }),
            prisma.task.findUnique({
                where: { id: taskId },
                select: {
                    id: true,
                    title: true,
                    requireAttachment: true,
                    submittedAt: true,
                    column: {
                        select: {
                            id: true,
                            name: true,
                            board: {
                                select: {
                                    projectId: true,
                                    project: { select: { workspaceId: true } }
                                }
                            }
                        }
                    },
                    attachments: { select: { id: true } }
                }
            })
        ])

        if (!task || !task.column?.board?.projectId) {
            return { error: 'Task not found' }
        }

        if (task.column.board.project.workspaceId !== user.workspaceId) {
            return { error: 'Task not found' }
        }

        if (!targetColumn || targetColumn.board.projectId !== task.column.board.projectId) {
            return { error: 'Target column not found' }
        }

        if (task.column.board.projectId !== projectId) {
            return { error: 'Invalid project' }
        }

        const sourceColumnName = task.column?.name || ''
        const targetColumnName = targetColumn.name

        // SERVER-SIDE: Check if task requires attachment when moving to Review or Done
        if ((targetColumnName === 'Review' || targetColumnName === 'Done') && task.requireAttachment) {
            const hasAttachments = task.attachments && task.attachments.length > 0
            if (!hasAttachments) {
                return {
                    error: 'ATTACHMENT_REQUIRED',
                    message: 'This task requires a file upload before it can be submitted for review or completion.'
                }
            }
        }

        // SECURITY: Members cannot move tasks TO Done
        if (user.role === 'Member') {
            if (targetColumnName === 'Done') {
                return { error: 'Unauthorized: Only Admins and Team Leads can move tasks to Done' }
            }
            // Members cannot move tasks OUT of Review or Done
            if (sourceColumnName === 'Review' || sourceColumnName === 'Done') {
                return { error: 'Unauthorized: Only Admins and Team Leads can move tasks from Review or Done' }
            }
        }

        // Build update data with timestamps for Review/Done
        const updateData: Prisma.TaskUncheckedUpdateInput = { columnId }

        // Set submittedAt when moving to Review (only if not already set)
        if (targetColumnName === 'Review' && !task.submittedAt) {
            updateData.submittedAt = new Date()
        }

        // Set approvedAt when moving to Done
        if (targetColumnName === 'Done') {
            updateData.approvedAt = new Date()
        }

        // Clear approvedAt if moving out of Done (task was rejected/moved back)
        if (sourceColumnName === 'Done' && targetColumnName !== 'Done') {
            updateData.approvedAt = null
        }

        const updatedTask = await prisma.task.update({
            where: { id: taskId },
            data: updateData,
            include: {
                assignee: { select: { id: true, name: true, discordId: true } },
                assignees: { include: { user: { select: { id: true, name: true } } } },
                push: { select: { id: true, name: true, color: true, status: true } },
                attachments: { select: { id: true, createdAt: true } },
                comments: { select: { createdAt: true } },
                activityLogs: { select: { changedByName: true, createdAt: true } },
                column: {
                    include: {
                        board: {
                            include: {
                                project: { select: { name: true, workspaceId: true } }
                            }
                        }
                    }
                }
            }
        })

        // Create activity log for status change
        await prisma.activityLog.create({
            data: {
                taskId,
                taskTitle: task.title,
                action: 'moved',
                field: 'status',
                oldValue: sourceColumnName,
                newValue: targetColumnName,
                changedBy: user.id,
                changedByName: user.name || 'Unknown',
                details: `Moved from "${sourceColumnName}" to "${targetColumnName}"`
            }
        })

        // Revalidate the project path to update the UI
        revalidatePath(`/dashboard/projects/${task.column.board.projectId}`)

        // Discord: only ping when task is moved into Review (ping the project lead)
        if (targetColumnName === 'Review') {
            const project = await prisma.project.findUnique({
                where: { id: task.column.board.projectId },
                select: {
                    name: true,
                    workspaceId: true,
                    lead: { select: { name: true, discordId: true } },
                    workspace: { select: { discordChannelId: true } }
                }
            })

            if (project?.workspaceId && project.lead?.discordId && project.workspace?.discordChannelId) {
                await sendDiscordNotification(
                    "",
                    [{
                        title: "🔍 Needs Review",
                        description: `<@${project.lead.discordId}>, **${updatedTask.title}** needs review`,
                        color: 0xFEE75C,
                        timestamp: new Date().toISOString(),
                    }],
                    project.workspace.discordChannelId
                )
            }
        }

        return { success: true, task: updatedTask }
    } catch (e) {
        console.error("Update task error:", e)
        const errorMessage = e instanceof Error ? e.message : 'Unknown error'
        return { error: `Failed to move task: ${errorMessage}` }
    }
}

export async function updateTaskDetails(taskId: string, input: Partial<CreateTaskInput>) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { error: 'Unauthorized' }
        }

        if (!user.workspaceId) {
            return { error: 'Unauthorized: No workspace' }
        }

        const [task, newAssignee] = await Promise.all([
            prisma.task.findUnique({
                where: { id: taskId },
                include: {
                    assignees: { select: { userId: true } },
                    column: {
                        include: {
                            board: {
                                include: {
                                    project: {
                                        select: {
                                            id: true,
                                            name: true,
                                            workspaceId: true,
                                            workspace: { select: { discordChannelId: true } }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    assignee: { select: { name: true } }
                }
            }),
            input.assigneeId !== undefined && input.assigneeId !== "" ? prisma.user.findUnique({
                where: { id: input.assigneeId },
                select: { name: true, discordId: true }
            }) : Promise.resolve(null)
        ])

        if (!task) {
            return { error: 'Task not found' }
        }

        if (task.column?.board?.project?.workspaceId !== user.workspaceId) {
            return { error: 'Task not found' }
        }

        const project = task.column?.board?.project
        const workspaceId = project?.workspaceId
        const webhookUrl = project?.workspace?.discordChannelId

        // Members cannot edit tasks in Review or Done
        if (user.role === 'Member') {
            const columnName = task.column?.name || ''
            if (columnName === 'Review' || columnName === 'Done') {
                return { error: 'Unauthorized: Cannot edit tasks in Review or Done' }
            }
        }

        // Track all changes
        const changes: Array<{ field: string; oldValue: string; newValue: string }> = []
        const activityLogs: Array<{ action: string; field: string; oldValue: string; newValue: string; changedBy: string; changedByName: string }> = []

        // Title changes (rename)
        const nextTitle = input.title !== undefined ? input.title.trim() : undefined
        if (nextTitle !== undefined && nextTitle.length === 0) {
            return { error: 'Title is required' }
        }
        const titleChanged = nextTitle !== undefined && nextTitle !== task.title
        if (titleChanged) {
            changes.push({
                field: 'Title',
                oldValue: task.title,
                newValue: nextTitle!
            })
            activityLogs.push({
                action: 'updated',
                field: 'title',
                oldValue: task.title,
                newValue: nextTitle!,
                changedBy: user.id,
                changedByName: user.name || 'Unknown'
            })
        }

        const oldAssignedIds = new Set<string>([
            ...(task.assigneeId ? [task.assigneeId] : []),
            ...task.assignees.map((a) => a.userId),
        ])

        // Get old assignee name for comparison
        const oldAssigneeName = task.assignee?.name || 'Unassigned'
        let newAssigneeName = oldAssigneeName

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

        if (input.assigneeId !== undefined && input.assigneeId !== task.assigneeId) {
            newAssigneeName = newAssignee?.name || 'Unassigned'

            changes.push({
                field: 'Assignee',
                oldValue: oldAssigneeName,
                newValue: newAssigneeName
            })
            activityLogs.push({
                action: 'updated',
                field: 'assignee',
                oldValue: oldAssigneeName,
                newValue: newAssigneeName,
                changedBy: user.id,
                changedByName: user.name || 'Unknown'
            })
        }

        if (input.description !== undefined && input.description !== task.description) {
            changes.push({
                field: 'Description',
                oldValue: task.description || 'None',
                newValue: input.description || 'None'
            })
            activityLogs.push({
                action: 'updated',
                field: 'description',
                oldValue: task.description || '',
                newValue: input.description || '',
                changedBy: user.id,
                changedByName: user.name || 'Unknown'
            })
        }

        if (input.startDate !== undefined) {
            const oldStartDate = task.startDate ? new Date(task.startDate).toISOString().split('T')[0] : 'None'
            const newStartDate = input.startDate ? new Date(input.startDate).toISOString().split('T')[0] : 'None'
            if (oldStartDate !== newStartDate) {
                changes.push({
                    field: 'Start Date',
                    oldValue: oldStartDate,
                    newValue: newStartDate
                })
                activityLogs.push({
                    action: 'updated',
                    field: 'startDate',
                    oldValue: oldStartDate,
                    newValue: newStartDate,
                    changedBy: user.id,
                    changedByName: user.name || 'Unknown'
                })
            }
        }

        if (input.endDate !== undefined) {
            const oldEndDate = task.endDate ? new Date(task.endDate).toISOString().split('T')[0] : 'None'
            const newEndDate = input.endDate ? new Date(input.endDate).toISOString().split('T')[0] : 'None'
            if (oldEndDate !== newEndDate) {
                changes.push({
                    field: 'Due Date',
                    oldValue: oldEndDate,
                    newValue: newEndDate
                })
                activityLogs.push({
                    action: 'updated',
                    field: 'endDate',
                    oldValue: oldEndDate,
                    newValue: newEndDate,
                    changedBy: user.id,
                    changedByName: user.name || 'Unknown'
                })
            }
        }

        let nextAttachmentFolderId: string | null | undefined = undefined
        let nextAttachmentFolderName: string | null | undefined = undefined
        if (input.attachmentFolderId !== undefined) {
            const driveConfig = await getWorkspaceDriveConfig(user.workspaceId)
            const requestedId = input.attachmentFolderId?.trim() || ""
            const requestedName = input.attachmentFolderName?.trim() || null

            if (driveConfig?.refreshToken && driveConfig.folderId) {
                if (!requestedId) {
                    nextAttachmentFolderId = driveConfig.folderId
                    nextAttachmentFolderName = driveConfig.folderName || requestedName || "Drive"
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

        const nextAssignedIds = new Set<string>([...oldAssignedIds])
        if (input.assigneeIds !== undefined) {
            nextAssignedIds.clear()
            for (const id of input.assigneeIds) nextAssignedIds.add(id)
        }
        if (input.assigneeId !== undefined) {
            if (task.assigneeId) nextAssignedIds.delete(task.assigneeId)
            if (input.assigneeId && input.assigneeId !== "") nextAssignedIds.add(input.assigneeId)
        }

        const newlyAssignedIds = Array.from(nextAssignedIds).filter((id) => !oldAssignedIds.has(id))

        // Update task
        await prisma.task.update({
            where: { id: taskId },
            data: {
                title: titleChanged ? nextTitle : undefined,
                description: input.description !== undefined ? (input.description || null) : undefined,
                assigneeId: input.assigneeId !== undefined ? (input.assigneeId && input.assigneeId !== "" ? input.assigneeId : null) : undefined,
                startDate: input.startDate !== undefined ? (input.startDate ? parseDateInput(input.startDate, "startOfDay") : null) : undefined,
                endDate: input.endDate !== undefined ? (input.endDate ? parseDateInput(input.endDate, "endOfDay") : null) : undefined,
                requireAttachment: input.requireAttachment !== undefined ? input.requireAttachment : undefined,
                enableProgress: input.enableProgress !== undefined ? input.enableProgress : undefined,
                progress: input.progress !== undefined ? input.progress : undefined,
                attachmentFolderId: nextAttachmentFolderId !== undefined ? nextAttachmentFolderId : undefined,
                attachmentFolderName: nextAttachmentFolderName !== undefined ? nextAttachmentFolderName : undefined
            }
        })

        // Update TaskAssignee entries if assigneeIds provided
        if (input.assigneeIds !== undefined) {
            const uniqueAssigneeIds = Array.from(new Set(input.assigneeIds)).filter((id) => id.trim().length > 0)
            // Delete existing assignees
            await prisma.taskAssignee.deleteMany({
                where: { taskId: taskId }
            })
            // Create new assignees
            if (uniqueAssigneeIds.length > 0) {
                await prisma.taskAssignee.createMany({
                    data: uniqueAssigneeIds.map(userId => ({
                        taskId: taskId,
                        userId: userId
                    }))
                })
            }
        }

        // Discord: only ping when someone is newly assigned
        if (newlyAssignedIds.length > 0) {
            const projectName = project?.name || 'Unknown Project'
            const projectId = project?.id

            if (workspaceId && projectId && webhookUrl) {
                const assignedUsers = await prisma.user.findMany({
                    where: { id: { in: newlyAssignedIds }, discordId: { not: null } },
                    select: { discordId: true }
                })
                const mentions = assignedUsers.map((u) => (u.discordId ? `<@${u.discordId}>` : "")).filter(Boolean).join(" ")

                if (mentions) {
                    const dueDate =
                        input.endDate !== undefined
                            ? (input.endDate ? parseDateInput(input.endDate, "endOfDay") : null)
                            : (task.endDate ?? null)
                    await sendDiscordNotification(
                        "",
                        [{
                            title: "📌 Task Assignment",
                            description: `${mentions}, you have been assigned **${task.title}** in project **${projectName}**\n${formatDueLine(dueDate)}`,
                            color: 0x5865F2,
                            timestamp: new Date().toISOString(),
                        }],
                        webhookUrl
                    )
                }
            }
        }

        // Create activity logs
        if (activityLogs.length > 0) {
            // Use the updated title if it changed during this update.
            const taskTitle = titleChanged ? nextTitle! : task.title

            await prisma.activityLog.createMany({
                data: activityLogs.map(log => ({
                    taskId,
                    taskTitle,
                    action: log.action,
                    field: log.field,
                    oldValue: log.oldValue,
                    newValue: log.newValue,
                    changedBy: log.changedBy,
                    changedByName: log.changedByName
                }))
            })

            // Discord notifications intentionally limited to assignment/review/chat mention pings.
        }

        // Fetch completely updated task for UI update
        const updatedTask = await prisma.task.findUnique({
            where: { id: taskId },
            include: {
                assignee: { select: { id: true, name: true, discordId: true } },
                assignees: { include: { user: { select: { id: true, name: true } } } },
                push: { select: { id: true, name: true, color: true, status: true } },
                attachments: { select: { id: true, createdAt: true } },
                comments: { select: { createdAt: true } },
                activityLogs: { select: { changedByName: true, createdAt: true } }
            }
        })

        if (task?.column?.board?.projectId) {
            revalidatePath(`/dashboard/projects/${task.column.board.projectId}`)
        }

        return { success: true, task: updatedTask }
    } catch (e) {
        console.error("Update details error:", e)
        const errorMessage = e instanceof Error ? e.message : 'Unknown error'
        return { error: `Failed to update task: ${errorMessage}` }
    }
}

export async function deleteTask(taskId: string, projectId: string) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { error: 'Unauthorized' }
        }

        if (!user.workspaceId) {
            return { error: 'Unauthorized: No workspace' }
        }

        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: {
                column: {
                    include: {
                        board: { include: { project: { select: { workspaceId: true } } } }
                    }
                }
            }
        })

        if (!task) {
            return { error: 'Task not found' }
        }

        if (task.column?.board?.project?.workspaceId !== user.workspaceId) {
            return { error: 'Task not found' }
        }

        const taskProjectId = task.column?.board?.projectId
        if (taskProjectId && taskProjectId !== projectId) {
            return { error: 'Invalid project' }
        }

        // Members cannot delete tasks in Review or Done
        if (user.role === 'Member') {
            const columnName = task.column?.name || ''
            if (columnName === 'Review' || columnName === 'Done') {
                return { error: 'Unauthorized: Cannot delete tasks in Review or Done' }
            }
        }

        await prisma.$transaction(async (tx) => {
            if (taskProjectId) {
                await tx.taskDeletion.upsert({
                    where: { taskId },
                    create: {
                        taskId,
                        projectId: taskProjectId,
                        workspaceId: user.workspaceId!,
                        deletedBy: user.id,
                        deletedByName: user.name || 'Unknown',
                        deletedAt: new Date()
                    },
                    update: {
                        projectId: taskProjectId,
                        workspaceId: user.workspaceId!,
                        deletedBy: user.id,
                        deletedByName: user.name || 'Unknown',
                        deletedAt: new Date()
                    }
                })
            }

            // Create activity log before deletion (store task title since task will be deleted)
            await tx.activityLog.create({
                data: {
                    taskId: taskId,
                    taskTitle: task.title,
                    action: 'deleted',
                    field: null,
                    oldValue: task.title,
                    newValue: null,
                    changedBy: user.id,
                    changedByName: user.name || 'Unknown',
                    details: `Task "${task.title}" was deleted`
                }
            })

            await tx.task.delete({ where: { id: taskId } })
        })
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

export async function updateTaskProgress(taskId: string, progress: number, projectId: string, forceMoveToReview: boolean = false) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { error: 'Unauthorized' }
        }

        if (!user.workspaceId) {
            return { error: 'Unauthorized: No workspace' }
        }

        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: {
                assignees: true,
                column: { include: { board: { include: { project: { select: { workspaceId: true } } } } } }
            }
        })

        if (!task) {
            return { error: 'Task not found' }
        }

        if (task.column?.board?.project?.workspaceId !== user.workspaceId) {
            return { error: 'Task not found' }
        }

        // Verify assignment (only assignees can update progress)
        const isAssignee = task.assigneeId === user.id || task.assignees.some(a => a.userId === user.id)
        if (!isAssignee && user.role !== 'Admin') { // Admins can override
            return { error: 'Only assignees can update progress' }
        }

        if (forceMoveToReview && isAssignee && progress === 100) {
            // Find "Review" column for this project
            const column = await prisma.column.findUnique({
                where: { id: task.columnId || undefined },
                include: { board: { include: { columns: true } } }
            })

            if (column && column.board) {
                const reviewColumn = column.board.columns.find(c => c.name === 'Review')
                if (reviewColumn && reviewColumn.id !== task.columnId) {
                    await prisma.task.update({
                        where: { id: taskId },
                        data: {
                            progress,
                            columnId: reviewColumn.id,
                            submittedAt: new Date() // Track when submitted for review
                        }
                    })
                    return { success: true, movedToReview: true }
                }
            }
        }

        await prisma.task.update({
            where: { id: taskId },
            data: { progress }
        })

        return { success: true }
    } catch (e) {
        console.error("Update progress error:", e)
        return { error: 'Failed to update progress' }
    }
}
