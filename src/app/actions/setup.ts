"use server"

import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateCode() {
    let result = ''
    for (let i = 0; i < 6; i++) {
        result += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length))
    }
    return result
}

export async function createWorkspace(formData: FormData) {
    const user = await getCurrentUser()
    if (!user) return { error: "Not authenticated" }

    const name = formData.get("name") as string
    if (!name || name.trim().length === 0) return { error: "Workspace name is required" }

    try {
        const userId = user.id

        let workspace = null
        let retries = 0
        const MAX_RETRIES = 10

        while (!workspace && retries < MAX_RETRIES) {
            const code = generateCode()
            try {
                workspace = await prisma.workspace.create({
                    data: {
                        name,
                        inviteCode: code,
                        ownerId: userId
                    }
                })
            } catch (e: any) {
                if (e.code === 'P2002') { // Unique constraint
                    retries++
                    continue
                }
                throw e
            }
        }

        if (!workspace) throw new Error("Failed to create workspace. Could not generate unique code.")

        // Create Member
        await prisma.workspaceMember.create({
            data: {
                userId: userId,
                workspaceId: workspace.id,
                role: 'Admin',
                name: user.name
            }
        })

        // Update user to be Admin of this workspace
        await prisma.user.update({
            where: { id: userId },
            data: {
                workspaceId: workspace.id,
                role: 'Admin'
            }
        })

        return { success: true, workspaceId: workspace.id }

    } catch (error: any) {
        console.error("Create workspace error:", error)
        return { error: `Failed to create workspace: ${error.message || error}` }
    }
}

export async function joinWorkspace(formData: FormData) {
    const user = await getCurrentUser()
    if (!user) return { error: "Not authenticated" }

    const code = formData.get("code") as string
    if (!code || code.trim().length === 0) return { error: "Invite code is required" }

    try {
        // 1. Try to find workspace by code (try exact match first, then uppercase)
        let workspace = await prisma.workspace.findFirst({
            where: {
                OR: [
                    { inviteCode: code.trim() },
                    { inviteCode: code.toUpperCase().trim() }
                ]
            }
        })

        // 2. If no workspace found, check if it's a platform invite code (e.g. cupi-team-join)
        if (!workspace) {
            const invite = await prisma.invite.findUnique({
                where: { token: code.trim() }
            })

            if (invite) {
                // Check if invite is valid
                if ((invite.maxUses > 0 && invite.uses >= invite.maxUses) ||
                    (invite.expiresAt && new Date() > invite.expiresAt)) {
                    return { error: "This invite code has expired or reached maximum uses" }
                }

                // Increment usage
                await prisma.invite.update({
                    where: { id: invite.id },
                    data: { uses: { increment: 1 } }
                })

                // Find a default workspace to join (e.g. the first one created)
                workspace = await prisma.workspace.findFirst({
                    orderBy: { createdAt: 'asc' }
                })
            }
        }

        if (!workspace) {
            return { error: "Invalid invite code" }
        }

        // Check if member
        const existingMember = await prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } }
        })

        if (!existingMember) {
            await prisma.workspaceMember.create({
                data: {
                    userId: user.id,
                    workspaceId: workspace.id,
                    role: 'Member',
                    name: user.name
                }
            })

            // Create notification for all workspace members
            await prisma.notification.create({
                data: {
                    workspaceId: workspace.id,
                    userId: null, // Broadcast to all
                    type: 'member_joined',
                    title: 'New member joined',
                    message: `${user.name} has joined the workspace.`,
                    link: '/dashboard/members'
                }
            })
        }

        // Add user to workspace as Member (Switch context)
        await prisma.user.update({
            where: { id: user.id },
            data: {
                workspaceId: workspace.id,
                role: existingMember ? existingMember.role : 'Member'
            }
        })

        return {
            success: true,
            workspaceId: workspace.id,
            message: existingMember ? `Welcome back! You are already a member of ${workspace.name}.` : undefined
        }

    } catch (error) {
        console.error("Join workspace error:", error)
        return { error: "Failed to join workspace." }
    }
}

export async function switchWorkspace(workspaceId: string) {
    const user = await getCurrentUser()
    if (!user) throw new Error("Not authenticated")

    const membership = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: user.id, workspaceId } }
    })

    if (!membership) throw new Error("Not a member of this workspace")

    await prisma.user.update({
        where: { id: user.id },
        data: {
            workspaceId,
            role: membership.role
        }
    })
    return { success: true }
}
