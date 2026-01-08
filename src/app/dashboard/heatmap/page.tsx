import prisma from "@/lib/prisma"
import { getCurrentUser } from '@/lib/auth'
import { redirect } from "next/navigation"
import { HeatmapView } from "./HeatmapView"

export const dynamic = 'force-dynamic'

export default async function HeatmapPage() {
    const user = await getCurrentUser()

    if (!user || !user.id || user.id === 'pending') {
        return <div className="p-6 text-muted-foreground">Please complete your profile setup.</div>
    }

    // Only admins and team leads can view the heatmap
    if (user.role !== 'Admin' && user.role !== 'Team Lead') {
        redirect('/dashboard')
    }

    const dbUser = await prisma.user.findUnique({
        where: { id: user.id }
    })

    if (!dbUser?.workspaceId) {
        return <div className="p-6 text-muted-foreground">Workspace not found.</div>
    }

    // Fetch all users in the workspace
    const users = await prisma.user.findMany({
        where: { workspaceId: dbUser.workspaceId },
        select: {
            id: true,
            name: true,
            avatar: true,
            role: true
        },
        orderBy: { name: 'asc' }
    })

    // Fetch all tasks in the workspace with full details
    const tasks = await prisma.task.findMany({
        where: {
            column: {
                board: {
                    project: {
                        workspaceId: dbUser.workspaceId
                    }
                }
            }
        },
        include: {
            assignee: { select: { id: true, name: true } },
            assignees: {
                include: { user: { select: { id: true, name: true } } }
            },
            column: {
                include: {
                    board: {
                        include: {
                            project: {
                                select: {
                                    id: true,
                                    name: true,
                                    color: true,
                                    leadId: true
                                }
                            }
                        }
                    }
                }
            },
            push: {
                select: { id: true, name: true, color: true }
            },
            helpRequests: {
                where: { status: { in: ['open', 'acknowledged'] } },
                select: { id: true, status: true, createdAt: true }
            },
            checklistItems: {
                select: { id: true, completed: true }
            },
            activityLogs: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { createdAt: true, action: true }
            }
        }
    })

    // Fetch all projects
    const projects = await prisma.project.findMany({
        where: { workspaceId: dbUser.workspaceId },
        select: {
            id: true,
            name: true,
            color: true,
            leadId: true,
            lead: { select: { name: true } }
        }
    })

    // Transform data for the client
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

    const transformedTasks = tasks.map(task => {
        const allAssigneeIds = [
            task.assigneeId,
            ...task.assignees.map(a => a.user.id)
        ].filter(Boolean) as string[]

        const uniqueAssigneeIds = [...new Set(allAssigneeIds)]
        const lastActivity = task.activityLogs[0]?.createdAt
        const daysSinceActivity = lastActivity
            ? Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
            : null

        const dueDate = task.dueDate || task.endDate
        const isOverdue = dueDate ? new Date(dueDate) < now : false
        const daysUntilDue = dueDate
            ? Math.ceil((new Date(dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            : null

        // Bottleneck detection
        const isStuck = task.column?.name === 'In Progress' && daysSinceActivity !== null && daysSinceActivity >= 3
        const isBlockedByHelp = task.helpRequests.length > 0
        const isUnassigned = uniqueAssigneeIds.length === 0 && task.column?.name !== 'Done'
        const isOverloaded = false // Will be calculated per user

        return {
            id: task.id,
            title: task.title,
            columnName: task.column?.name || 'Unknown',
            columnId: task.columnId,
            projectId: task.column?.board?.project?.id || '',
            projectName: task.column?.board?.project?.name || '',
            projectColor: task.column?.board?.project?.color || '#6b7280',
            pushId: task.push?.id || null,
            pushName: task.push?.name || null,
            assigneeIds: uniqueAssigneeIds,
            dueDate: dueDate?.toISOString() || null,
            isOverdue,
            daysUntilDue,
            daysSinceActivity,
            isStuck,
            isBlockedByHelp,
            isUnassigned,
            helpRequestStatus: task.helpRequests[0]?.status || null,
            checklistTotal: task.checklistItems.length,
            checklistCompleted: task.checklistItems.filter(i => i.completed).length,
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString()
        }
    })

    // Calculate per-user stats
    const userStats = users.map(u => {
        const userTasks = transformedTasks.filter(t => t.assigneeIds.includes(u.id))
        const activeTasks = userTasks.filter(t => t.columnName !== 'Done')
        const overdueTasks = userTasks.filter(t => t.isOverdue && t.columnName !== 'Done')
        const stuckTasks = userTasks.filter(t => t.isStuck)
        const helpRequestTasks = userTasks.filter(t => t.isBlockedByHelp)

        // Workload score (higher = more overloaded)
        // Base: active tasks count
        // +2 per overdue task
        // +1.5 per stuck task
        // +1 per help request
        const workloadScore = activeTasks.length + (overdueTasks.length * 2) + (stuckTasks.length * 1.5) + (helpRequestTasks.length * 1)

        return {
            id: u.id,
            name: u.name,
            avatar: u.avatar,
            role: u.role,
            totalTasks: userTasks.length,
            activeTasks: activeTasks.length,
            todoTasks: userTasks.filter(t => t.columnName === 'To Do').length,
            inProgressTasks: userTasks.filter(t => t.columnName === 'In Progress').length,
            reviewTasks: userTasks.filter(t => t.columnName === 'Review').length,
            doneTasks: userTasks.filter(t => t.columnName === 'Done').length,
            overdueTasks: overdueTasks.length,
            stuckTasks: stuckTasks.length,
            helpRequestTasks: helpRequestTasks.length,
            workloadScore,
            tasks: userTasks
        }
    })

    // Global bottleneck stats
    const bottlenecks = {
        totalOverdue: transformedTasks.filter(t => t.isOverdue && t.columnName !== 'Done').length,
        totalStuck: transformedTasks.filter(t => t.isStuck).length,
        totalUnassigned: transformedTasks.filter(t => t.isUnassigned).length,
        totalHelpRequests: transformedTasks.filter(t => t.isBlockedByHelp).length,
        tasksInReview: transformedTasks.filter(t => t.columnName === 'Review').length,
        overdueThisWeek: transformedTasks.filter(t => {
            if (!t.dueDate || t.columnName === 'Done') return false
            const due = new Date(t.dueDate)
            return due >= sevenDaysAgo && due < now
        }).length
    }

    // Identify critical bottlenecks
    const criticalIssues: { type: string; severity: 'critical' | 'warning' | 'info'; message: string; count: number; tasks: typeof transformedTasks }[] = []

    if (bottlenecks.totalOverdue > 0) {
        criticalIssues.push({
            type: 'overdue',
            severity: 'critical',
            message: `${bottlenecks.totalOverdue} tasks are overdue`,
            count: bottlenecks.totalOverdue,
            tasks: transformedTasks.filter(t => t.isOverdue && t.columnName !== 'Done')
        })
    }

    if (bottlenecks.totalStuck > 0) {
        criticalIssues.push({
            type: 'stuck',
            severity: 'warning',
            message: `${bottlenecks.totalStuck} tasks stuck in progress (no activity for 3+ days)`,
            count: bottlenecks.totalStuck,
            tasks: transformedTasks.filter(t => t.isStuck)
        })
    }

    if (bottlenecks.totalHelpRequests > 0) {
        criticalIssues.push({
            type: 'help',
            severity: 'warning',
            message: `${bottlenecks.totalHelpRequests} tasks need help`,
            count: bottlenecks.totalHelpRequests,
            tasks: transformedTasks.filter(t => t.isBlockedByHelp)
        })
    }

    if (bottlenecks.totalUnassigned > 0) {
        criticalIssues.push({
            type: 'unassigned',
            severity: 'info',
            message: `${bottlenecks.totalUnassigned} tasks are unassigned`,
            count: bottlenecks.totalUnassigned,
            tasks: transformedTasks.filter(t => t.isUnassigned)
        })
    }

    if (bottlenecks.tasksInReview > 5) {
        criticalIssues.push({
            type: 'review_queue',
            severity: 'warning',
            message: `${bottlenecks.tasksInReview} tasks waiting for review`,
            count: bottlenecks.tasksInReview,
            tasks: transformedTasks.filter(t => t.columnName === 'Review')
        })
    }

    // Find overloaded users (workload score > average * 1.5)
    const avgWorkload = userStats.reduce((acc, u) => acc + u.workloadScore, 0) / userStats.length
    const overloadedUsers = userStats.filter(u => u.workloadScore > avgWorkload * 1.5 && u.activeTasks > 3)

    if (overloadedUsers.length > 0) {
        criticalIssues.push({
            type: 'overloaded',
            severity: 'warning',
            message: `${overloadedUsers.length} team members are overloaded`,
            count: overloadedUsers.length,
            tasks: []
        })
    }

    // Find idle users (no active tasks)
    const idleUsers = userStats.filter(u => u.activeTasks === 0)

    return (
        <div className="h-full flex flex-col">
            <HeatmapView
                userStats={userStats}
                bottlenecks={bottlenecks}
                criticalIssues={criticalIssues}
                projects={projects.map(p => ({
                    id: p.id,
                    name: p.name,
                    color: p.color || '#6b7280',
                    leadName: p.lead?.name || null
                }))}
                overloadedUsers={overloadedUsers.map(u => u.id)}
                idleUsers={idleUsers.map(u => u.id)}
                allTasks={transformedTasks}
            />
        </div>
    )
}
