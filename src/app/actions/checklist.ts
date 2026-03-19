'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { getTaskContext } from '@/lib/access'
import { api, createLegacyId, fetchMutation, fetchQuery } from '@/lib/convex/server'
import {
    appendActivityLogToConvex,
    touchTaskInConvex,
} from '@/lib/convex/mirror'

type ChecklistItem = {
    id: string
    taskId: string
    content: string
    completed: boolean
    completedBy?: string
    completedAt?: number
    order: number
    createdBy: string
    createdAt: number
    updatedAt: number
}

export async function createChecklistItem(taskId: string, content: string, order?: number) {
    try {
        const user = await getCurrentUser()

        if (!user || !user.id || user.id === 'pending') {
            return { error: 'Authentication required' }
        }

        if (!user.workspaceId) {
            return { error: 'No workspace' }
        }

        const taskContext = await getTaskContext(taskId)
        if (!taskContext || taskContext.workspaceId !== user.workspaceId) {
            return { error: 'Task not found' }
        }

        const trimmedContent = content.trim()
        if (!trimmedContent) {
            return { error: 'Content is required' }
        }

        const maxOrder = await fetchQuery(api.tasks.getMaxChecklistOrder, { taskId })
        const now = Date.now()
        const item: ChecklistItem = {
            id: createLegacyId('checklist_item'),
            taskId,
            content: trimmedContent,
            order: order ?? (maxOrder + 1),
            completed: false,
            createdBy: user.id,
            createdAt: now,
            updatedAt: now,
        }

        await fetchMutation(api.mirror.upsertTaskChecklistItem, { item })

        await appendActivityLogToConvex({
            taskId,
            taskTitle: taskContext.title || 'Untitled Task',
            action: 'updated',
            field: 'checklist',
            newValue: trimmedContent,
            changedBy: user.id,
            changedByName: user.name || 'User',
            details: `Added checklist item: "${trimmedContent}"`,
        })
        await touchTaskInConvex(taskId, now)

        if (taskContext.projectId) {
            revalidatePath(`/dashboard/projects/${taskContext.projectId}`)
        }

        return { success: true, item }
    } catch (error) {
        console.error('Failed to create checklist item:', error)
        return { error: 'Failed to create checklist item' }
    }
}

export async function updateChecklistItem(taskId: string, input: {
    itemId: string
    completed?: boolean
    content?: string
}) {
    try {
        const user = await getCurrentUser()

        if (!user || !user.id || user.id === 'pending') {
            return { error: 'Authentication required' }
        }

        if (!user.workspaceId) {
            return { error: 'No workspace' }
        }

        const taskContext = await getTaskContext(taskId)
        if (!taskContext || taskContext.workspaceId !== user.workspaceId) {
            return { error: 'Task not found' }
        }

        const item = await fetchQuery(api.tasks.getChecklistItem, { itemId: input.itemId }) as ChecklistItem | null
        if (!item || item.taskId !== taskId) {
            return { error: 'Checklist item not found' }
        }

        const now = Date.now()
        const updatedItem: ChecklistItem = {
            ...item,
            updatedAt: now,
        }

        if (typeof input.completed === 'boolean') {
            updatedItem.completed = input.completed
            updatedItem.completedBy = input.completed ? user.id : undefined
            updatedItem.completedAt = input.completed ? now : undefined
        }

        if (typeof input.content === 'string') {
            updatedItem.content = input.content.trim()
        }

        await fetchMutation(api.mirror.upsertTaskChecklistItem, { item: updatedItem })

        if (typeof input.completed === 'boolean') {
            await appendActivityLogToConvex({
                taskId,
                taskTitle: taskContext.title || 'Untitled Task',
                action: 'updated',
                field: 'checklist',
                oldValue: input.completed ? 'incomplete' : 'complete',
                newValue: input.completed ? 'complete' : 'incomplete',
                changedBy: user.id,
                changedByName: user.name || 'User',
                details: `${input.completed ? 'Completed' : 'Uncompleted'} checklist item: "${item.content}"`,
            })
        }
        await touchTaskInConvex(taskId, now)

        if (taskContext.projectId) {
            revalidatePath(`/dashboard/projects/${taskContext.projectId}`)
        }

        return { success: true, item: updatedItem }
    } catch (error) {
        console.error('Failed to update checklist item:', error)
        return { error: 'Failed to update checklist item' }
    }
}

export async function deleteChecklistItem(taskId: string, itemId: string) {
    try {
        const user = await getCurrentUser()

        if (!user || !user.id || user.id === 'pending') {
            return { error: 'Authentication required' }
        }

        if (!user.workspaceId) {
            return { error: 'No workspace' }
        }

        const taskContext = await getTaskContext(taskId)
        if (!taskContext || taskContext.workspaceId !== user.workspaceId) {
            return { error: 'Task not found' }
        }

        const item = await fetchQuery(api.tasks.getChecklistItem, { itemId }) as ChecklistItem | null
        if (!item || item.taskId !== taskId) {
            return { error: 'Checklist item not found' }
        }

        await fetchMutation(api.mirror.deleteTaskChecklistItem, { itemId })

        await appendActivityLogToConvex({
            taskId,
            taskTitle: taskContext.title || 'Untitled Task',
            action: 'updated',
            field: 'checklist',
            oldValue: item.content,
            changedBy: user.id,
            changedByName: user.name || 'User',
            details: `Removed checklist item: "${item.content}"`,
        })
        await touchTaskInConvex(taskId, Date.now())

        if (taskContext.projectId) {
            revalidatePath(`/dashboard/projects/${taskContext.projectId}`)
        }

        return { success: true }
    } catch (error) {
        console.error('Failed to delete checklist item:', error)
        return { error: 'Failed to delete checklist item' }
    }
}
