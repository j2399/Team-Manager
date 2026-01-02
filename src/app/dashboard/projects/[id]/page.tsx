import prisma from "@/lib/prisma"
import { notFound } from "next/navigation"
import { ProjectContent } from "@/features/projects/ProjectContent"

interface ProjectPageProps {
    params: Promise<{ id: string }>
}

export default async function ProjectPage({ params }: ProjectPageProps) {
    const { id } = await params

    const project = await prisma.project.findUnique({
        where: { id },
        select: {
            id: true,
            name: true,
            color: true,
            workspaceId: true,
            lead: { select: { id: true, name: true } },
            members: { select: { userId: true } },
            pushes: {
                select: {
                    id: true,
                    name: true,
                    startDate: true,
                    endDate: true,
                    status: true,
                    color: true,
                    projectId: true,
                },
                orderBy: { startDate: "asc" }
            },
            boards: {
                select: {
                    id: true,
                    name: true,
                    columns: {
                        select: {
                            id: true,
                            name: true,
                            order: true,
                            tasks: {
                                select: {
                                    id: true,
                                    title: true,
                                    columnId: true,
                                    startDate: true,
                                    endDate: true,
                                    updatedAt: true,
                                    push: {
                                        select: {
                                            id: true,
                                            name: true,
                                            color: true,
                                            status: true
                                        }
                                    },
                                    assignee: {
                                        select: {
                                            id: true,
                                            name: true
                                        }
                                    }
                                }
                            }
                        },
                        orderBy: { order: "asc" }
                    }
                }
            }
        }
    })

    if (!project) {
        notFound()
    }

    const boardData = project.boards[0] || null

    const board = boardData ? {
        ...boardData,
        columns: boardData.columns.map(col => ({
            ...col,
            tasks: col.tasks.map(t => ({
                ...t,
                startDate: t.startDate ? t.startDate.toISOString() : null,
                endDate: t.endDate ? t.endDate.toISOString() : null,
                updatedAt: t.updatedAt ? t.updatedAt.toISOString() : null
            }))
        }))
    } : null

    const usersRaw = project.workspaceId ? await prisma.user.findMany({
        where: { memberships: { some: { workspaceId: project.workspaceId } } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, role: true }
    }) : []

    const projectMemberIds = new Set(project.members.map(m => m.userId))

    const users = usersRaw.map(u => ({
        id: u.id,
        name: u.name || 'Unknown',
        role: u.role || 'Member',
        isProjectMember: projectMemberIds.has(u.id)
    }))

    const pushIds = project.pushes.map((p) => p.id)
    const counts = pushIds.length > 0
        ? await prisma.task.groupBy({
            by: ["pushId"],
            where: {
                pushId: { in: pushIds },
                column: { board: { projectId: project.id } }
            },
            _count: { _all: true }
        })
        : []
    const doneCounts = pushIds.length > 0
        ? await prisma.task.groupBy({
            by: ["pushId"],
            where: {
                pushId: { in: pushIds },
                column: { name: "Done", board: { projectId: project.id } }
            },
            _count: { _all: true }
        })
        : []

    const totalByPushId = new Map(counts.map((c) => [c.pushId as string, c._count._all]))
    const doneByPushId = new Map(doneCounts.map((c) => [c.pushId as string, c._count._all]))

    const pushes = project.pushes.map((push) => ({
        id: push.id,
        name: push.name,
        startDate: push.startDate.toISOString(),
        endDate: push.endDate ? push.endDate.toISOString() : '',
        status: push.status,
        color: push.color,
        projectId: push.projectId,
        taskCount: totalByPushId.get(push.id) ?? 0,
        completedCount: doneByPushId.get(push.id) ?? 0
    }))

    return (
        <ProjectContent
            project={{
                id: project.id,
                name: project.name,
                color: project.color,
                lead: project.lead
            }}
            board={board}
            users={users}
            pushes={pushes}
        />
    )
}
