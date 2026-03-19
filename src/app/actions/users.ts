'use server'

import { revalidatePath } from "next/cache"
import { getCurrentUser } from '@/lib/auth'
import { isUserInWorkspace } from '@/lib/access'
import { api, fetchMutation, fetchQuery } from "@/lib/convex/server"

export async function updateUserRole(userId: string, newRole: string) {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return { error: 'Unauthorized: Not authenticated' }
    }

    if (!currentUser.workspaceId) {
        return { error: 'Unauthorized: No workspace' }
    }

    if (currentUser.role !== 'Admin' && currentUser.role !== 'Team Lead') {
        return { error: 'Unauthorized: Only Admins and Team Leads can change roles' }
    }

    const validRoles = ['Admin', 'Team Lead', 'Member']
    if (!validRoles.includes(newRole)) {
        return { error: 'Invalid role' }
    }

    const workspaceId = currentUser.workspaceId

    const managedUser = await fetchQuery(api.admin.getManagedUser, {
        workspaceId,
        userId,
    })

    if (!managedUser) {
        return { error: 'User not found' }
    }
    const targetUser = managedUser.user
    const targetMembership = managedUser.membership
    const targetRole = targetMembership?.role ?? (targetUser.workspaceId === workspaceId ? targetUser.role : null)

    // PROTECT ADMINS: Only Admins can change role of other Admins
    if (targetRole === 'Admin' && currentUser.role !== 'Admin') {
        return { error: 'Unauthorized: Only Admins can modify other Admins' }
    }

    // PROTECT ADMIN ROLE PROMOTION: Only Admins can promote to Admin
    if (newRole === 'Admin' && currentUser.role !== 'Admin') {
        return { error: 'Unauthorized: Only Admins can promote users to Admin' }
    }

    // Check if admin is trying to demote themselves
    if (currentUser.id === userId && newRole !== 'Admin') {
        // Count how many admins exist in the workspace
        const adminCount = await fetchQuery(api.admin.countWorkspaceAdmins, { workspaceId })

        // If this is the only admin, prevent self-demotion
        if (adminCount <= 1) {
            return {
                error: 'Cannot remove your admin role: You are the only admin. Please assign another admin first.',
                requiresAdminAssignment: true
            }
        }
    }

    try {
        const result = await fetchMutation(api.admin.setWorkspaceMemberRole, {
            workspaceId,
            userId,
            role: newRole,
            fallbackName: targetUser.name || 'User',
        })
        if ('error' in result) {
            return { error: 'User not found' }
        }
        revalidatePath('/dashboard/members')
        revalidatePath('/dashboard/projects')
        return { success: true }
    } catch (error) {
        console.error("Failed to update role", error)
        return { error: 'Failed to update role' }
    }
}

export async function updateUserProjects(userId: string, projectIds: string[]) {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return { error: 'Unauthorized: Not authenticated' }
    }

    if (!currentUser.workspaceId) {
        return { error: 'Unauthorized: No workspace' }
    }

    // Allow Team Leads to assign projects too
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Team Lead') {
        return { error: 'Unauthorized: Only Admins and Team Leads can change project assignments' }
    }

    const isMember = await isUserInWorkspace(userId, currentUser.workspaceId)
    if (!isMember) {
        return { error: 'User not found' }
    }

    const uniqueProjectIds = Array.from(new Set(projectIds))
    const workspaceProjects = await fetchQuery(api.admin.validateActiveProjectIds, {
        workspaceId: currentUser.workspaceId,
        projectIds: uniqueProjectIds,
    })

    if (workspaceProjects.length !== uniqueProjectIds.length) {
        return { error: 'One or more projects are not in this workspace' }
    }

    try {
        const result = await fetchMutation(api.admin.replaceUserProjectMemberships, {
            workspaceId: currentUser.workspaceId,
            userId,
            projectIds: uniqueProjectIds,
        })

        const savedProjectIds = 'projectIds' in result && Array.isArray(result.projectIds)
            ? result.projectIds
            : uniqueProjectIds

        revalidatePath('/dashboard/members')
        revalidatePath('/dashboard')
        return { success: true, projectIds: savedProjectIds }
    } catch (error) {
        console.error("Failed to update division assignments", error)
        return { error: 'Failed to update division assignments' }
    }
}

export async function updateWorkspaceMemberName(userId: string, name: string) {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return { error: 'Unauthorized: Not authenticated' }
    }

    if (!currentUser.workspaceId) {
        return { error: 'Unauthorized: No workspace' }
    }

    if (currentUser.role !== 'Admin' && currentUser.role !== 'Team Lead') {
        return { error: 'Unauthorized: Only Admins and Team Leads can change members' }
    }

    const trimmedName = name.trim()
    if (!trimmedName || trimmedName.length > 50) {
        return { error: 'Invalid name' }
    }

    const membershipData = await fetchQuery(api.admin.getManagedUser, {
        workspaceId: currentUser.workspaceId,
        userId,
    })

    if (!membershipData?.membership) {
        return { error: 'User not found' }
    }

    try {
        const result = await fetchMutation(api.admin.updateWorkspaceMemberName, {
            workspaceId: currentUser.workspaceId,
            userId,
            name: trimmedName,
        })

        if ('error' in result) {
            return { error: 'User not found' }
        }

        revalidatePath('/dashboard/members')
        revalidatePath('/dashboard/settings')
        return { success: true }
    } catch (error) {
        console.error("Failed to update member name", error)
        return { error: 'Failed to update name' }
    }
}

export async function removeUserFromWorkspace(userId: string) {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return { error: 'Unauthorized: Not authenticated' }
    }

    if (!currentUser.workspaceId) {
        return { error: 'Unauthorized: No workspace' }
    }

    if (currentUser.role !== 'Admin' && currentUser.role !== 'Team Lead') {
        return { error: 'Unauthorized: Only Admins and Team Leads can remove members' }
    }

    const membershipData = await fetchQuery(api.admin.getManagedUser, {
        workspaceId: currentUser.workspaceId,
        userId,
    })

    if (!membershipData?.membership) {
        return { error: 'User not found' }
    }
    const membership = membershipData.membership

    // PROTECT ADMINS: Only Admins can remove other Admins
    if (membership.role === 'Admin' && currentUser.role !== 'Admin') {
        return { error: 'Unauthorized: Only Admins can remove other Admins' }
    }

    // Check if user is removing themselves
    if (currentUser.id === userId) {
        // Count how many admins exist in the workspace
        if (currentUser.role === 'Admin') {
            const adminCount = await fetchQuery(api.admin.countWorkspaceAdmins, {
                workspaceId: currentUser.workspaceId,
            })

            // If this is the only admin, prevent leaving/removal
            if (adminCount <= 1) {
                return {
                    error: 'Cannot leave workspace: You are the only admin. Please assign another admin first.',
                    requiresAdminAssignment: true
                }
            }
        }
    }

    try {
        await fetchMutation(api.admin.removeWorkspaceMember, {
            workspaceId: currentUser.workspaceId,
            userId,
        })

        revalidatePath('/dashboard/members')
        revalidatePath('/dashboard/projects')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error("Failed to remove user from workspace", error)
        return { error: 'Failed to remove user from workspace' }
    }
}
