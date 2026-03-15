'use server'

import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { getProjectContext, getTaskContext } from '@/lib/access'

const PUSH_COLORS = [
    "#3b82f6", // blue
    "#22c55e", // green
    "#f59e0b", // amber
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#06b6d4", // cyan
    "#f97316", // orange
    "#84cc16", // lime
]

export async function createPush(formData: FormData) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { error: 'Unauthorized: Only Admins and Team Leads can create pushes' }
        }

        if (!user.workspaceId) {
            return { error: 'Unauthorized: No workspace' }
        }

        // RBAC Check - Only Admin and Team Lead can create pushes
        if (user.role !== 'Admin' && user.role !== 'Team Lead') {
            return { error: 'Unauthorized: Only Admins and Team Leads can create pushes' }
        }

        const name = formData.get('name') as string
        const projectId = formData.get('projectId') as string
        const startDate = formData.get('startDate') as string
        const endDate = formData.get('endDate') as string
        const dependsOnId = formData.get('dependsOnId') as string | null

        if (!name?.trim()) return { error: 'Push name is required' }
        if (!projectId) return { error: 'Project ID is required' }
        if (!startDate) return { error: 'Start date is required' }
        // End date is optional now

        const projectContext = await getProjectContext(projectId)
        if (!projectContext || projectContext.workspaceId !== user.workspaceId) {
            return { error: 'Project not found' }
        }

        if (dependsOnId) {
            const dependency = await prisma.push.findUnique({
                where: { id: dependsOnId },
                select: { projectId: true, project: { select: { workspaceId: true } } }
            })

            if (!dependency || dependency.project.workspaceId !== user.workspaceId || dependency.projectId !== projectId) {
                return { error: 'Invalid dependency push' }
            }
        }

        const start = new Date(startDate)
        let end: Date | null = null

        if (endDate) {
            end = new Date(endDate)
            if (end < start) {
                return { error: 'End date must be after or equal to start date' }
            }
        }

        const color = formData.get('color') as string | null

        // Get count of existing pushes to assign fallback color
        const existingCount = await prisma.push.count({
            where: { projectId }
        })

        const pushData: Prisma.PushUncheckedCreateInput = {
            name: name.trim(),
            projectId,
            startDate: start,
            endDate: end,
            color: color || PUSH_COLORS[existingCount % PUSH_COLORS.length],
            status: 'Active',
            dependsOnId: dependsOnId || null
        }

        const push = await prisma.push.create({ data: pushData })

        revalidatePath('/dashboard')
        revalidatePath(`/dashboard/projects/${projectId}`)

        return { success: true, push }
    } catch (error) {
        console.error('[createPush] Error:', error)
        return { error: 'Failed to create push' }
    }
}

export async function updatePush(input: {
    id: string
    name?: string
    startDate?: string
    endDate?: string | null
    status?: string
    color?: string
    dependsOnId?: string | null
}) {
    const user = await getCurrentUser()
    if (!user || !user.id || user.id === 'pending') {
        return { error: 'Unauthorized' }
    }

    if (!user.workspaceId) {
        return { error: 'Unauthorized: No workspace' }
    }

    if (user.role !== 'Admin' && user.role !== 'Team Lead') {
        return { error: 'Unauthorized: Only Admins and Team Leads can update pushes' }
    }

    try {
        const push = await prisma.push.findUnique({
            where: { id: input.id },
            select: { projectId: true, project: { select: { workspaceId: true } } }
        })

        if (!push || push.project.workspaceId !== user.workspaceId) {
            return { error: 'Push not found' }
        }

        const updateData: Prisma.PushUncheckedUpdateInput = {}
        if (input.name) updateData.name = input.name
        if (input.startDate) updateData.startDate = new Date(input.startDate)

        // Handle endDate explicitly if passed (can be null)
        if (input.endDate !== undefined) {
            updateData.endDate = input.endDate ? new Date(input.endDate) : null
        }

        if (input.status) updateData.status = input.status
        if (input.color) updateData.color = input.color

        // Handle dependsOnId explicitly if passed (can be null)
        if (input.dependsOnId !== undefined) {
            if (input.dependsOnId) {
                const dependency = await prisma.push.findUnique({
                    where: { id: input.dependsOnId },
                    select: { projectId: true, project: { select: { workspaceId: true } } }
                })

                if (!dependency || dependency.project.workspaceId !== user.workspaceId || dependency.projectId !== push.projectId) {
                    return { error: 'Invalid dependency push' }
                }
            }

            updateData.dependsOnId = input.dependsOnId || null
        }

        await prisma.push.update({
            where: { id: input.id },
            data: updateData
        })

        revalidatePath('/dashboard')
        revalidatePath(`/dashboard/projects/${push.projectId}`)
        return { success: true }
    } catch (error) {
        console.error('Failed to update push:', error)
        return { error: 'Failed to update push' }
    }
}

