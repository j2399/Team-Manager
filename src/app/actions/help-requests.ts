'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { getTaskContext } from '@/lib/access'
import { api, createLegacyId, fetchMutation, fetchQuery } from '@/lib/convex/server'
import {
    appendActivityLogToConvex,
    touchTaskInConvex,
} from '@/lib/convex/mirror'
import { createNotificationsInConvex } from '@/lib/convex/notifications'

type HelpRequest = {
    id: string
    taskId: string
    requestedBy: string
    requestedByName: string
    message?: string
    status: string
    resolvedBy?: string
    resolvedByName?: string
    resolvedAt?: number
    createdAt: number
    updatedAt: number
}

export async function createHelpRequest(taskId: string, message?: string | null) {
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

        const existingRequests = await fetchQuery(api.tasks.getHelpRequests, {
            taskId,
            statuses: ['open', 'acknowledged'],
        }) as HelpRequest[]

        if (existingRequests.length > 0) {
            return { error: 'Help request already exists for this task' }
        }

        const now = Date.now()
        const helpRequest: HelpRequest = {
            id: createLegacyId('help_request'),
            taskId,
            requestedBy: user.id,
            requestedByName: user.name || 'User',
            message: message?.trim() || undefined,
            status: 'open',
            createdAt: now,
            updatedAt: now,
        }

        await fetchMutation(api.mirror.upsertHelpRequest, { helpRequest })

        await appendActivityLogToConvex({
            taskId,
            taskTitle: taskContext.title || 'Untitled Task',
            action: 'help_requested',
            field: 'help',
            newValue: 'open',
            changedBy: user.id,
            changedByName: user.name || 'User',
            details: message ? `Asked for help: "${message}"` : 'Asked for help on this task',
        })
        await touchTaskInConvex(taskId, now)

        const workspaceId = taskContext.workspaceId
        const projectId = taskContext.projectId
        if (workspaceId && projectId) {
            const projectDetails = await fetchQuery(api.projectsAdmin.getProjectDetails, {
                projectId,
            }) as { leads: { id: string }[] } | null

            const leadIds = Array.from(
                new Set(
                    (projectDetails?.leads || [])
                        .map((lead) => lead.id)
                        .filter((leadId) => leadId !== user.id)
                )
            )

            if (leadIds.length > 0) {
                await createNotificationsInConvex(
                    leadIds.map((leadId) => ({
                        workspaceId,
                        userId: leadId,
                        type: 'help_requested',
                        title: 'Help Requested',
                        message: `${user.name} needs help with "${taskContext.title}"${message ? `: ${message}` : ''}`,
                        link: `/dashboard/projects/${projectId}?task=${taskId}`,
                    }))
                )
            }

            const adminMembers = await fetchQuery(api.workspaces.getWorkspaceAdmins, {
                workspaceId,
                excludeUserIds: [user.id, ...leadIds],
            }) as { userId: string }[]

            if (adminMembers.length > 0) {
                await createNotificationsInConvex(
                    adminMembers.map((admin) => ({
                        workspaceId,
                        userId: admin.userId,
                        type: 'help_requested',
                        title: 'Help Requested',
                        message: `${user.name} needs help with "${taskContext.title}"${message ? `: ${message}` : ''}`,
                        link: `/dashboard/projects/${projectId}?task=${taskId}`,
                    }))
                )
            }
        }

        if (projectId) {
            revalidatePath(`/dashboard/projects/${projectId}`)
        }

        return { success: true, helpRequest }
    } catch (error) {
        console.error('Failed to create help request:', error)
        return { error: 'Failed to create help request' }
    }
}

