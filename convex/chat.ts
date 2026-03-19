import { v } from "convex/values"
import { makeFunctionReference } from "convex/server"
import { action, mutation, query } from "./_generated/server"
import {
    createLegacyId,
    getUserByLegacyId,
    getWorkspaceByLegacyId,
    now,
    stripDoc,
} from "./lib"

const createMessageRef = makeFunctionReference<"mutation">("chat:createMessage")

export const listMessages = query({
    args: {
        workspaceId: v.string(),
        limit: v.optional(v.number()),
        since: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = Math.min(Math.max(args.limit ?? 50, 1), 200)

        const messages = await ctx.db
            .query("generalChatMessages")
            .withIndex("by_workspaceId_createdAt", (q) => q.eq("workspaceId", args.workspaceId))
            .collect()

        const authorIds = Array.from(new Set(messages.map((message) => message.authorId)))
        const authors = await Promise.all(authorIds.map((authorId) => getUserByLegacyId(ctx.db, authorId)))
        const authorById = new Map(
            authors.filter((author): author is NonNullable<typeof author> => author !== null).map((author) => [
                author.id,
                author,
            ])
        )

        return messages
            .filter((message) => args.since === undefined || message.createdAt > args.since)
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, limit)
            .reverse()
            .map((message) => {
                const author = authorById.get(message.authorId)
                return {
                    ...stripDoc(message),
                    author: author
                        ? {
                            id: author.id,
                            name: author.name,
                            avatar: author.avatar ?? null,
                        }
                        : {
                            id: message.authorId,
                            name: message.authorName,
                            avatar: message.authorAvatar ?? null,
                        },
                }
            })
    },
})

export const createMessage = mutation({
    args: {
        workspaceId: v.string(),
        authorId: v.string(),
        authorName: v.string(),
        authorAvatar: v.optional(v.string()),
        content: v.string(),
        type: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const workspace = await getWorkspaceByLegacyId(ctx.db, args.workspaceId)
        if (!workspace) {
            throw new Error("Workspace not found")
        }

        const createdAt = now()
        const message = {
            id: createLegacyId("chat_message"),
            content: args.content,
            type: args.type ?? "text",
            authorId: args.authorId,
            authorName: args.authorName,
            workspaceId: args.workspaceId,
            createdAt,
            ...(args.authorAvatar ? { authorAvatar: args.authorAvatar } : {}),
        }

        await ctx.db.insert("generalChatMessages", message)

        const workspaceMembers = await ctx.db
            .query("workspaceMembers")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .collect()

        const memberIds = Array.from(new Set(workspaceMembers.map((membership) => membership.userId)))
        const memberUsers = await Promise.all(memberIds.map((userId) => getUserByLegacyId(ctx.db, userId)))

        return {
            message: {
                ...message,
                author: {
                    id: args.authorId,
                    name: args.authorName,
                    avatar: args.authorAvatar ?? null,
                },
            },
            discordChannelId: workspace.discordChannelId ?? null,
            mentionableMembers: memberUsers
                .filter((member): member is NonNullable<typeof member> => member !== null && member.discordId !== undefined)
                .map((member) => ({
                    name: member.name,
                    discordId: member.discordId!,
                })),
        }
    },
})

export const sendMessageWithDiscordMentions = action({
    args: {
        workspaceId: v.string(),
        authorId: v.string(),
        authorName: v.string(),
        authorAvatar: v.optional(v.string()),
        content: v.string(),
        type: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const created = await ctx.runMutation(createMessageRef, args)

        if (args.content.includes("@") && created.discordChannelId) {
            try {
                let discordContent = args.content
                let hasMentions = false

                const sortedMembers = [...created.mentionableMembers].sort((a, b) => b.name.length - a.name.length)

                for (const member of sortedMembers) {
                    if (!member.discordId) continue

                    const mentionString = `@${member.name}`
                    if (discordContent.includes(mentionString)) {
                        discordContent = discordContent.split(mentionString).join(`<@${member.discordId}>`)
                        hasMentions = true
                    }
                }

                if (discordContent.includes("@everyone")) {
                    hasMentions = true
                }

                if (hasMentions) {
                    await fetch(created.discordChannelId, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            content: "",
                            embeds: [{
                                title: "💬 Chat Mention",
                                description: discordContent,
                                color: 0x5865F2,
                                timestamp: new Date().toISOString(),
                            }],
                        }),
                    })
                }
            } catch (error) {
                console.error("Failed to send Discord notification for chat:", error)
            }
        }

        return created.message
    },
})
