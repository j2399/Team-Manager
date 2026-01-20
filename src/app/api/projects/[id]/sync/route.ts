import { NextResponse } from "next/server"
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

        // Verify project existence and access in one combined check
        const project = await prisma.project.findFirst({
            where: {
                id: projectId,
                workspaceId: user.workspaceId
            },
            select: { id: true }
        })

        if (!project) {
            return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 })
        }

        // Build query for tasks updated since timestamp
        const where: any = {
            column: { board: { projectId } }
        }

        if (since) {
            where.updatedAt = { gt: new Date(since) }
        }

        // Fetch only minimal data for changed tasks
        const changedTasks = await prisma.task.findMany({
            where,
            select: {
                id: true,
                title: true,
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
                attachments: {
                    select: { id: true },
                    take: 1
                }
            },
            orderBy: { updatedAt: "desc" },
            take: 100 // Limit to prevent huge responses
        })

        // Get deleted task IDs (tasks that existed but are now gone)
        // We track this by checking if any tasks were deleted since the timestamp
        // For now, we'll just return changed tasks - deletions will be caught on full refresh

        // Get the latest update timestamp
        const latestUpdate = changedTasks.length > 0
            ? changedTasks[0].updatedAt?.toISOString()
            : since || new Date().toISOString()

        return NextResponse.json({
            hasChanges: changedTasks.length > 0,
            tasks: changedTasks.map(t => ({
                id: t.id,
                title: t.title,
                columnId: t.columnId,
                updatedAt: t.updatedAt?.toISOString(),
                assignee: t.assignee,
                assignees: t.assignees,
                push: t.push,
                startDate: t.startDate?.toISOString() || null,
                endDate: t.endDate?.toISOString() || null,
                requireAttachment: t.requireAttachment,
                hasAttachment: t.attachments.length > 0
            })),
            lastUpdate: latestUpdate,
            // Return timestamp for next poll
            serverTime: new Date().toISOString()
        })
    } catch (error) {
        console.error("Failed to sync project:", error)
        return NextResponse.json({ error: "Failed to sync" }, { status: 500 })
    }
}
