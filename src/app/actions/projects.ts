'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { getWorkspaceUserIds } from '@/lib/access'
import {
    createWorkspaceProject,
    deleteWorkspaceProject,
    getWorkspaceProject,
    serializeProjectDetail,
    updateWorkspaceProject,
} from '@/lib/convex/projects'
import { mergeProjectMemberIds } from '@/lib/project-leads'

export async function createProject(formData: FormData) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { error: 'Unauthorized' }
        }

        if (!user.workspaceId) {
            return { error: 'Unauthorized: No workspace' }
        }

        if (user.role !== 'Admin') {
            console.error('[createProject] Unauthorized user:', user.role)
            return { error: 'Unauthorized: Only Admins can create divisions' }
        }

        const name = formData.get('name') as string
        const description = formData.get('description') as string
        const leadIds = Array.from(
            new Set(
                [
                    ...formData.getAll('leadIds'),
                    formData.get('leadId'),
                ]
                    .filter((value): value is string => typeof value === 'string')
                    .map((value) => value.trim())
                    .filter((value) => value.length > 0 && value !== 'none')
            )
        )

        if (!name || name.trim().length === 0) return { error: 'Division Name is required' }
        if (leadIds.length === 0) return { error: 'At least one division lead is required' }

        const allowedLeadIds = await getWorkspaceUserIds(leadIds, user.workspaceId)
        if (allowedLeadIds.length !== leadIds.length) {
            return { error: 'One or more division leads are not in this workspace' }
        }

        const result = await createWorkspaceProject({
            workspaceId: user.workspaceId,
            name: name.trim(),
            description: description?.trim() || undefined,
            leadIds: allowedLeadIds,
            memberIds: mergeProjectMemberIds([], allowedLeadIds),
        })

        if ('error' in result) {
            return { error: result.error }
        }

        revalidatePath('/dashboard/projects')
        return { success: true, project: serializeProjectDetail(result.project) }
    } catch (error) {
        console.error('[createProject] Error:', error)
        return { error: 'Failed to create division' }
    }
}

export async function updateProjectLead(projectId: string, leadInput: string | string[] | null) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { error: 'Unauthorized' }
        }

        if (!user.workspaceId) {
            return { error: 'Unauthorized: No workspace' }
        }

        if (user.role !== 'Admin') {
            return { error: 'Unauthorized' }
        }

        const requestedLeadIds = Array.from(
            new Set(
                (Array.isArray(leadInput) ? leadInput : [leadInput])
                    .filter((value): value is string => typeof value === 'string')
                    .map((value) => value.trim())
                    .filter((value) => value.length > 0 && value !== 'none')
            )
        )

        const allowedLeadIds = await getWorkspaceUserIds(requestedLeadIds, user.workspaceId)
        if (allowedLeadIds.length !== requestedLeadIds.length) {
            return { error: 'One or more division leads are not in this workspace' }
        }

        const project = await getWorkspaceProject(projectId, user.workspaceId)
        if (!project) {
            return { error: 'Division not found' }
        }

        const memberIdsToPersist = mergeProjectMemberIds(
            project.members.map((member) => member.userId),
            allowedLeadIds
        )

        const result = await updateWorkspaceProject({
            projectId,
            leadIds: allowedLeadIds,
            memberIds: memberIdsToPersist,
        })

        if ('error' in result) {
            return { error: result.error }
        }

        revalidatePath('/dashboard/projects')
        revalidatePath(`/dashboard/projects/${projectId}`)
        return { success: true }
    } catch (error) {
        console.error('[updateProjectLead] Error:', error)
        return { error: 'Failed to update division lead' }
    }
}

