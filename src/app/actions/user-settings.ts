"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export async function updateDisplayName(newName: string) {
    const user = await getCurrentUser()
    if (!user) return { error: "Not authenticated" }

    if (!newName || newName.trim().length === 0) {
        return { error: "Name cannot be empty" }
    }

    if (!newName.trim().includes(' ')) {
        return { error: "Please enter your full name (First and Last name)" }
    }

    if (newName.trim().length > 50) {
        return { error: "Name must be 50 characters or less" }
    }

    try {
        await prisma.user.update({
            where: { id: user.id },
            data: { name: newName.trim() }
        })

        // Keep workspace-scoped names in sync with the user's display name.
        await prisma.workspaceMember.updateMany({
            where: { userId: user.id },
            data: { name: newName.trim() }
        })

        revalidatePath('/dashboard')
        revalidatePath('/dashboard/settings')
        revalidatePath('/dashboard/members')
        revalidatePath('/workspaces')

        return { success: true }
    } catch (error) {
        console.error("Update name error:", error)
        return { error: "Failed to update name" }
    }
}

export async function updateDiscordChannel(channelId: string) {
    const user = await getCurrentUser()
    if (!user || !user.workspaceId) return { error: "Not authenticated" }

    const canManageDiscord = user.role === 'Admin' || user.role === 'Team Lead'
    if (!canManageDiscord) {
        return { error: "Only admins can change this setting" }
    }

    const trimmed = channelId.trim()
    if (!trimmed) {
        try {
            await prisma.workspace.update({
                where: { id: user.workspaceId },
                data: { discordChannelId: null }
            })
            return { success: true }
        } catch (error) {
            console.error("Update Discord channel error:", error)
            return { error: "Failed to update Discord channel" }
        }
    }

    let webhookUrl: string
    try {
        const parsed = new URL(trimmed)
        const hostnameOk = /(^|\.)discord(app)?\.com$/.test(parsed.hostname)
        const pathOk = parsed.pathname.includes("/api/webhooks/")
        if (parsed.protocol !== "https:" || !hostnameOk || !pathOk) {
            return { error: "Please enter a valid Discord webhook URL" }
        }
        webhookUrl = parsed.toString()
    } catch {
        return { error: "Please enter a valid Discord webhook URL" }
    }

    try {
        await prisma.workspace.update({
            where: { id: user.workspaceId },
            data: { discordChannelId: webhookUrl }
        })

        return { success: true }
    } catch (error) {
        console.error("Update Discord channel error:", error)
        return { error: "Failed to update Discord channel" }
    }
}

export async function deleteAccount() {
    const user = await getCurrentUser()
    if (!user) return { error: "Not authenticated" }

    try {
        const ownedWorkspaces = await prisma.workspace.findMany({
            where: { ownerId: user.id },
            select: {
                id: true,
                name: true,
                members: {
                    where: { userId: { not: user.id } },
                    select: { userId: true, role: true, joinedAt: true },
                    orderBy: { joinedAt: 'asc' }
                }
            }
        })

        const ownershipTransfers = ownedWorkspaces.map((workspace) => {
            const replacement =
                workspace.members.find((member) => member.role === 'Admin') ||
                workspace.members.find((member) => member.role === 'Team Lead') ||
                workspace.members[0]

            return {
                workspaceId: workspace.id,
                workspaceName: workspace.name,
                replacement,
            }
        })

        const blockedWorkspace = ownershipTransfers.find((entry) => !entry.replacement)
        if (blockedWorkspace) {
            return {
                error: `Delete or transfer workspace \"${blockedWorkspace.workspaceName}\" before deleting your account.`
            }
        }

        await prisma.$transaction(async (tx) => {
            await tx.activityLog.updateMany({
                where: { changedBy: user.id },
                data: { changedByName: "Deleted User" }
            })

            await tx.comment.updateMany({
                where: { authorId: user.id },
                data: { authorName: "Deleted User" }
            })

            await tx.generalChatMessage.updateMany({
                where: { authorId: user.id },
                data: { authorName: "Deleted User" }
            })

            for (const transfer of ownershipTransfers) {
                if (!transfer.replacement) continue

                await tx.workspace.update({
                    where: { id: transfer.workspaceId },
                    data: { ownerId: transfer.replacement.userId }
                })

                if (transfer.replacement.role !== 'Admin') {
                    await tx.workspaceMember.update({
                        where: {
                            userId_workspaceId: {
                                userId: transfer.replacement.userId,
                                workspaceId: transfer.workspaceId,
                            }
                        },
                        data: { role: 'Admin' }
                    })
                }
            }

            await tx.user.delete({
                where: { id: user.id }
            })
        })

        const cookieStore = await cookies()
        cookieStore.getAll().forEach((cookie) => {
            cookieStore.delete(cookie.name)
        })

        return { success: true }
    } catch (error) {
        console.error("Delete account error:", error)
        return { error: "Failed to delete account" }
    }
}

export async function updateMemberName(targetUserId: string, newName: string) {
    const user = await getCurrentUser()
    if (!user || !user.workspaceId) return { error: "Not authenticated" }
    if (user.role !== "Admin" && user.role !== "Team Lead") return { error: "Not authorized" }

    const trimmed = newName.trim()
    if (!trimmed || trimmed.length > 50) return { error: "Invalid name" }

    try {
        await prisma.workspaceMember.updateMany({
            where: { userId: targetUserId, workspaceId: user.workspaceId },
            data: { name: trimmed }
        })

        revalidatePath('/dashboard/settings')
        revalidatePath('/dashboard/members')
        revalidatePath('/dashboard')

        return { success: true }
    } catch (error) {
        console.error("Update member name error:", error)
        return { error: "Failed to update name" }
    }
}

export async function updateUserDeepDetails(skills: string[], interests: string) {
    const user = await getCurrentUser()
    if (!user) return { error: "Not authenticated" }

    try {
        await prisma.user.update({
            where: { id: user.id },
            data: {
                skills: skills,
                interests: interests.trim()
            }
        })

        revalidatePath('/workspaces')

        return { success: true }
    } catch (error) {
        console.error("Update details error:", error)
        return { error: "Failed to update profile details" }
    }
}
