"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { getCurrentUser } from "@/lib/auth"
import { api, fetchMutation } from "@/lib/convex/server"

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
        const result = await fetchMutation(api.admin.updateUserDisplayName, {
            userId: user.id,
            name: newName.trim(),
            updatedAt: Date.now(),
        })
        if ('error' in result) {
            return { error: "Failed to update name" }
        }

        revalidatePath('/dashboard')
        revalidatePath('/dashboard/my-board')
        revalidatePath('/dashboard/projects')
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
            await fetchMutation(api.admin.updateWorkspaceDiscordChannel, {
                workspaceId: user.workspaceId,
                updatedAt: Date.now(),
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
        await fetchMutation(api.admin.updateWorkspaceDiscordChannel, {
            workspaceId: user.workspaceId,
            discordChannelId: webhookUrl,
            updatedAt: Date.now(),
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
        const result = await fetchMutation(api.admin.deleteUserAccount, {
            userId: user.id,
            updatedAt: Date.now(),
        })

        if ('error' in result) {
            return { error: result.error }
        }

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
        const result = await fetchMutation(api.admin.updateWorkspaceMemberName, {
            workspaceId: user.workspaceId,
            userId: targetUserId,
            name: trimmed,
        })
        if ('error' in result) {
            return { error: "Failed to update name" }
        }

        revalidatePath('/dashboard/settings')
        revalidatePath('/dashboard/members')
        revalidatePath('/dashboard')
        revalidatePath('/dashboard/my-board')
        revalidatePath('/dashboard/projects')
        revalidatePath('/workspaces')

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
        const result = await fetchMutation(api.admin.updateUserProfileDetails, {
            userId: user.id,
            skills,
            interests: interests.trim(),
            updatedAt: Date.now(),
        })
        if ('error' in result) {
            return { error: "Failed to update profile details" }
        }

        revalidatePath('/workspaces')

        return { success: true }
    } catch (error) {
        console.error("Update details error:", error)
        return { error: "Failed to update profile details" }
    }
}
