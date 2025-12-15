import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { notifyTaskOverdue } from '@/lib/discord'

export async function POST() {
    try {
        const now = new Date()
        
        // Find all tasks that are overdue (endDate < now) and not in Done column
        const overdueTasks = await prisma.task.findMany({
            where: {
                endDate: {
                    lt: now
                },
                column: {
                    name: {
                        not: 'Done'
                    }
                }
            },
            include: {
                column: {
                    include: {
                        board: {
                            include: {
                                project: {
                                    select: {
                                        name: true,
                                        workspaceId: true
                                    }
                                }
                            }
                        }
                    }
                },
                assignee: {
                    select: {
                        name: true
                    }
                }
            }
        })

        const workspaceIds = Array.from(new Set(
            overdueTasks
                .map((t) => t.column?.board?.project?.workspaceId)
                .filter((id): id is string => Boolean(id))
        ))

        const workspaces = workspaceIds.length
            ? await prisma.workspace.findMany({
                where: { id: { in: workspaceIds } },
                select: { id: true, discordChannelId: true }
            })
            : []

        const webhookByWorkspaceId = new Map(workspaces.map((w) => [w.id, w.discordChannelId]))

        // Send notifications for each overdue task
        const notifications = overdueTasks.map(async (task) => {
            if (!task.endDate) return
            
            const daysOverdue = Math.ceil((now.getTime() - task.endDate.getTime()) / (1000 * 60 * 60 * 24))
            const projectName = task.column?.board?.project?.name || 'Unknown Project'
            const workspaceId = task.column?.board?.project?.workspaceId
            const webhookUrl = workspaceId ? webhookByWorkspaceId.get(workspaceId) : null
            
            await notifyTaskOverdue(
                task.title,
                projectName,
                daysOverdue,
                task.assignee?.name,
                webhookUrl
            )
        })

        await Promise.all(notifications)

        return NextResponse.json({ 
            success: true, 
            overdueCount: overdueTasks.length 
        })
    } catch (error) {
        console.error('Failed to check overdue tasks:', error)
        return NextResponse.json(
            { error: 'Failed to check overdue tasks' }, 
            { status: 500 }
        )
    }
}

