'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

import { getCurrentUser } from '@/lib/auth'
import { getProjectContext, getWorkspaceUserIds } from '@/lib/access'

export async function createProject(formData: FormData) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { error: 'Unauthorized' }
        }

        if (!user.workspaceId) {
            return { error: 'Unauthorized: No workspace' }
        }

        // RBAC Check
        if (user.role !== 'Admin') {
            console.error('[createProject] Unauthorized user:', user.role)
            return { error: 'Unauthorized: Only Admins can create divisions' }
        }

        const name = formData.get('name') as string
        const description = formData.get('description') as string
        const leadId = formData.get('leadId') as string | null

        if (!name || name.trim().length === 0) return { error: 'Division Name is required' }
        if (!leadId || leadId === 'none') return { error: 'Division Lead is required' }

        const allowedLeadIds = await getWorkspaceUserIds([leadId], user.workspaceId)
        if (allowedLeadIds.length !== 1) {
            return { error: 'Division Lead must belong to this workspace' }
        }

        // Use interactive transaction to ensure all parts are created or none
        const project = await prisma.$transaction(async (tx: any) => {
            const p = await tx.project.create({
                data: {
                    name,
                    description: description || null,
                    leadId: leadId || null,
                    workspaceId: user.workspaceId
                }
            })

            await tx.projectMember.create({
                data: {
                    projectId: p.id,
                    userId: leadId
                }
            })

            await tx.board.create({
                data: {
                    name: 'Kanban Board',
                    projectId: p.id,
                    columns: {
                        create: [
                            { name: 'To Do', order: 0 },
                            { name: 'In Progress', order: 1 },
                            { name: 'Review', order: 2 },
                            { name: 'Done', order: 3 },
                        ]
                    }
                }
            })

            return p
        })

        revalidatePath('/dashboard/projects')
        return { success: true, project }
    } catch (error) {
        console.error('[createProject] Error:', error)
        return { error: 'Failed to create division' }
    }
}

export async function updateProjectLead(projectId: string, leadId: string | null) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { error: 'Unauthorized' }
        }

        if (!user.workspaceId) {
            return { error: 'Unauthorized: No workspace' }
        }

        // Only Admin can change division lead
        if (user.role !== 'Admin') {
            return { error: 'Unauthorized' }
        }

        if (leadId) {
            const allowedLeadIds = await getWorkspaceUserIds([leadId], user.workspaceId)
            if (allowedLeadIds.length !== 1) {
                return { error: 'Division Lead must belong to this workspace' }
            }
        }

        const projectContext = await getProjectContext(projectId)
        if (!projectContext || projectContext.workspaceId !== user.workspaceId) {
            return { error: 'Division not found' }
        }

        await prisma.project.update({
            where: { id: projectId },
            data: { leadId }
        })

        revalidatePath('/dashboard/projects')
        revalidatePath(`/dashboard/projects/${projectId}`)
        return { success: true }
    } catch (error) {
        console.error('[updateProjectLead] Error:', error)
        return { error: 'Failed to update division lead' }
    }
}
