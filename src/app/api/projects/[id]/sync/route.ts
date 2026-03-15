import { NextResponse } from "next/server"
import type { Prisma } from '@prisma/client'
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

// Lightweight sync endpoint - returns only what changed since last check
// Used for real-time updates without heavy data transfer
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getCurrentUser()
    if (!user || !user.workspaceId) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    try {
        const { id: projectId } = await params
        const { searchParams } = new URL(request.url)
        const since = searchParams.get("since") // ISO timestamp
        const cursorParam = searchParams.get("cursor")
        const limitParam = searchParams.get("limit")

        const limit = Math.min(200, Math.max(1, Number(limitParam) || 100))
        let cursor: { updatedAt: Date; id: string } | null = null
        if (cursorParam) {
            const [cursorUpdatedAt, cursorId] = cursorParam.split("::")
            if (cursorUpdatedAt && cursorId) {
                const parsed = new Date(cursorUpdatedAt)
                if (!isNaN(parsed.getTime())) {
                    cursor = { updatedAt: parsed, id: cursorId }
                }
            }
        }

        // Verify project existence and access in one combined check
        const project = await prisma.project.findFirst({
            where: {
                id: projectId,
                workspaceId: user.workspaceId
            },
            select: { id: true }
        })

        if (!project) {
            return NextResponse.json({ error: "Division not found or access denied" }, { status: 404 })
        }

        // Build query for tasks updated since timestamp
        const where: Prisma.TaskWhereInput = {
            column: { board: { projectId } }
        }
        const and: Prisma.TaskWhereInput[] = []
        if (since) {
            and.push({ updatedAt: { gt: new Date(since) } })
        }
        if (cursor) {
            and.push({
                OR: [
                    { updatedAt: { lt: cursor.updatedAt } },
                    { updatedAt: cursor.updatedAt, id: { lt: cursor.id } }
                ]
            })
        }
        if (and.length > 0) {
            where.AND = and
        }

        // Fetch only minimal data for changed tasks
        const changedTasks = await prisma.task.findMany({
            where,
            select: {
                id: true,
                title: true,
                description: true,
                columnId: true,
                updatedAt: true,
                assignee: { select: { id: true, name: true } },
                assignees: {
                    include: {
                        user: { select: { id: true, name: true } }
                    }
                },
                push: { select: { id: true, name: true, color: true, status: true } },
                startDate: true,
                endDate: true,
                requireAttachment: true,
                attachmentFolderId: true,
                attachmentFolderName: true,
                attachments: {
                    select: { id: true },
                    take: 1
                }
            },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: limit + 1 // Fetch one extra to detect pagination
        })

        const hasMore = changedTasks.length > limit
        const pageTasks = hasMore ? changedTasks.slice(0, limit) : changedTasks
        const lastTask = pageTasks[pageTasks.length - 1] || null
        const nextCursor = hasMore && lastTask?.updatedAt
            ? `${lastTask.updatedAt.toISOString()}::${lastTask.id}`
            : null

        const deletedWhere: Prisma.TaskDeletionWhereInput = { projectId }
        if (since) {
            deletedWhere.deletedAt = { gt: new Date(since) }
        }
        const deletions = await prisma.taskDeletion.findMany({
            where: deletedWhere,
            select: { taskId: true, deletedAt: true },
            orderBy: { deletedAt: "desc" }
        })
        const deletedTaskIds = deletions.map(d => d.taskId)
        const latestDeletion = deletions[0]?.deletedAt?.toISOString() || null

        const latestUpdate = pageTasks.length > 0
            ? pageTasks[0].updatedAt?.toISOString()
            : null

        const candidates = [latestUpdate, latestDeletion, since].filter(Boolean) as string[]
        const lastUpdate = candidates.length > 0
            ? candidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
            : new Date().toISOString()

        return NextResponse.json({
            hasChanges: pageTasks.length > 0 || deletedTaskIds.length > 0,
            tasks: pageTasks.map(t => ({
                id: t.id,
                title: t.title,
                description: t.description ?? null,
                columnId: t.columnId,
                updatedAt: t.updatedAt?.toISOString(),
                assignee: t.assignee,
                assignees: t.assignees,
                push: t.push,
                startDate: t.startDate?.toISOString() || null,
                endDate: t.endDate?.toISOString() || null,
                requireAttachment: t.requireAttachment,
                attachmentFolderId: t.attachmentFolderId || null,
                attachmentFolderName: t.attachmentFolderName || null,
                hasAttachment: t.attachments.length > 0
            })),
            deletedTaskIds,
            latestUpdate,
            latestDeletion,
            hasMore,
            nextCursor,
            lastUpdate,
            serverTime: new Date().toISOString()
        })
    } catch (error) {
        console.error("Failed to sync division:", error)
        return NextResponse.json({ error: "Failed to sync" }, { status: 500 })
    }
}
