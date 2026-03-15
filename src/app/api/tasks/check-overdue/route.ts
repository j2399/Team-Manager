import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function POST() {
    const user = await getCurrentUser()
    if (!user?.workspaceId || !user.id || user.id === 'pending') {
        return NextResponse.json({ created: 0 })
    }

    const now = new Date()
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    try {
        const overdueTasks = await prisma.task.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { assigneeId: user.id },
                            { assignees: { some: { userId: user.id } } }
                        ]
                    },
                    {
                        OR: [
                            {
                                column: {
                                    name: { not: 'Done' },
                                    board: { project: { workspaceId: user.workspaceId } }
                                }
                            },
                            {
                                push: {
                                    project: { workspaceId: user.workspaceId }
                                }
                            }
                        ]
                    },
                    {
                        dueDate: { lt: now }
                    }
                ]
            },
            select: {
                id: true,
                title: true,
                column: {
                    select: {
                        name: true,
                        board: {
                            select: {
                                project: {
                                    select: { id: true }
                                }
                            }
                        }
                    }
                }
            }
        })

        const actionableTasks = overdueTasks.filter((task) => task.column?.name !== 'Done')
        if (actionableTasks.length === 0) {
            return NextResponse.json({ created: 0 })
        }

        const links = actionableTasks
            .map((task) => task.column?.board?.project?.id ? `/dashboard/projects/${task.column.board.project.id}?highlight=${task.id}` : null)
            .filter((link): link is string => Boolean(link))

        const existing = links.length > 0
            ? await prisma.notification.findMany({
                where: {
                    workspaceId: user.workspaceId,
                    userId: user.id,
                    type: 'task_due',
                    link: { in: links },
                    createdAt: { gt: cutoff }
                },
                select: { link: true }
            })
            : []

        const existingLinks = new Set(existing.map((notification) => notification.link).filter((link): link is string => Boolean(link)))
        const notificationsToCreate = actionableTasks
            .map((task) => {
                const projectId = task.column?.board?.project?.id
                if (!projectId) return null
                const link = `/dashboard/projects/${projectId}?highlight=${task.id}`
                if (existingLinks.has(link)) return null

                return {
                    workspaceId: user.workspaceId,
                    userId: user.id,
                    type: 'task_due',
                    title: 'Task overdue',
                    message: `${task.title} is overdue and needs attention.`,
                    link,
                }
            })
            .filter((notification): notification is {
                workspaceId: string
                userId: string
                type: string
                title: string
                message: string
                link: string
            } => Boolean(notification))

        if (notificationsToCreate.length > 0) {
            await prisma.notification.createMany({ data: notificationsToCreate })
        }

        return NextResponse.json({ created: notificationsToCreate.length })
    } catch (error) {
        console.error('Failed to create overdue notifications:', error)
        return NextResponse.json({ created: 0 }, { status: 200 })
    }
}
