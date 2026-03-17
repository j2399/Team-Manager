import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"

export async function getLeanProjectTasks(where: Prisma.TaskWhereInput) {
    const tasks = await prisma.task.findMany({
        where,
        select: {
            id: true,
            title: true,
            description: true,
            columnId: true,
            assigneeId: true,
            startDate: true,
            endDate: true,
            dueDate: true,
            createdAt: true,
            updatedAt: true,
            requireAttachment: true,
            enableProgress: true,
            attachmentFolderId: true,
            attachmentFolderName: true,
            instructionsFileUrl: true,
            instructionsFileName: true,
            push: { select: { id: true, name: true, color: true, status: true } },
            assignee: { select: { id: true, name: true } },
            assignees: {
                include: {
                    user: { select: { id: true, name: true } }
                }
            },
            activityLogs: {
                where: { newValue: "Done" },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { changedByName: true, createdAt: true }
            },
            comments: {
                select: { createdAt: true },
                orderBy: { createdAt: "desc" },
                take: 1
            },
            attachments: {
                select: { id: true, createdAt: true },
                orderBy: { createdAt: "desc" },
                take: 1
            }
        },
        orderBy: { updatedAt: "desc" }
    })

    return tasks.map((task) => ({
        ...task,
        startDate: task.startDate?.toISOString() || null,
        endDate: task.endDate?.toISOString() || null,
        dueDate: task.dueDate?.toISOString() || null,
        createdAt: task.createdAt?.toISOString(),
        updatedAt: task.updatedAt?.toISOString() || null,
        activityLogs: task.activityLogs.map((log) => ({
            ...log,
            createdAt: log.createdAt.toISOString()
        })),
        comments: task.comments.map((comment) => ({
            ...comment,
            createdAt: comment.createdAt.toISOString()
        })),
        attachments: task.attachments.map((attachment) => ({
            ...attachment,
            createdAt: attachment.createdAt.toISOString()
        })),
    }))
}
