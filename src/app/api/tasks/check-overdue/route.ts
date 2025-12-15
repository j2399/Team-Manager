import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

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
