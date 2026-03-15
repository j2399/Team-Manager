import prisma from "@/lib/prisma"
import { notFound } from "next/navigation"
import { ProjectContent } from "@/features/projects/ProjectContent"
import { getCurrentUser } from "@/lib/auth"

interface ProjectPageProps {
    params: Promise<{ id: string }>
}

export default async function ProjectPage({ params }: ProjectPageProps) {
    const currentUser = await getCurrentUser()
    if (!currentUser?.workspaceId) {
        notFound()
    }

    const { id } = await params

    const projectPromise = prisma.project.findUnique({
        where: { id },
        select: {
            id: true,
            name: true,
            color: true,
            workspaceId: true,
            lead: { select: { id: true, name: true } },
            members: { select: { userId: true } },
            boards: {
                select: {
                    id: true,
                    name: true,
                    columns: {
                        select: {
                            id: true,
                            name: true,
                            order: true
                        },
                        orderBy: { order: "asc" }
                    }
                }
            }
        }
    })

    const pushesPromise = prisma.push.findMany({
        where: { projectId: id },
        orderBy: { startDate: "asc" }
    })

    const [project, projectPushes] = await Promise.all([projectPromise, pushesPromise])

    if (!project) {
        notFound()
    }

    if (project.workspaceId !== currentUser.workspaceId) {
        notFound()
    }

    const boardData = project.boards[0] || null

    const board = boardData ? {
        ...boardData,
        columns: boardData.columns.map((col) => ({
            ...col,
            tasks: []
        }))
    } : null

    const usersRaw = project.workspaceId ? await prisma.user.findMany({
        where: { memberships: { some: { workspaceId: project.workspaceId } } },
        orderBy: { name: 'asc' },
        select: {
            id: true,
            name: true,
            memberships: {
                where: { workspaceId: project.workspaceId },
                select: { role: true, name: true }
            }
        }
    }) : []

    const projectMemberIds = new Set(project.members.map((member) => member.userId))

    const users = usersRaw.map(u => {
        const membership = u.memberships[0]
        return {
            id: u.id,
            name: membership?.name || u.name || 'Unknown',
            role: membership?.role || 'Member',
            isProjectMember: projectMemberIds.has(u.id)
        }
    })

    const pushIds = projectPushes.map((push) => push.id)
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

    const totalByPushId = new Map(
        counts.map((count) => [count.pushId || '', count._count._all])
    )
    const doneByPushId = new Map(
        doneCounts.map((count) => [count.pushId || '', count._count._all])
    )

    const pushes = projectPushes.map((push) => ({
        id: push.id,
        name: push.name,
        startDate: push.startDate.toISOString(),
        endDate: push.endDate ? push.endDate.toISOString() : '',
        status: push.status,
        color: push.color,
        projectId: push.projectId,
        dependsOnId: push.dependsOnId,
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