export async function deletePush(pushId: string, projectId: string) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { error: 'Unauthorized: Only Admins can delete pushes' }
        }

        if (!user.workspaceId) {
            return { error: 'Unauthorized: No workspace' }
        }

        if (user.role !== 'Admin' && user.role !== 'Team Lead') {
            return { error: 'Unauthorized: Only Admins and Team Leads can delete pushes' }
        }

        const push = await prisma.push.findUnique({
            where: { id: pushId },
            select: { projectId: true, project: { select: { workspaceId: true } } }
        })

        if (!push || push.projectId !== projectId || push.project.workspaceId !== user.workspaceId) {
            return { error: 'Push not found' }
        }

        // Use transaction to ensure atomic operation
        await prisma.$transaction(async (tx) => {
            // Remove push association from tasks before deleting
            await tx.task.updateMany({
                where: { pushId },
                data: { pushId: null }
            })

            await tx.push.delete({
                where: { id: pushId }
            })
        })

        revalidatePath('/dashboard')
        revalidatePath(`/dashboard/projects/${projectId}`)

        return { success: true }
    } catch (error) {
        console.error('[deletePush] Error:', error)
        return { error: 'Failed to delete push' }
    }
}

export async function assignTaskToPush(taskId: string, pushId: string | null) {
    const user = await getCurrentUser()
    if (!user || !user.id || user.id === 'pending') {
        return { error: 'Unauthorized' }
    }

    if (!user.workspaceId) {
        return { error: 'Unauthorized: No workspace' }
    }

    try {
        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: { column: { include: { board: true } } }
        })

        if (!task) {
            return { error: 'Task not found' }
        }

        const taskContext = await getTaskContext(taskId)
        if (!taskContext || taskContext.workspaceId !== user.workspaceId) {
            return { error: 'Task not found' }
        }

        if (pushId) {
            const push = await prisma.push.findUnique({
                where: { id: pushId },
                select: { projectId: true, project: { select: { workspaceId: true } } }
            })

            if (!push || push.project.workspaceId !== user.workspaceId) {
                return { error: 'Push not found' }
            }

            if (taskContext.projectId && push.projectId !== taskContext.projectId) {
                return { error: 'Push does not belong to this task project' }
            }
        }

        await prisma.task.update({
            where: { id: taskId },
            data: { pushId }
        })

        // Completion is now manual; do not auto-update push status.

        const projectId = task.column?.board?.projectId
        if (projectId) {
            revalidatePath(`/dashboard/projects/${projectId}`)
        }

        return { success: true }
    } catch (error) {
        console.error('Failed to assign task to push:', error)
        return { error: 'Failed to assign task' }
    }
}

export async function checkAndUpdatePushStatus(pushId: string) {
    // No-op: Push completion is manual now.
    return
}

export async function getPushes(projectId: string) {
    try {
        const user = await getCurrentUser()
        if (!user || !user.workspaceId) {
            return []
        }

        const projectContext = await getProjectContext(projectId)
        if (!projectContext || projectContext.workspaceId !== user.workspaceId) {
            return []
        }

        const pushes = await prisma.push.findMany({
            where: { projectId },
            include: {
                tasks: {
                    select: {
                        id: true,
                        column: { select: { name: true } }
                    }
                }
            },
            orderBy: { startDate: 'asc' }
        })

        return pushes.map((push) => ({
            ...push,
            dependsOnId: push.dependsOnId,
            taskCount: push.tasks.length,
            completedCount: push.tasks.filter((task) => task.column?.name === 'Done').length
        }))
    } catch (error) {
        console.error('Failed to get pushes:', error)
        return []
    }
}
