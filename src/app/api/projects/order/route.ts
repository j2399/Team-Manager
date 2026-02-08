import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser()
        if (!user?.id || user.id === "pending" || !user.workspaceId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
        }

        const body = await request.json().catch(() => null)
        const projectIdsRaw = body?.projectIds
        if (!Array.isArray(projectIdsRaw)) {
            return NextResponse.json({ error: "divisionIds must be an array" }, { status: 400 })
        }

        const projectIds = Array.from(new Set(projectIdsRaw.filter((x: unknown) => typeof x === "string" && x.trim().length > 0)))
        if (projectIds.length === 0) {
            return NextResponse.json({ error: "divisionIds cannot be empty" }, { status: 400 })
        }

        const workspaceProjects = await prisma.project.findMany({
            where: { workspaceId: user.workspaceId, id: { in: projectIds } },
            select: { id: true },
        })

        if (workspaceProjects.length !== projectIds.length) {
            return NextResponse.json({ error: "One or more divisions are not accessible" }, { status: 403 })
        }

        const workspaceProjectIds = await prisma.project.findMany({
            where: { workspaceId: user.workspaceId },
            select: { id: true },
        })
        const workspaceProjectIdSet = workspaceProjectIds.map((p) => p.id)

        await prisma.$transaction(async (tx) => {
            await tx.projectUserOrder.deleteMany({
                where: {
                    userId: user.id,
                    projectId: { in: workspaceProjectIdSet, notIn: projectIds },
                },
            })

            await Promise.all(
                projectIds.map((projectId, index) =>
                    tx.projectUserOrder.upsert({
                        where: { userId_projectId: { userId: user.id, projectId } },
                        create: { userId: user.id, projectId, order: index },
                        update: { order: index },
                    })
                )
            )
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Failed to update division order:", error)
        return NextResponse.json({ error: "Failed to update division order" }, { status: 500 })
    }
}