function normalizeHexColor(value: string | undefined) {
    if (typeof value !== "string") return undefined
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const hex = trimmed.startsWith("#") ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`
    return /^#([0-9a-f]{6}|[0-9a-f]{3})$/.test(hex) ? hex : undefined
}

export async function updateProjectDetails(input: {
    projectId: string
    name?: string
    description?: string
    color?: string
    archived?: boolean
    leadIds?: string[]
    memberIds?: string[]
}) {
    try {
        const user = await getCurrentUser()
        if (!user || !user.workspaceId) {
            return { error: 'Unauthorized' }
        }

        if (user.role !== 'Admin' && user.role !== 'Team Lead') {
            return { error: 'Forbidden: Only Admins and Team Leads can update divisions' }
        }

        const existingProject = await getWorkspaceProject(input.projectId, user.workspaceId)
        if (!existingProject) {
            return { error: 'Division not found' }
        }

        const canManageAsLead = existingProject.leadIds.includes(user.id) || existingProject.leadId === user.id
        if (user.role === 'Team Lead' && !canManageAsLead) {
            return { error: 'Forbidden: You can only update projects you lead' }
        }

        const normalizedName = input.name !== undefined ? input.name.trim() : undefined
        if (input.name !== undefined && !normalizedName) {
            return { error: 'Division name is required' }
        }

        const normalizedLeadIds = input.leadIds
            ? Array.from(new Set(input.leadIds.map((id) => id.trim()).filter((id) => id.length > 0)))
            : undefined
        if (normalizedLeadIds) {
            const validLeadIds = await getWorkspaceUserIds(normalizedLeadIds, user.workspaceId)
            if (validLeadIds.length !== normalizedLeadIds.length) {
                return { error: 'One or more division leads are not in this workspace' }
            }
        }

        const normalizedMemberIds = input.memberIds
            ? Array.from(new Set(input.memberIds.map((id) => id.trim()).filter((id) => id.length > 0)))
            : undefined
        if (normalizedMemberIds) {
            const validMemberIds = await getWorkspaceUserIds(normalizedMemberIds, user.workspaceId)
            if (validMemberIds.length !== normalizedMemberIds.length) {
                return { error: 'One or more members are not in this workspace' }
            }
        }

        const nextLeadIds = normalizedLeadIds
            ? await getWorkspaceUserIds(normalizedLeadIds, user.workspaceId)
            : undefined
        const nextMemberIds = nextLeadIds
            ? mergeProjectMemberIds(
                normalizedMemberIds ?? existingProject.members.map((member) => member.userId),
                nextLeadIds
            )
            : normalizedMemberIds

        const archivedAt = input.archived === undefined
            ? undefined
            : input.archived
                ? (existingProject.archivedAt ?? Date.now())
                : null

        const result = await updateWorkspaceProject({
            projectId: input.projectId,
            name: normalizedName,
            description: input.description !== undefined ? (input.description.trim() || null) : undefined,
            color: normalizeHexColor(input.color),
            archivedAt,
            leadIds: nextLeadIds,
            memberIds: nextMemberIds,
        })

        if ('error' in result) {
            return { error: result.error }
        }

        revalidatePath('/dashboard')
        revalidatePath('/dashboard/projects')
        revalidatePath(`/dashboard/projects/${input.projectId}`)
        return { success: true, project: serializeProjectDetail(result.project) }
    } catch (error) {
        console.error('[updateProjectDetails] Error:', error)
        return { error: 'Failed to update division' }
    }
}

export async function deleteProject(projectId: string, confirmName?: string) {
    try {
        const user = await getCurrentUser()
        if (!user || !user.workspaceId) {
            return { error: 'Unauthorized' }
        }

        if (user.role !== 'Admin' && user.role !== 'Team Lead') {
            return { error: 'Unauthorized' }
        }

        const existingProject = await getWorkspaceProject(projectId, user.workspaceId)
        if (!existingProject) {
            return { error: 'Division not found' }
        }

        const canDeleteAsLead = existingProject.leadIds.includes(user.id) || existingProject.leadId === user.id
        if (user.role === 'Team Lead' && !canDeleteAsLead) {
            return { error: 'Forbidden: You can only delete projects you lead' }
        }

        if (confirmName !== undefined && confirmName.trim() !== existingProject.name.trim()) {
            return { error: 'Division name does not match' }
        }

        const result = await deleteWorkspaceProject({
            projectId,
            workspaceId: user.workspaceId,
            deletedBy: user.id,
            deletedByName: user.name || 'Unknown',
        })

        if ('error' in result) {
            return { error: result.error }
        }

        revalidatePath('/dashboard')
        revalidatePath('/dashboard/projects')
        return { success: true }
    } catch (error) {
        console.error('[deleteProject] Error:', error)
        return { error: 'Failed to delete division' }
    }
}
