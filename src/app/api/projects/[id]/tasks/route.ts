import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { getLeanProjectTasks } from "@/lib/project-tasks"
import type { Prisma } from "@prisma/client"

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
        const pushIdParam = searchParams.get("pushId")

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { id: true, workspaceId: true }
        })

        if (!project || project.workspaceId !== user.workspaceId) {
            return NextResponse.json({ error: "Division not found" }, { status: 404 })
        }

        const where: Prisma.TaskWhereInput = {
            column: { board: { projectId } },
        }

        // Only filter by pushId when the caller supplies the param.
        // When omitted, return tasks from all pushes + backlog.
        if (pushIdParam && pushIdParam.trim().length > 0) {
            where.pushId = (pushIdParam === "null" || pushIdParam === "backlog") ? null : pushIdParam
        }

        const lean = searchParams.get("lean") === "true"

        if (lean) {
            return NextResponse.json({ tasks: await getLeanProjectTasks(where) })
        }

        const tasks = await prisma.task.findMany({
            where,
            include: {
                assignee: { select: { id: true, name: true } },
                assignees: {
                    include: {
                        user: { select: { id: true, name: true } }
                    }
                },
                push: { select: { id: true, name: true, color: true, status: true } },
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
                    orderBy: { createdAt: "desc" }
                }
            },
            orderBy: { updatedAt: "desc" }
        })

        return NextResponse.json({
            tasks: tasks.map((t) => ({
                ...t,
                startDate: t.startDate?.toISOString() || null,
                endDate: t.endDate?.toISOString() || null,
                dueDate: t.dueDate?.toISOString() || null,
                createdAt: t.createdAt?.toISOString(),
                updatedAt: t.updatedAt?.toISOString() || null,
                activityLogs: t.activityLogs.map((log) => ({
                    ...log,
                    createdAt: log.createdAt.toISOString()
                })),
                comments: t.comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
                attachments: t.attachments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
            }))
        })
    } catch (error) {
        console.error("Failed to fetch division tasks:", error)
        return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 })
    }
}
