import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
    try {
        const user = await getCurrentUser()
        if (!user || !user.workspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        // Check if user is leadership
        if (user.role !== 'Admin' && user.role !== 'Team Lead') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // Fetch all projects in workspace with their pushes and task counts
        const projects = await prisma.project.findMany({
            where: { workspaceId: user.workspaceId },
            select: {
                id: true,
                name: true,
                color: true,
                pushes: {
                    select: {
                        id: true,
                        name: true,
                        startDate: true,
                        endDate: true,
                        status: true,
                        tasks: {
                            select: {
                                id: true,
                                status: true,
                                column: {
                                    select: {
                                        name: true
                                    }
                                },
                                createdAt: true,
                                updatedAt: true,
                                submittedAt: true,
                                approvedAt: true
                            }
                        }
                    },
                    orderBy: { startDate: 'asc' }
                }
            },
            orderBy: { name: 'asc' }
        })

        // Process data for each project
        const projectActivity = projects.map(project => {
            // Aggregate stats per push/sprint
            const pushStats = project.pushes.map(push => {
                const tasks = push.tasks
                const completed = tasks.filter(t =>
                    t.column?.name?.toLowerCase() === 'done' ||
                    t.status?.toLowerCase() === 'done'
                ).length
                const inReview = tasks.filter(t =>
                    t.column?.name?.toLowerCase() === 'review' ||
                    t.status?.toLowerCase() === 'review'
                ).length
                const inProgress = tasks.filter(t =>
                    t.column?.name?.toLowerCase() === 'in progress' ||
                    t.status?.toLowerCase() === 'in progress'
                ).length
                const todo = tasks.filter(t =>
                    t.column?.name?.toLowerCase() === 'to do' ||
                    t.column?.name?.toLowerCase() === 'todo' ||
                    t.status?.toLowerCase() === 'todo'
                ).length

                // Build timeline of submissions and approvals
                const timeline: { date: string; type: 'submitted' | 'approved' }[] = []
                tasks.forEach(t => {
                    if (t.submittedAt) {
                        timeline.push({ date: t.submittedAt.toISOString(), type: 'submitted' })
                    }
                    if (t.approvedAt) {
                        timeline.push({ date: t.approvedAt.toISOString(), type: 'approved' })
                    }
                })
                // Sort by date
                timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

                return {
                    id: push.id,
                    name: push.name,
                    startDate: push.startDate,
                    endDate: push.endDate,
                    status: push.status,
                    total: tasks.length,
                    completed,
                    inReview,
                    inProgress,
                    todo,
                    timeline
                }
            })

            // Calculate totals for the project
            const totalTasks = pushStats.reduce((sum, p) => sum + p.total, 0)
            const totalCompleted = pushStats.reduce((sum, p) => sum + p.completed, 0)
            const totalInReview = pushStats.reduce((sum, p) => sum + p.inReview, 0)

            return {
                id: project.id,
                name: project.name,
                color: project.color,
                totalTasks,
                totalCompleted,
                totalInReview,
                completionRate: totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0,
                pushes: pushStats
            }
        })

        return NextResponse.json(projectActivity)
    } catch (error) {
        console.error('Failed to fetch project activity:', error)
        return NextResponse.json({ error: 'Failed to fetch project activity' }, { status: 500 })
    }
}
