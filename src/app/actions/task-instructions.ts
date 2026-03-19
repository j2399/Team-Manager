'use server'

import { del, put } from '@vercel/blob'
import { getCurrentUser } from '@/lib/auth'
import { getTaskContext } from '@/lib/access'
import { appendActivityLogToConvex } from '@/lib/convex/mirror'
import { getErrorMessage } from '@/lib/errors'
import { api, fetchMutation, fetchQuery } from '@/lib/convex/server'

type TaskDoc = {
    id: string
    title: string
    description?: string
    status: string
    assigneeId?: string
    pushId?: string
    columnId?: string
    subteamId?: string
    priority: string
    requireAttachment: boolean
    attachmentFolderId?: string
    attachmentFolderName?: string
    instructionsFileUrl?: string
    instructionsFileName?: string
    progress: number
    enableProgress: boolean
    startDate?: number
    endDate?: number
    dueDate?: number
    submittedAt?: number
    approvedAt?: number
    createdAt: number
    updatedAt: number
}

function buildTaskMirrorPayload(task: TaskDoc, overrides: {
    instructionsFileUrl?: string | undefined
    instructionsFileName?: string | undefined
    updatedAt: number
}) {
    return {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status || 'Todo',
        assigneeId: task.assigneeId,
        pushId: task.pushId,
        columnId: task.columnId,
        subteamId: task.subteamId,
        priority: task.priority || 'Medium',
        requireAttachment: task.requireAttachment ?? true,
        attachmentFolderId: task.attachmentFolderId,
        attachmentFolderName: task.attachmentFolderName,
        instructionsFileUrl: overrides.instructionsFileUrl,
        instructionsFileName: overrides.instructionsFileName,
        progress: task.progress ?? 0,
        enableProgress: task.enableProgress ?? false,
        startDate: task.startDate,
        endDate: task.endDate,
        dueDate: task.dueDate,
        submittedAt: task.submittedAt,
        approvedAt: task.approvedAt,
        createdAt: task.createdAt,
        updatedAt: overrides.updatedAt,
    }
}

export async function uploadTaskInstructions(taskId: string, formData: FormData) {
    try {
        const normalizedTaskId = taskId.trim()
        if (!normalizedTaskId) {
            return { error: 'Task ID is required' }
        }

        const user = await getCurrentUser()
        if (!user || !user.id || user.id === 'pending') {
            return { error: 'Authentication required' }
        }

        if (!user.workspaceId) {
            return { error: 'No workspace' }
        }

        const taskContext = await getTaskContext(normalizedTaskId)
        if (!taskContext || taskContext.workspaceId !== user.workspaceId) {
            return { error: 'Task not found' }
        }

        const file = formData.get('file')
        if (!(file instanceof File)) {
            return { error: 'File is required' }
        }

        const task = await fetchQuery(api.tasks.getTaskById, { taskId: normalizedTaskId }) as TaskDoc | null
        if (!task) {
            return { error: 'Task not found' }
        }

        if (task.instructionsFileUrl) {
            try {
                await del(task.instructionsFileUrl)
            } catch (error) {
                console.error('Failed to delete old instructions file:', error)
            }
        }

        const filename = `instructions/${normalizedTaskId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
        const fileBuffer = await file.arrayBuffer()
        const blob = await put(filename, fileBuffer, {
            access: 'public',
            contentType: file.type || 'application/octet-stream',
        })

        const now = Date.now()
        await fetchMutation(api.mirror.upsertTask, {
            task: buildTaskMirrorPayload(task, {
                instructionsFileUrl: blob.url,
                instructionsFileName: file.name,
                updatedAt: now,
            }),
        })

        await appendActivityLogToConvex({
            taskId: normalizedTaskId,
            taskTitle: task.title,
            action: 'updated',
            field: 'instructionsFile',
            oldValue: task.instructionsFileName || 'None',
            newValue: file.name,
            changedBy: user.id,
            changedByName: user.name || 'User',
            details: `Added instructions file: ${file.name}`,
        })

        return {
            success: true,
            file: {
                url: blob.url,
                name: file.name,
            },
        }
    } catch (error: unknown) {
        return {
            error: `Failed to upload instructions: ${getErrorMessage(error)}`,
        }
    }
}

export async function deleteTaskInstructions(taskId: string) {
    try {
        const normalizedTaskId = taskId.trim()
        if (!normalizedTaskId) {
            return { error: 'Task ID is required' }
        }

        const user = await getCurrentUser()
        if (!user || !user.id || user.id === 'pending') {
            return { error: 'Authentication required' }
        }

        if (!user.workspaceId) {
            return { error: 'No workspace' }
        }

        const taskContext = await getTaskContext(normalizedTaskId)
        if (!taskContext || taskContext.workspaceId !== user.workspaceId) {
            return { error: 'Task not found' }
        }

        const task = await fetchQuery(api.tasks.getTaskById, { taskId: normalizedTaskId }) as TaskDoc | null
        if (!task) {
            return { error: 'Task not found' }
        }

        if (!task.instructionsFileUrl) {
            return { error: 'No instructions file to delete' }
        }

        try {
            await del(task.instructionsFileUrl)
        } catch (error) {
            console.error('Failed to delete from blob storage:', error)
        }

        const now = Date.now()
        const oldFileName = task.instructionsFileName

        await fetchMutation(api.mirror.upsertTask, {
            task: buildTaskMirrorPayload(task, {
                instructionsFileUrl: undefined,
                instructionsFileName: undefined,
                updatedAt: now,
            }),
        })

        await appendActivityLogToConvex({
            taskId: normalizedTaskId,
            taskTitle: task.title,
            action: 'updated',
            field: 'instructionsFile',
            oldValue: oldFileName || 'Unknown',
            newValue: 'None',
            changedBy: user.id,
            changedByName: user.name || 'User',
            details: `Removed instructions file: ${oldFileName}`,
        })

        return { success: true }
    } catch (error: unknown) {
        return {
            error: getErrorMessage(error, 'Failed to delete file'),
        }
    }
}
