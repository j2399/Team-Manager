import { v } from "convex/values"
import { makeFunctionReference } from "convex/server"
import { action, mutation, query } from "./_generated/server"
import { createLegacyId, now, stripDoc } from "./lib"

const getOverdueTasksRef = makeFunctionReference<"query">("tasks:getOverdueTasks")
const listLinksByTypeSinceRef = makeFunctionReference<"query">("notifications:listLinksByTypeSince")
const createManyRef = makeFunctionReference<"mutation">("notifications:createMany")

function isBroadcastNotification(notification: { userId?: string }) {
    return notification.userId === undefined
}

type OverdueTask = {
    id: string
    title: string
    projectId: string | null
}

type TaskDueNotification = {
    id: string
    workspaceId: string
    userId: string
    type: string
    title: string
    message: string
    link: string
    read: boolean
    createdAt: number
}

export const getUnreadCount = query({
    args: {
        workspaceId: v.string(),
        userId: v.string(),
    },
    handler: async (ctx, args) => {
        const [notifications, reads] = await Promise.all([
            ctx.db
                .query("notifications")
                .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
                .collect(),
            ctx.db
                .query("notificationReads")
                .withIndex("by_userId", (q) => q.eq("userId", args.userId))
                .collect(),
        ])

        const readIds = new Set(reads.map((read) => read.notificationId))

        let unreadCount = 0

        for (const notification of notifications) {
            if (notification.userId === args.userId && !notification.read) {
                unreadCount += 1
                continue
            }

            if (isBroadcastNotification(notification) && !readIds.has(notification.id)) {
                unreadCount += 1
            }
        }

        return unreadCount
    },
})

export const listForUser = query({
    args: {
        workspaceId: v.string(),
        userId: v.string(),
        since: v.optional(v.number()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = Math.min(Math.max(args.limit ?? 20, 1), 200)

        const [notifications, reads] = await Promise.all([
            ctx.db
                .query("notifications")
                .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
                .collect(),
            ctx.db
                .query("notificationReads")
                .withIndex("by_userId", (q) => q.eq("userId", args.userId))
                .collect(),
        ])

        const readIds = new Set(reads.map((read) => read.notificationId))

        return notifications
            .filter((notification) => {
                const targetedToUser =
                    notification.userId === args.userId || isBroadcastNotification(notification)

                if (!targetedToUser) return false
                if (args.since !== undefined && notification.createdAt <= args.since) return false

                return true
            })
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, limit)
            .map((notification) => ({
                ...stripDoc(notification),
                read: isBroadcastNotification(notification)
                    ? readIds.has(notification.id)
                    : notification.read,
            }))
    },
})

export const markAllRead = mutation({
    args: {
        workspaceId: v.string(),
        userId: v.string(),
    },
    handler: async (ctx, args) => {
        const [notifications, reads] = await Promise.all([
            ctx.db
                .query("notifications")
                .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
                .collect(),
            ctx.db
                .query("notificationReads")
                .withIndex("by_userId", (q) => q.eq("userId", args.userId))
                .collect(),
        ])

        const readIds = new Set(reads.map((read) => read.notificationId))

        await Promise.all(
            notifications.map(async (notification) => {
                if (notification.userId === args.userId && !notification.read) {
                    await ctx.db.patch(notification._id, { read: true })
                    return
                }

                if (isBroadcastNotification(notification) && !readIds.has(notification.id)) {
                    const existingRead = await ctx.db
                        .query("notificationReads")
                        .withIndex("by_notificationId_userId", (q) =>
                            q.eq("notificationId", notification.id).eq("userId", args.userId)
                        )
                        .unique()

                    if (!existingRead) {
                        await ctx.db.insert("notificationReads", {
                            id: createLegacyId("notification_read"),
                            notificationId: notification.id,
                            userId: args.userId,
                            readAt: now(),
                        })
                    }
                }
            })
        )

        return { success: true }
    },
})

