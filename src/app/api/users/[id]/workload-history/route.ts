import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser()
        if (!user || !user.workspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id: targetUserId } = await params

        // Verify target user belongs to same workspace
        const targetUser = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: { workspaceId: true }
        })

        if (!targetUser || targetUser.workspaceId !== user.workspaceId) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        // Get tasks assigned to this user with submittedAt and approvedAt timestamps
        const tasks = await prisma.task.findMany({
            where: {
                OR: [
                    { assigneeId: targetUserId },
                    { assignees: { some: { userId: targetUserId } } }
                ],
                AND: [
                    {
                        OR: [
                            { column: { board: { project: { workspaceId: user.workspaceId } } } },
                            { push: { project: { workspaceId: user.workspaceId } } }
                        ]
                    }
                ]
            },
            select: {
                id: true,
                submittedAt: true,
                approvedAt: true
            }
        })

        // Aggregate by date
        const dateMap = new Map<string, { submitted: number, approved: number }>()

        tasks.forEach(task => {
            if (task.submittedAt) {
                const dateKey = task.submittedAt.toISOString().split('T')[0]
                const existing = dateMap.get(dateKey) || { submitted: 0, approved: 0 }
                existing.submitted++
                dateMap.set(dateKey, existing)
            }
            if (task.approvedAt) {
                const dateKey = task.approvedAt.toISOString().split('T')[0]
                const existing = dateMap.get(dateKey) || { submitted: 0, approved: 0 }
                existing.approved++
                dateMap.set(dateKey, existing)
            }
        })

        // Convert to sorted array
        const history = Array.from(dateMap.entries())
            .map(([date, counts]) => ({
                date,
                submitted: counts.submitted,
                approved: counts.approved
            }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

        return NextResponse.json({ history })
    } catch (error) {
        console.error('Failed to fetch workload history:', error)
        return NextResponse.json({ error: 'Failed to fetch workload history' }, { status: 500 })
    }
}
