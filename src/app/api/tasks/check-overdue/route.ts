import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function POST(request: Request) {
    try {
        const cronSecret = process.env.CRON_SECRET
        if (cronSecret) {
            const authHeader = request.headers.get('authorization')
            const headerSecret = request.headers.get('x-cron-secret')
            const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

            if (token !== cronSecret && headerSecret !== cronSecret) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
            }
        } else if (process.env.NODE_ENV === 'production') {
            return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 })
        }

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
