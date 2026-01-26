import prisma from './prisma'

export type TaskContext = {
    id: string
    title: string | null
    projectId: string | null
    workspaceId: string | null
}

export async function getTaskContext(taskId: string): Promise<TaskContext | null> {
    const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
            id: true,
            title: true,
            column: {
                select: {
                    board: {
                        select: {
                            projectId: true,
                            project: { select: { workspaceId: true } }
                        }
                    }
                }
            },
            push: {
                select: {
                    projectId: true,
                    project: { select: { workspaceId: true } }
                }
            }
        }
    })

    if (!task) return null

    const projectId = task.column?.board?.projectId ?? task.push?.projectId ?? null
    const workspaceId = task.column?.board?.project?.workspaceId ?? task.push?.project?.workspaceId ?? null

    return {
        id: task.id,
        title: task.title,
        projectId,
        workspaceId
    }
}

export async function getProjectContext(projectId: string) {
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, workspaceId: true }
    })

    if (!project) return null

    return { id: project.id, workspaceId: project.workspaceId }
}

export async function isUserInWorkspace(userId: string, workspaceId: string) {
    const membership = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
        select: { userId: true }
    })

    if (membership) return true

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { workspaceId: true }
    })

    return user?.workspaceId === workspaceId
}

export async function getWorkspaceUserIds(userIds: string[], workspaceId: string) {
    const uniqueIds = Array.from(
        new Set(userIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
    )
    if (uniqueIds.length === 0) return []

    const members = await prisma.workspaceMember.findMany({
        where: { workspaceId, userId: { in: uniqueIds } },
        select: { userId: true }
    })

    const allowedIds = new Set(members.map((member) => member.userId))

    if (allowedIds.size === uniqueIds.length) {
        return uniqueIds
    }

    const users = await prisma.user.findMany({
        where: { id: { in: uniqueIds }, workspaceId },
        select: { id: true }
    })

    for (const user of users) {
        allowedIds.add(user.id)
    }

    return Array.from(allowedIds)
}