export const markRead = mutation({
    args: {
        workspaceId: v.string(),
        userId: v.string(),
        notificationId: v.string(),
    },
    handler: async (ctx, args) => {
        const notification = await ctx.db
            .query("notifications")
            .withIndex("by_legacy_id", (q) => q.eq("id", args.notificationId))
            .unique()

        if (!notification || notification.workspaceId !== args.workspaceId) {
            return { error: "Notification not found" as const }
        }

        if (notification.userId !== undefined && notification.userId !== args.userId) {
            return { error: "Notification not found" as const }
        }

        if (isBroadcastNotification(notification)) {
            const existingRead = await ctx.db
                .query("notificationReads")
                .withIndex("by_notificationId_userId", (q) =>
                    q.eq("notificationId", notification.id).eq("userId", args.userId)
                )
                .unique()

            if (!existingRead) {
                await ctx.db.insert("notificationReads", {
                    id: createLegacyId("notification_read"),
                    notificationId: notification.id,
                    userId: args.userId,
                    readAt: now(),
                })
            }
        } else if (!notification.read) {
            await ctx.db.patch(notification._id, { read: true })
        }

        return { success: true }
    },
})

export const createMany = mutation({
    args: {
        notifications: v.array(v.object({
            id: v.string(),
            workspaceId: v.string(),
            userId: v.optional(v.string()),
            type: v.string(),
            title: v.string(),
            message: v.string(),
            link: v.optional(v.string()),
            read: v.boolean(),
            createdAt: v.number(),
        })),
    },
    handler: async (ctx, args) => {
        for (const notification of args.notifications) {
            const existing = await ctx.db
                .query("notifications")
                .withIndex("by_legacy_id", (q) => q.eq("id", notification.id))
                .unique()

            if (existing) {
                await ctx.db.patch(existing._id, notification)
            } else {
                await ctx.db.insert("notifications", notification)
            }
        }

        return { success: true, created: args.notifications.length }
    },
})

export const listLinksByTypeSince = query({
    args: {
        workspaceId: v.string(),
        userId: v.string(),
        type: v.string(),
        links: v.array(v.string()),
        since: v.number(),
    },
    handler: async (ctx, args) => {
        const notifications = await ctx.db
            .query("notifications")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
            .collect()

        return notifications
            .filter((notification) =>
                notification.userId === args.userId &&
                notification.type === args.type &&
                notification.createdAt > args.since &&
                notification.link !== undefined &&
                args.links.includes(notification.link)
            )
            .map((notification) => notification.link as string)
    },
})

export const createOverdueTaskNotifications = action({
    args: {
        workspaceId: v.string(),
        userId: v.string(),
        now: v.number(),
    },
    handler: async (ctx, args) => {
        const cutoff = args.now - 24 * 60 * 60 * 1000

        const overdueTasks = await ctx.runQuery(getOverdueTasksRef, {
            userId: args.userId,
            workspaceId: args.workspaceId,
            now: args.now,
        }) as OverdueTask[]

        if (overdueTasks.length === 0) {
            return { created: 0 }
        }

        const links = overdueTasks
            .map((task) => task.projectId ? `/dashboard/projects/${task.projectId}?highlight=${task.id}` : null)
            .filter((link): link is string => Boolean(link))

        const existingLinks = new Set(
            links.length > 0
                ? await ctx.runQuery(listLinksByTypeSinceRef, {
                    workspaceId: args.workspaceId,
                    userId: args.userId,
                    type: "task_due",
                    links,
                    since: cutoff,
                })
                : []
        )

        const notifications = overdueTasks
            .map((task) => {
                const projectId = task.projectId
                if (!projectId) return null

                const link = `/dashboard/projects/${projectId}?highlight=${task.id}`
                if (existingLinks.has(link)) return null

                return {
                    id: createLegacyId("notification"),
                    workspaceId: args.workspaceId,
                    userId: args.userId,
                    type: "task_due",
                    title: "Task overdue",
                    message: `${task.title} is overdue and needs attention.`,
                    link,
                    read: false,
                    createdAt: args.now,
                }
            })
            .filter((notification): notification is TaskDueNotification => Boolean(notification))

        if (notifications.length > 0) {
            await ctx.runMutation(createManyRef, {
                notifications,
            })
        }

        return { created: notifications.length }
    },
})
