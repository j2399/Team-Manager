'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { notifyTaskCreated, notifyTaskCompleted, notifyTaskSubmittedForReview, notifyTaskUpdated } from '@/lib/discord'
import { getCurrentUser } from '@/lib/auth'

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
}

export async function createTask(input: CreateTaskInput) {

    const { title, projectId, columnId, startDate, endDate, description, assigneeId, pushId } = input

    if (!title || !projectId) {
        return { error: 'Title and Project are required' }
    }

    try {
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


        // Verify column exists
        const column = await prisma.column.findUnique({
            where: { id: targetColumnId }
        })

        if (!column) {
            return { error: 'Column not found' }
        }

        // Verify assignee exists if provided
        if (assigneeId && assigneeId !== "") {
            const user = await prisma.user.findUnique({
                where: { id: assigneeId }
            })
            if (!user) {
                return { error: 'Assignee not found' }
            }
        }

        const taskData: any = {
            title: title.trim(),
            description: description?.trim() || null,
            column: { connect: { id: targetColumnId } },
            requireAttachment: input.requireAttachment !== undefined ? input.requireAttachment : true,
            enableProgress: input.enableProgress !== undefined ? input.enableProgress : false,
            progress: input.progress || 0,
            startDate: startDate ? new Date(startDate) : null,
            endDate: endDate ? new Date(endDate) : null,
            push: pushId ? { connect: { id: pushId } } : undefined
        }

        // Only connect assignee if provided
        if (assigneeId && assigneeId !== "") {
            taskData.assignee = { connect: { id: assigneeId } }
        }

        const task = await prisma.task.create({
            data: taskData,
            include: {
                assignee: { select: { name: true, discordId: true } }
            }
        })

        // Create TaskAssignee entries if assigneeIds provided
        if (input.assigneeIds && input.assigneeIds.length > 0) {
            await prisma.taskAssignee.createMany({
                data: input.assigneeIds.map(userId => ({
                    taskId: task.id,
                    userId: userId
                }))
            })
        }


        // Get current user for activity log
        const user = await getCurrentUser()

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

        // Get project name and workspace ID for Discord notification
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { name: true, workspaceId: true }
        })

        // Send Discord notification
        if (project) {
            let webhookUrl: string | null = null
            if (project.workspaceId) {
                const workspace = await prisma.workspace.findUnique({
                    where: { id: project.workspaceId },
                    select: { discordChannelId: true }
                })
                webhookUrl = workspace?.discordChannelId || null
            }

            try {
                await notifyTaskCreated(task.title, project.name, task.assignee?.name, task.assignee?.discordId, webhookUrl)
            } catch (err) {
                console.error('Discord notifyTaskCreated failed:', err)
            }
        }

        revalidatePath(`/dashboard/projects/${projectId}`)
        return { success: true, taskId: task.id }
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

        const targetColumn = await prisma.column.findUnique({
            where: { id: columnId }
        })

        if (!targetColumn) {
            return { error: 'Target column not found' }
        }

        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: {
                column: true,
                attachments: { select: { id: true } }
            }
        })

        if (!task) {
            return { error: 'Task not found' }
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

        const updatedTask = await prisma.task.update({
            where: { id: taskId },
            data: { columnId },
            include: {
                assignee: { select: { name: true, discordId: true } },
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
        revalidatePath(`/dashboard/projects/${projectId}`)

        // Send Discord notification based on column
        const projectName = updatedTask.column?.board?.project?.name || 'Unknown Project'
        const workspaceId = updatedTask.column?.board?.project?.workspaceId
        const userName = user?.name || 'Someone'

        let webhookUrl: string | null = null
        if (workspaceId) {
            const workspace = await prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { discordChannelId: true }
            })
            webhookUrl = workspace?.discordChannelId || null
        }

        if (targetColumnName === 'Done') {
            try {
                await notifyTaskCompleted(updatedTask.title, projectName, userName, user.discordId, webhookUrl)
            } catch (err) {
                console.error('Discord notifyTaskCompleted failed:', err)
            }
        } else if (targetColumnName === 'Review') {
            try {
                await notifyTaskSubmittedForReview(updatedTask.title, projectName, userName, user.discordId, webhookUrl)
            } catch (err) {
                console.error('Discord notifyTaskSubmittedForReview failed:', err)
            }
        }

        return { success: true }
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

        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: {
                column: { include: { board: { include: { project: { select: { name: true, workspaceId: true } } } } } },
                assignee: { select: { name: true } }
            }
        })

        if (!task) {
            return { error: 'Task not found' }
        }

        // Members cannot edit tasks in Review or Done
        if (user.role === 'Member') {
            const columnName = task.column?.name || ''
            if (columnName === 'Review' || columnName === 'Done') {
                return { error: 'Unauthorized: Cannot edit tasks in Review or Done' }
            }
        }

        // Don't allow title changes
        if (input.title && input.title !== task.title) {
            return { error: 'Task title cannot be changed' }
        }

        // Track all changes
        const changes: Array<{ field: string; oldValue: string; newValue: string }> = []
        const activityLogs: Array<{ action: string; field: string; oldValue: string; newValue: string; changedBy: string; changedByName: string }> = []

        // Get old assignee name for comparison
        const oldAssigneeName = task.assignee?.name || 'Unassigned'
        let newAssigneeName = oldAssigneeName

        if (input.assigneeId !== undefined && input.assigneeId !== task.assigneeId) {
            const newAssignee = input.assigneeId ? await prisma.user.findUnique({
                where: { id: input.assigneeId },
                select: { name: true }
            }) : null
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

        // Update task
        await prisma.task.update({
            where: { id: taskId },
            data: {
                description: input.description !== undefined ? (input.description || null) : undefined,
                assigneeId: input.assigneeId !== undefined ? (input.assigneeId && input.assigneeId !== "" ? input.assigneeId : null) : undefined,
                startDate: input.startDate !== undefined ? (input.startDate ? new Date(input.startDate) : null) : undefined,
                endDate: input.endDate !== undefined ? (input.endDate ? new Date(input.endDate) : null) : undefined,
                requireAttachment: input.requireAttachment !== undefined ? input.requireAttachment : undefined,
                enableProgress: input.enableProgress !== undefined ? input.enableProgress : undefined,
                progress: input.progress !== undefined ? input.progress : undefined
            }
        })

        // Update TaskAssignee entries if assigneeIds provided
        if (input.assigneeIds !== undefined) {
            // Delete existing assignees
            await prisma.taskAssignee.deleteMany({
                where: { taskId: taskId }
            })
            // Create new assignees
            if (input.assigneeIds.length > 0) {
                await prisma.taskAssignee.createMany({
                    data: input.assigneeIds.map(userId => ({
                        taskId: taskId,
                        userId: userId
                    }))
                })
            }
        }

        // Create activity logs
        if (activityLogs.length > 0) {
            // Get task title for activity logs
            const taskTitle = task.title

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

            // Notify admins if there are changes
            if (changes.length > 0 && task.column?.board?.project?.workspaceId) {
                const workspaceId = task.column.board.project.workspaceId

                const workspace = await prisma.workspace.findUnique({
                    where: { id: workspaceId },
                    select: { discordChannelId: true }
                })
                const webhookUrl = workspace?.discordChannelId || null

                const projectName = task.column?.board?.project?.name || 'Unknown Project'
                await notifyTaskUpdated(task.title, projectName, user.name || 'Unknown', changes, webhookUrl)
            }
        }

        if (task?.column?.board?.projectId) {
            revalidatePath(`/dashboard/projects/${task.column.board.projectId}`)
        }

        return { success: true }
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

        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: { column: true }
        })

        if (!task) {
            return { error: 'Task not found' }
        }

        // Members cannot delete tasks in Review or Done
        if (user.role === 'Member') {
            const columnName = task.column?.name || ''
            if (columnName === 'Review' || columnName === 'Done') {
                return { error: 'Unauthorized: Cannot delete tasks in Review or Done' }
            }
        }

        // Create activity log before deletion (store task title since task will be deleted)
        await prisma.activityLog.create({
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

        await prisma.task.delete({ where: { id: taskId } })
        revalidatePath(`/dashboard/projects/${projectId}`)
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

        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: { assignees: true }
        })

        if (!task) {
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
                            columnId: reviewColumn.id
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
