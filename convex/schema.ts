import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
    users: defineTable({
        id: v.string(),
        name: v.string(),
        email: v.string(),
        discordId: v.optional(v.string()),
        avatar: v.optional(v.string()),
        role: v.string(),
        workspaceId: v.optional(v.string()),
        skills: v.array(v.string()),
        interests: v.optional(v.string()),
        hasOnboarded: v.boolean(),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_email", ["email"])
        .index("by_workspaceId", ["workspaceId"])
        .index("by_discordId", ["discordId"]),

    subteams: defineTable({
        id: v.string(),
        name: v.string(),
        color: v.string(),
        workspaceId: v.optional(v.string()),
    })
        .index("by_legacy_id", ["id"])
        .index("by_workspaceId", ["workspaceId"]),

    projects: defineTable({
        id: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        color: v.string(),
        archivedAt: v.optional(v.number()),
        leadId: v.optional(v.string()),
        workspaceId: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_workspaceId", ["workspaceId"])
        .index("by_leadId", ["leadId"]),

    projectLeadAssignments: defineTable({
        id: v.string(),
        projectId: v.string(),
        userId: v.string(),
        createdAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_projectId", ["projectId"])
        .index("by_userId", ["userId"])
        .index("by_projectId_userId", ["projectId", "userId"]),

    projectMembers: defineTable({
        id: v.string(),
        projectId: v.string(),
        userId: v.string(),
        createdAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_projectId", ["projectId"])
        .index("by_userId", ["userId"])
        .index("by_projectId_userId", ["projectId", "userId"]),

    projectUserOrders: defineTable({
        id: v.string(),
        userId: v.string(),
        projectId: v.string(),
        order: v.number(),
        createdAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_userId", ["userId"])
        .index("by_projectId", ["projectId"])
        .index("by_userId_order", ["userId", "order"]),

    pushes: defineTable({
        id: v.string(),
        name: v.string(),
        projectId: v.string(),
        startDate: v.number(),
        endDate: v.optional(v.number()),
        status: v.string(),
        color: v.string(),
        dependsOnId: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_projectId", ["projectId"])
        .index("by_dependsOnId", ["dependsOnId"]),

    boards: defineTable({
        id: v.string(),
        name: v.string(),
        projectId: v.string(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_projectId", ["projectId"]),

    columns: defineTable({
        id: v.string(),
        name: v.string(),
        boardId: v.string(),
        order: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_boardId", ["boardId"])
        .index("by_boardId_order", ["boardId", "order"]),

    tasks: defineTable({
        id: v.string(),
        title: v.string(),
        description: v.optional(v.string()),
        status: v.string(),
        assigneeId: v.optional(v.string()),
        pushId: v.optional(v.string()),
        columnId: v.optional(v.string()),
        subteamId: v.optional(v.string()),
        priority: v.string(),
        requireAttachment: v.boolean(),
        attachmentFolderId: v.optional(v.string()),
        attachmentFolderName: v.optional(v.string()),
        instructionsFileUrl: v.optional(v.string()),
        instructionsFileName: v.optional(v.string()),
        progress: v.number(),
        enableProgress: v.boolean(),
        startDate: v.optional(v.number()),
        endDate: v.optional(v.number()),
        dueDate: v.optional(v.number()),
        submittedAt: v.optional(v.number()),
        approvedAt: v.optional(v.number()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_columnId", ["columnId"])
        .index("by_pushId", ["pushId"])
        .index("by_assigneeId", ["assigneeId"])
        .index("by_updatedAt", ["updatedAt"]),

    taskDeletions: defineTable({
        id: v.string(),
        taskId: v.string(),
        projectId: v.string(),
        workspaceId: v.string(),
        deletedBy: v.optional(v.string()),
        deletedByName: v.optional(v.string()),
        deletedAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_taskId", ["taskId"])
        .index("by_projectId_deletedAt", ["projectId", "deletedAt"])
        .index("by_workspaceId_deletedAt", ["workspaceId", "deletedAt"]),

    taskAssignees: defineTable({
        id: v.string(),
        taskId: v.string(),
        userId: v.string(),
        createdAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_taskId", ["taskId"])
        .index("by_userId", ["userId"])
        .index("by_taskId_userId", ["taskId", "userId"]),

    comments: defineTable({
        id: v.string(),
        content: v.string(),
        taskId: v.string(),
        authorId: v.string(),
        authorName: v.string(),
        replyToId: v.optional(v.string()),
        createdAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_taskId", ["taskId"])
        .index("by_replyToId", ["replyToId"]),

    taskAttachments: defineTable({
        id: v.string(),
        name: v.string(),
        url: v.string(),
        size: v.number(),
        type: v.string(),
        storageProvider: v.string(),
        externalId: v.optional(v.string()),
        order: v.number(),
        taskId: v.string(),
        uploadedBy: v.string(),
        createdAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_taskId", ["taskId"]),

    taskChecklistItems: defineTable({
        id: v.string(),
        taskId: v.string(),
        content: v.string(),
        completed: v.boolean(),
        completedBy: v.optional(v.string()),
        completedAt: v.optional(v.number()),
        order: v.number(),
        createdBy: v.string(),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_taskId", ["taskId"])
        .index("by_taskId_order", ["taskId", "order"]),

    activityLogs: defineTable({
        id: v.string(),
        taskId: v.optional(v.string()),
        taskTitle: v.optional(v.string()),
        action: v.string(),
        field: v.optional(v.string()),
        oldValue: v.optional(v.string()),
        newValue: v.optional(v.string()),
        changedBy: v.string(),
        changedByName: v.string(),
        details: v.optional(v.string()),
        createdAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_taskId", ["taskId"])
        .index("by_createdAt", ["createdAt"]),

    invites: defineTable({
        id: v.string(),
        token: v.string(),
        workspaceId: v.optional(v.string()),
        role: v.string(),
        expiresAt: v.optional(v.number()),
        maxUses: v.number(),
        uses: v.number(),
        createdBy: v.string(),
        createdAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_token", ["token"])
        .index("by_workspaceId", ["workspaceId"]),

    workspaceConfigs: defineTable({
        id: v.string(),
        name: v.string(),
        updatedAt: v.number(),
    }).index("by_legacy_id", ["id"]),

    workspaces: defineTable({
        id: v.string(),
        name: v.string(),
        inviteCode: v.string(),
        discordChannelId: v.optional(v.string()),
        ownerId: v.string(),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_ownerId", ["ownerId"])
        .index("by_inviteCode", ["inviteCode"]),

    workspaceDriveConfigs: defineTable({
        id: v.string(),
        workspaceId: v.string(),
        provider: v.string(),
        accessToken: v.optional(v.string()),
        refreshToken: v.optional(v.string()),
        tokenExpiry: v.optional(v.number()),
        folderId: v.optional(v.string()),
        folderName: v.optional(v.string()),
        folderTree: v.optional(v.any()),
        folderTreeUpdatedAt: v.optional(v.number()),
        connectedById: v.optional(v.string()),
        connectedByName: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_workspaceId", ["workspaceId"]),

    workloadConfigs: defineTable({
        id: v.string(),
        workspaceId: v.string(),
        config: v.any(),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_workspaceId", ["workspaceId"]),

    workspaceMembers: defineTable({
        id: v.string(),
        userId: v.string(),
        workspaceId: v.string(),
        role: v.string(),
        name: v.string(),
        joinedAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_userId", ["userId"])
        .index("by_workspaceId", ["workspaceId"])
        .index("by_userId_workspaceId", ["userId", "workspaceId"]),

    notifications: defineTable({
        id: v.string(),
        workspaceId: v.string(),
        userId: v.optional(v.string()),
        type: v.string(),
        title: v.string(),
        message: v.string(),
        link: v.optional(v.string()),
        read: v.boolean(),
        createdAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_workspaceId", ["workspaceId"])
        .index("by_workspaceId_userId", ["workspaceId", "userId"])
        .index("by_createdAt", ["createdAt"]),

    notificationReads: defineTable({
        id: v.string(),
        notificationId: v.string(),
        userId: v.string(),
        readAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_notificationId", ["notificationId"])
        .index("by_userId", ["userId"])
        .index("by_notificationId_userId", ["notificationId", "userId"]),

    generalChatMessages: defineTable({
        id: v.string(),
        content: v.string(),
        type: v.string(),
        authorId: v.string(),
        authorName: v.string(),
        authorAvatar: v.optional(v.string()),
        workspaceId: v.string(),
        createdAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_workspaceId_createdAt", ["workspaceId", "createdAt"])
        .index("by_authorId", ["authorId"]),

    chatTypings: defineTable({
        userId: v.string(),
        updatedAt: v.number(),
    }).index("by_userId", ["userId"]),

    sessions: defineTable({
        id: v.string(),
        userId: v.string(),
        tokenHash: v.string(),
        expiresAt: v.number(),
        createdAt: v.number(),
    })
        .index("by_legacy_id", ["id"])
        .index("by_userId", ["userId"])
        .index("by_tokenHash", ["tokenHash"]),
})
