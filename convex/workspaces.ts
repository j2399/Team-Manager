import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import {
    getInviteByToken,
    getUserByLegacyId,
    getWorkspaceByInviteCode,
    getWorkspaceByLegacyId,
    getWorkspaceMemberByUserAndWorkspace,
} from "./lib"

export const isUserInWorkspace = query({
    args: {
        userId: v.string(),
        workspaceId: v.string(),
    },
    handler: async (ctx, args) => {
        const membership = await getWorkspaceMemberByUserAndWorkspace(ctx.db, args.userId, args.workspaceId)
        return Boolean(membership)
    },
})

export const getWorkspaceUserIds = query({
    args: {
        userIds: v.array(v.string()),
        workspaceId: v.string(),
    },
    handler: async (ctx, args) => {
        const validUserIds = new Set<string>()

        for (const userId of args.userIds) {
            const membership = await getWorkspaceMemberByUserAndWorkspace(ctx.db, userId, args.workspaceId)
            if (membership) {
                validUserIds.add(userId)
            }
        }

        return Array.from(validUserIds)
    },
})

export const createWorkspaceForUser = mutation({
    args: {
        workspaceId: v.string(),
        membershipId: v.string(),
        userId: v.string(),
        userName: v.string(),
        workspaceName: v.string(),
        inviteCode: v.string(),
        now: v.number(),
    },
    handler: async (ctx, args) => {
        const existing = await getWorkspaceByInviteCode(ctx.db, args.inviteCode)
        if (existing) {
            return { error: "invite_code_taken" as const }
        }

        await ctx.db.insert("workspaces", {
            id: args.workspaceId,
            name: args.workspaceName,
            inviteCode: args.inviteCode,
            ownerId: args.userId,
            createdAt: args.now,
            updatedAt: args.now,
        })

        await ctx.db.insert("workspaceMembers", {
            id: args.membershipId,
            userId: args.userId,
            workspaceId: args.workspaceId,
            role: "Admin",
            name: args.userName,
            joinedAt: args.now,
        })

        const user = await getUserByLegacyId(ctx.db, args.userId)
        if (!user) {
            throw new Error("User not found")
        }

        await ctx.db.patch(user._id, {
            workspaceId: args.workspaceId,
            updatedAt: args.now,
        })

        return {
            success: true as const,
            workspace: {
                id: args.workspaceId,
                name: args.workspaceName,
                inviteCode: args.inviteCode,
                ownerId: args.userId,
            },
        }
    },
})

export const joinWorkspaceByCode = mutation({
    args: {
        userId: v.string(),
        userName: v.string(),
        code: v.string(),
        membershipId: v.optional(v.string()),
        notificationId: v.optional(v.string()),
        now: v.number(),
    },
    handler: async (ctx, args) => {
        const normalized = args.code.trim()
        if (!normalized) {
            return { error: "Invite code is required" }
        }

        let workspace = await getWorkspaceByInviteCode(ctx.db, normalized)
        let membershipRole = "Member"
        let matchedInvite: Awaited<ReturnType<typeof getInviteByToken>> = null

        if (!workspace) {
            workspace = await getWorkspaceByInviteCode(ctx.db, normalized.toUpperCase())
        }

        if (!workspace) {
            matchedInvite = await getInviteByToken(ctx.db, normalized)
            if (!matchedInvite) {
                return { error: "Invalid invite code" }
            }

            if (!matchedInvite.workspaceId) {
                return { error: "This invite is no longer attached to a workspace" }
            }

            const expired = matchedInvite.expiresAt !== undefined && matchedInvite.expiresAt < args.now
            const exhausted = matchedInvite.maxUses > 0 && matchedInvite.uses >= matchedInvite.maxUses
            if (expired || exhausted) {
                return { error: "This invite code has expired or reached maximum uses" }
            }

            workspace = await getWorkspaceByLegacyId(ctx.db, matchedInvite.workspaceId)
            if (!workspace) {
                return { error: "This invite is no longer attached to a workspace" }
            }

            membershipRole = matchedInvite.role || "Member"
        }

        const existingMember = await getWorkspaceMemberByUserAndWorkspace(ctx.db, args.userId, workspace.id)

        if (!existingMember) {
            if (!args.membershipId) {
                throw new Error("membershipId is required when adding a new member")
            }

            if (matchedInvite) {
                await ctx.db.patch(matchedInvite._id, { uses: matchedInvite.uses + 1 })
            }

            await ctx.db.insert("workspaceMembers", {
                id: args.membershipId,
                userId: args.userId,
                workspaceId: workspace.id,
                role: membershipRole,
                name: args.userName,
                joinedAt: args.now,
            })

            if (args.notificationId) {
                await ctx.db.insert("notifications", {
                    id: args.notificationId,
                    workspaceId: workspace.id,
                    type: "member_joined",
                    title: "New member joined",
                    message: `${args.userName} has joined the workspace.`,
                    read: false,
                    createdAt: args.now,
                })
            }
        }

        const user = await getUserByLegacyId(ctx.db, args.userId)
        if (!user) {
            throw new Error("User not found")
        }

        await ctx.db.patch(user._id, {
            workspaceId: workspace.id,
            updatedAt: args.now,
        })

        return {
            success: true as const,
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            alreadyMember: Boolean(existingMember),
            message: existingMember
                ? `Welcome back! You are already a member of ${workspace.name}.`
                : undefined,
        }
    },
})

export const switchWorkspace = mutation({
    args: {
        userId: v.string(),
        workspaceId: v.string(),
        now: v.number(),
    },
    handler: async (ctx, args) => {
        const membership = await getWorkspaceMemberByUserAndWorkspace(ctx.db, args.userId, args.workspaceId)
        if (!membership) {
            return { error: "Not a member of this workspace" }
        }

        const user = await getUserByLegacyId(ctx.db, args.userId)
        if (!user) {
            return { error: "User not found" }
        }

        await ctx.db.patch(user._id, {
            workspaceId: args.workspaceId,
            updatedAt: args.now,
        })

        return { success: true as const }
    },
})

export const getWorkspaceMembersByNames = query({
    args: {
        workspaceId: v.string(),
        names: v.array(v.string()),
        excludeUserId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const members = await ctx.db
            .query("workspaceMembers")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .collect()
        return members
            .filter((m) => {
                if (args.excludeUserId && m.userId === args.excludeUserId) return false
                const memberName = (m.name || "").toLowerCase()
                return args.names.some((name) => memberName.includes(name.toLowerCase()))
            })
            .map((m) => ({ userId: m.userId, name: m.name }))
    },
})

export const getWorkspaceAdmins = query({
    args: {
        workspaceId: v.string(),
        excludeUserIds: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
        const members = await ctx.db
            .query("workspaceMembers")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .collect()
        const excludeSet = new Set(args.excludeUserIds ?? [])
        return members
            .filter((m) => m.role === "Admin" && !excludeSet.has(m.userId))
            .map((m) => ({ userId: m.userId }))
    },
})