export async function updateHelpRequestStatus(
    taskId: string,
    helpRequestId: string,
    status: 'acknowledged' | 'resolved'
) {
    try {
        const user = await getCurrentUser()

        if (!user || !user.id || user.id === 'pending') {
            return { error: 'Authentication required' }
        }

        if (!user.workspaceId) {
            return { error: 'No workspace' }
        }

        const isLeadership = user.role === 'Admin' || user.role === 'Team Lead'
        if (!isLeadership) {
            return { error: 'Unauthorized' }
        }

        const helpRequest = await fetchQuery(api.tasks.getHelpRequest, { helpRequestId }) as HelpRequest | null
        if (!helpRequest || helpRequest.taskId !== taskId) {
            return { error: 'Help request not found' }
        }

        const taskContext = await getTaskContext(taskId)
        if (!taskContext || taskContext.workspaceId !== user.workspaceId) {
            return { error: 'Help request not found' }
        }

        const now = Date.now()
        const updatedHelpRequest: HelpRequest = {
            ...helpRequest,
            status,
            updatedAt: now,
        }

        if (status === 'resolved') {
            updatedHelpRequest.resolvedBy = user.id
            updatedHelpRequest.resolvedByName = user.name || 'User'
            updatedHelpRequest.resolvedAt = now
        }

        await fetchMutation(api.mirror.upsertHelpRequest, { helpRequest: updatedHelpRequest })

        await appendActivityLogToConvex({
            taskId,
            taskTitle: taskContext.title || 'Untitled Task',
            action: status === 'resolved' ? 'help_resolved' : 'help_acknowledged',
            field: 'help',
            oldValue: helpRequest.status,
            newValue: status,
            changedBy: user.id,
            changedByName: user.name || 'User',
            details: status === 'resolved' ? 'Resolved help request' : 'Acknowledged help request',
        })
        await touchTaskInConvex(taskId, now)

        const workspaceId = taskContext.workspaceId
        const projectId = taskContext.projectId
        if (workspaceId && projectId && helpRequest.requestedBy !== user.id) {
            await createNotificationsInConvex([{
                workspaceId,
                userId: helpRequest.requestedBy,
                type: status === 'resolved' ? 'help_resolved' : 'help_acknowledged',
                title: status === 'resolved' ? 'Help Request Resolved' : 'Help Request Acknowledged',
                message: `${user.name} ${status === 'resolved' ? 'resolved' : 'acknowledged'} your help request on "${taskContext.title}"`,
                link: `/dashboard/projects/${projectId}?task=${taskId}`,
            }])
        }

        if (projectId) {
            revalidatePath(`/dashboard/projects/${projectId}`)
        }

        return { success: true, helpRequest: updatedHelpRequest }
    } catch (error) {
        console.error('Failed to update help request:', error)
        return { error: 'Failed to update help request' }
    }
}

export async function cancelHelpRequest(taskId: string, helpRequestId: string) {
    try {
        const user = await getCurrentUser()

        if (!user || !user.id || user.id === 'pending') {
            return { error: 'Authentication required' }
        }

        if (!user.workspaceId) {
            return { error: 'No workspace' }
        }

        const helpRequest = await fetchQuery(api.tasks.getHelpRequest, { helpRequestId }) as HelpRequest | null
        if (!helpRequest || helpRequest.taskId !== taskId) {
            return { error: 'Help request not found' }
        }

        if (helpRequest.requestedBy !== user.id) {
            return { error: 'Unauthorized' }
        }

        const taskContext = await getTaskContext(taskId)
        if (!taskContext || taskContext.workspaceId !== user.workspaceId) {
            return { error: 'Help request not found' }
        }

        await fetchMutation(api.mirror.deleteHelpRequest, { helpRequestId })

        await appendActivityLogToConvex({
            taskId,
            taskTitle: taskContext.title || 'Untitled Task',
            action: 'help_cancelled',
            field: 'help',
            oldValue: helpRequest.status,
            newValue: 'cancelled',
            changedBy: user.id,
            changedByName: user.name || 'User',
            details: 'Cancelled help request',
        })
        await touchTaskInConvex(taskId, Date.now())

        if (taskContext.projectId) {
            revalidatePath(`/dashboard/projects/${taskContext.projectId}`)
        }

        return { success: true }
    } catch (error) {
        console.error('Failed to cancel help request:', error)
        return { error: 'Failed to cancel help request' }
    }
}
