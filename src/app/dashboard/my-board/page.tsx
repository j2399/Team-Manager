import prisma from "@/lib/prisma"
import { getCurrentUser } from '@/lib/auth'
import { PersonalKanban } from "./PersonalKanban"

export const dynamic = 'force-dynamic'

export default async function MyBoardPage() {
    const user = await getCurrentUser()

    if (!user || !user.id || user.id === 'pending') {
        return <div className="p-6 text-muted-foreground">Please complete your profile setup.</div>
    }

    const dbUser = await prisma.user.findUnique({
        where: { id: user.id }
    })

    if (!dbUser) {
        return <div className="p-6 text-muted-foreground">User not found.</div>
    }

    // Fetch all tasks assigned to this user across all projects
    const tasks = await prisma.task.findMany({
        where: {
            OR: [
                { assigneeId: dbUser.id },
                { assignees: { some: { userId: dbUser.id } } }
            ]
        },
        include: {
            column: {
                include: {
                    board: {
                        include: {
                            project: {
                                select: {
                                    id: true,
                                    name: true,
                                    color: true
                                }
                            }
                        }
                    }
                }
            },
            push: {
                select: {
                    id: true,
                    name: true,
                    color: true
                }
            },
            assignee: {
                select: { id: true, name: true }
            },
            assignees: {
                include: {
                    user: { select: { id: true, name: true } }
                }
            },
            checklistItems: {
                select: {
                    id: true,
                    completed: true
                }
            },
            helpRequests: {
                where: {
                    status: { in: ['open', 'acknowledged'] }
                },
                select: {
                    id: true,
                    status: true
                }
            },
            _count: {
                select: {
                    comments: true,
                    attachments: true
                }
            }
        },
        orderBy: [
            { dueDate: 'asc' },
            { updatedAt: 'desc' }
        ]
    })

    // Transform tasks for the client component
    const transformedTasks = tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        columnName: task.column?.name || 'Unknown',
        columnId: task.columnId,
        projectId: task.column?.board?.project?.id || '',
        projectName: task.column?.board?.project?.name || '',
        projectColor: task.column?.board?.project?.color || '#6b7280',
        pushId: task.push?.id || null,
        pushName: task.push?.name || null,
        pushColor: task.push?.color || null,
        dueDate: task.dueDate?.toISOString() || task.endDate?.toISOString() || null,
        startDate: task.startDate?.toISOString() || null,
        endDate: task.endDate?.toISOString() || null,
        progress: task.progress,
        enableProgress: task.enableProgress,
        commentsCount: task._count.comments,
        attachmentsCount: task._count.attachments,
        checklistTotal: task.checklistItems.length,
        checklistCompleted: task.checklistItems.filter(i => i.completed).length,
        hasHelpRequest: task.helpRequests.length > 0,
        helpRequestStatus: task.helpRequests[0]?.status || null,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString()
    }))

    // Group by status
    const columns = [
        { id: 'todo', name: 'To Do', tasks: transformedTasks.filter(t => t.columnName === 'To Do') },
        { id: 'inprogress', name: 'In Progress', tasks: transformedTasks.filter(t => t.columnName === 'In Progress') },
        { id: 'review', name: 'Review', tasks: transformedTasks.filter(t => t.columnName === 'Review') },
        { id: 'done', name: 'Done', tasks: transformedTasks.filter(t => t.columnName === 'Done') }
    ]

    // Get unique projects for filtering
    const projects = [...new Map(
        transformedTasks
            .filter(t => t.projectId)
            .map(t => [t.projectId, { id: t.projectId, name: t.projectName, color: t.projectColor }])
    ).values()]

    return (
        <div className="h-full flex flex-col">
            <PersonalKanban
                columns={columns}
                projects={projects}
                userName={user.name?.split(' ')[0] || 'User'}
            />
        </div>
    )
}
