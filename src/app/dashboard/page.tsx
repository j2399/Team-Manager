import prisma from "@/lib/prisma"
import { getCurrentUser } from '@/lib/auth'
import { AlertCircle, Users, CheckCircle2, Circle, Loader2, Clock } from "lucide-react"
import { DashboardClient } from "./DashboardClient"
import { TeamPopup } from "./TeamPopup"
import { TaskRow, ApprovalRow } from "./TaskRow"
import { DashboardHeatmap } from "./DashboardHeatmap"

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
    const user = await getCurrentUser()

    if (!user || !user.id || user.id === 'pending') {
        return <div className="p-6 text-muted-foreground">Please complete your profile setup.</div>
    }

    const dbUser = await prisma.user.findUnique({
        where: { id: user.id }
    })

    if (!dbUser) return <div className="p-6 text-muted-foreground">User not found. Please log in again.</div>

    const isAdmin = user.role === 'Admin'
    const isTeamLead = user.role === 'Team Lead'
    const isLeadership = isAdmin || isTeamLead

    // Parallel data fetching
    const fetchMyTasks = async () => {
        let where: any = {
            OR: [
                { assigneeId: dbUser.id },
                { assignees: { some: { userId: dbUser.id } } }
            ]
        }

        if (user.role === 'Member') {
            const memberProjects = await prisma.projectMember.findMany({
                where: { userId: dbUser.id },
                select: { projectId: true }
            })
            const projectIds = memberProjects.map(pm => pm.projectId)
            if (projectIds.length > 0) {
                where.column = { board: { projectId: { in: projectIds } } }
            } else {
                return []
            }
        }

        return prisma.task.findMany({
            where,
            include: {
                assignee: { select: { id: true, name: true } },
                assignees: { include: { user: { select: { id: true, name: true } } } },
                column: {
                    include: {
                        board: { include: { project: { select: { id: true, name: true, color: true } } } }
                    }
                },
                push: { select: { id: true } },
                _count: { select: { comments: true, attachments: true } }
            },
            orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
            take: 50
        })
    }

    const fetchPendingApproval = async () => {
        if (!isLeadership) return []

        const where = isAdmin
            ? { column: { name: 'Review', board: { project: { workspaceId: dbUser.workspaceId } } } }
            : { column: { name: 'Review', board: { project: { leadId: dbUser.id } } } }

        return prisma.task.findMany({
            where,
            include: {
                assignee: { select: { id: true, name: true } },
                assignees: { include: { user: { select: { id: true, name: true } } } },
                column: { include: { board: { include: { project: { select: { id: true, name: true, color: true } } } } } },
                push: { select: { id: true } },
                _count: { select: { comments: true, attachments: true } }
            },
            orderBy: { updatedAt: 'desc' },
            take: 20
        })
    }

    const fetchTeamStats = async () => {
        if (!isLeadership) return null

        const [users, tasks] = await Promise.all([
            prisma.user.findMany({
                where: { workspaceId: dbUser.workspaceId },
                select: { id: true, name: true, avatar: true }
            }),
            prisma.task.findMany({
                where: { column: { board: { project: { workspaceId: dbUser.workspaceId } } } },
                select: {
                    id: true,
                    title: true,
                    assigneeId: true,
                    assignees: { select: { userId: true } },
                    dueDate: true,
                    endDate: true,
                    column: {
                        select: {
                            name: true,
                            board: { select: { project: { select: { id: true, name: true } } } }
                        }
                    }
                }
            })
        ])

        const stats = users.map(u => {
            const userTasks = tasks.filter(t =>
                t.assigneeId === u.id || t.assignees.some(a => a.userId === u.id)
            )
            return {
                id: u.id,
                name: u.name,
                avatar: u.avatar,
                done: userTasks.filter(t => t.column?.name === 'Done').length,
                inProgress: userTasks.filter(t => t.column?.name === 'In Progress').length,
                review: userTasks.filter(t => t.column?.name === 'Review').length,
                todo: userTasks.filter(t => t.column?.name === 'To Do').length,
                total: userTasks.length,
                tasks: userTasks.map(t => ({
                    id: t.id,
                    title: t.title,
                    columnName: t.column?.name || 'Unknown',
                    projectId: t.column?.board?.project?.id || '',
                    projectName: t.column?.board?.project?.name || '',
                    dueDate: (t.dueDate || t.endDate)?.toISOString() || null
                }))
            }
        }).sort((a, b) => (b.inProgress + b.todo + b.review) - (a.inProgress + a.todo + a.review))

        return { users: stats, totalTasks: tasks.length }
    }

    const fetchRecentActivity = async () => {
        if (!isLeadership) return []

        return prisma.activityLog.findMany({
            where: { task: { column: { board: { project: { workspaceId: dbUser.workspaceId } } } } },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
                id: true,
                action: true,
                field: true,
                oldValue: true,
                newValue: true,
                taskTitle: true,
                changedByName: true,
                createdAt: true,
                task: { select: { id: true, column: { select: { board: { select: { project: { select: { id: true } } } } } } } }
            }
        })
    }

    const fetchHeatmapData = async () => {
        if (!isLeadership) return null

        const [users, tasks] = await Promise.all([
            prisma.user.findMany({
                where: { workspaceId: dbUser.workspaceId },
                select: { id: true, name: true, avatar: true, role: true }
            }),
            prisma.task.findMany({
                where: {
                    column: { board: { project: { workspaceId: dbUser.workspaceId } } }
                },
                include: {
                    assignee: { select: { id: true } },
                    assignees: { select: { userId: true } },
                    column: {
                        include: {
                            board: { include: { project: { select: { id: true, name: true, color: true } } } }
                        }
                    },
                    push: { select: { id: true } },
                    helpRequests: {
                        where: { status: { in: ['open', 'acknowledged'] } },
                        select: { id: true }
                    },
                    activityLogs: {
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        select: { createdAt: true }
                    }
                }
            })
        ])

        const now = new Date()

        // Transform tasks
        const transformedTasks = tasks.map(task => {
            const allAssigneeIds = [
                task.assigneeId,
                ...task.assignees.map(a => a.userId)
            ].filter(Boolean) as string[]
            const uniqueAssigneeIds = [...new Set(allAssigneeIds)]

            const lastActivity = task.activityLogs[0]?.createdAt
            const daysSinceActivity = lastActivity
                ? Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
                : null

            const dueDate = task.dueDate || task.endDate
            const isOverdue = dueDate && task.column?.name !== 'Done' ? new Date(dueDate) < now : false
            const isStuck = task.column?.name === 'In Progress' && daysSinceActivity !== null && daysSinceActivity >= 3
            const isBlockedByHelp = task.helpRequests.length > 0
            const isUnassigned = uniqueAssigneeIds.length === 0 && task.column?.name !== 'Done'

            return {
                id: task.id,
                title: task.title,
                columnName: task.column?.name || 'Unknown',
                projectId: task.column?.board?.project?.id || '',
                projectName: task.column?.board?.project?.name || '',
                projectColor: task.column?.board?.project?.color || '#6b7280',
                pushId: task.push?.id || null,
                assigneeIds: uniqueAssigneeIds,
                isOverdue,
                isStuck,
                isBlockedByHelp,
                isUnassigned
            }
        })

        // User stats with full details
        const userStats = users.map(u => {
            const userTasks = transformedTasks.filter(t => t.assigneeIds.includes(u.id))
            const activeTasks = userTasks.filter(t => t.columnName !== 'Done').length
            const todoTasks = userTasks.filter(t => t.columnName === 'To Do').length
            const inProgressTasks = userTasks.filter(t => t.columnName === 'In Progress').length
            const reviewTasks = userTasks.filter(t => t.columnName === 'Review').length
            const doneTasks = userTasks.filter(t => t.columnName === 'Done').length
            const overdueTasks = userTasks.filter(t => t.isOverdue).length
            const stuckTasks = userTasks.filter(t => t.isStuck).length
            const helpRequestTasks = userTasks.filter(t => t.isBlockedByHelp).length
            const workloadScore = activeTasks + (overdueTasks * 2) + (stuckTasks * 1.5) + (helpRequestTasks * 1)

            return {
                id: u.id,
                name: u.name,
                avatar: u.avatar,
                role: u.role,
                activeTasks,
                todoTasks,
                inProgressTasks,
                reviewTasks,
                doneTasks,
                overdueTasks,
                stuckTasks,
                helpRequestTasks,
                workloadScore,
                tasks: userTasks
            }
        })

        // Critical issues
        const criticalIssues: { type: string; severity: 'critical' | 'warning' | 'info'; message: string; count: number; tasks: typeof transformedTasks }[] = []

        const totalOverdue = transformedTasks.filter(t => t.isOverdue).length
        const totalStuck = transformedTasks.filter(t => t.isStuck).length
        const totalHelpRequests = transformedTasks.filter(t => t.isBlockedByHelp).length
        const totalUnassigned = transformedTasks.filter(t => t.isUnassigned).length

        if (totalOverdue > 0) {
            criticalIssues.push({
                type: 'overdue',
                severity: 'critical',
                message: `${totalOverdue} tasks are overdue`,
                count: totalOverdue,
                tasks: transformedTasks.filter(t => t.isOverdue)
            })
        }

        if (totalStuck > 0) {
            criticalIssues.push({
                type: 'stuck',
                severity: 'warning',
                message: `${totalStuck} tasks stuck (3+ days)`,
                count: totalStuck,
                tasks: transformedTasks.filter(t => t.isStuck)
            })
        }

        if (totalHelpRequests > 0) {
            criticalIssues.push({
                type: 'help',
                severity: 'warning',
                message: `${totalHelpRequests} tasks need help`,
                count: totalHelpRequests,
                tasks: transformedTasks.filter(t => t.isBlockedByHelp)
            })
        }

        if (totalUnassigned > 0) {
            criticalIssues.push({
                type: 'unassigned',
                severity: 'info',
                message: `${totalUnassigned} tasks unassigned`,
                count: totalUnassigned,
                tasks: transformedTasks.filter(t => t.isUnassigned)
            })
        }

        // Find overloaded and idle users
        const avgWorkload = userStats.reduce((acc, u) => acc + u.workloadScore, 0) / userStats.length
        const overloadedUsers = userStats.filter(u => u.workloadScore > avgWorkload * 1.5 && u.activeTasks > 3).map(u => u.id)
        const idleUsers = userStats.filter(u => u.activeTasks === 0).map(u => u.id)

        return { userStats, criticalIssues, overloadedUsers, idleUsers, allTasks: transformedTasks }
    }

    const [myTasks, pendingApproval, teamStats, recentActivity, heatmapData] = await Promise.all([
        fetchMyTasks(),
        fetchPendingApproval(),
        fetchTeamStats(),
        fetchRecentActivity(),
        fetchHeatmapData()
    ])

    // Process tasks
    const pendingTasks = myTasks.filter(t => t.column?.name !== 'Done')
    const overdueTasks = pendingTasks.filter(t => {
        const due = t.dueDate || t.endDate
        return due && new Date(due) < new Date()
    })

    // Group tasks by status for micromanagement view
    const todoTasks = pendingTasks.filter(t => t.column?.name === 'To Do')
    const inProgressTasks = pendingTasks.filter(t => t.column?.name === 'In Progress')
    const reviewTasks = pendingTasks.filter(t => t.column?.name === 'Review')

    // Helper to calculate due text
    const getDueText = (dueDate: Date | null): { text: string; isOverdue: boolean } => {
        if (!dueDate) return { text: '', isOverdue: false }
        const diffMs = new Date(dueDate).getTime() - new Date().getTime()
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
        if (diffMs < 0) {
            const overdueDays = Math.abs(diffDays)
            return { text: overdueDays === 0 ? 'Today' : `${overdueDays}d overdue`, isOverdue: true }
        }
        if (diffDays === 0) return { text: 'Today', isOverdue: false }
        if (diffDays === 1) return { text: 'Tomorrow', isOverdue: false }
        return { text: `${diffDays}d`, isOverdue: false }
    }

    return (
        <div className="h-full overflow-y-auto">
            <div className="p-4 md:p-6 space-y-5 animate-fade-in-up">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-xl font-semibold">Welcome back, {user.name?.split(' ')[0]}</h1>
                        {/* Stats right next to name */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <Circle className="h-3 w-3" />
                                {todoTasks.length}
                            </span>
                            <span className="flex items-center gap-1">
                                <Loader2 className="h-3 w-3" />
                                {inProgressTasks.length}
                            </span>
                            <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {reviewTasks.length}
                            </span>
                        </div>
                    </div>
                    {/* Overdue warning on right */}
                    {overdueTasks.length > 0 && (
                        <span className="text-xs text-red-500 flex items-center gap-1">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {overdueTasks.length} overdue
                        </span>
                    )}
                </div>

                {/* Main Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Left Column - Tasks */}
                    <div className="lg:col-span-2 space-y-5">
                        {/* My Tasks - Detailed View */}
                        <section className="border border-border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-sm font-medium">My Tasks</h2>
                                <span className="text-xs text-muted-foreground">{pendingTasks.length} pending</span>
                            </div>

                            {pendingTasks.length > 0 ? (
                                <div className="space-y-2">
                                    {pendingTasks.slice(0, 12).map(task => {
                                        const project = task.column?.board?.project
                                        const projectColor = project?.color || '#6b7280'
                                        const dueDate = task.dueDate || task.endDate
                                        const { text: dueText, isOverdue } = getDueText(dueDate)

                                        return (
                                            <TaskRow
                                                key={task.id}
                                                task={{
                                                    id: task.id,
                                                    title: task.title,
                                                    columnName: task.column?.name || 'Unknown',
                                                    projectId: project?.id || '',
                                                    projectName: project?.name || '',
                                                    projectColor,
                                                    pushId: task.push?.id || null,
                                                    dueText,
                                                    isOverdue,
                                                    commentsCount: task._count.comments,
                                                    attachmentsCount: task._count.attachments
                                                }}
                                            />
                                        )
                                    })}

                                    {pendingTasks.length > 12 && (
                                        <p className="text-xs text-muted-foreground text-center pt-2">
                                            +{pendingTasks.length - 12} more tasks
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-8">No pending tasks</p>
                            )}
                        </section>

                        {/* Pending Approval - Leadership Only */}
                        {isLeadership && (
                            <section className="border border-border rounded-lg p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-sm font-medium">Pending Approval</h2>
                                    <span className="text-xs text-muted-foreground">{pendingApproval.length} waiting</span>
                                </div>

                                {pendingApproval.length > 0 ? (
                                    <div className="space-y-2">
                                        {pendingApproval.map(task => {
                                            const project = task.column?.board?.project
                                            const projectColor = project?.color || '#6b7280'
                                            const assignees = task.assignees?.map(a => a.user.name) || []
                                            const assignee = task.assignee?.name
                                            const assignedTo = assignees.length > 0 ? assignees : (assignee ? [assignee] : [])

                                            return (
                                                <ApprovalRow
                                                    key={task.id}
                                                    task={{
                                                        id: task.id,
                                                        title: task.title,
                                                        projectId: project?.id || '',
                                                        projectName: project?.name || '',
                                                        projectColor,
                                                        pushId: task.push?.id || null,
                                                        assignedTo,
                                                        commentsCount: task._count.comments,
                                                        attachmentsCount: task._count.attachments
                                                    }}
                                                />
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground text-center py-6">No tasks pending approval</p>
                                )}
                            </section>
                        )}

                        {/* Team Heatmap - Leadership Only */}
                        {isLeadership && heatmapData && (
                            <DashboardHeatmap
                                userStats={heatmapData.userStats}
                                criticalIssues={heatmapData.criticalIssues}
                                overloadedUsers={heatmapData.overloadedUsers}
                                idleUsers={heatmapData.idleUsers}
                                allTasks={heatmapData.allTasks}
                            />
                        )}
                    </div>

                    {/* Right Column - Leadership Only */}
                    {isLeadership && (
                        <div className="space-y-5">
                            {/* Team Overview */}
                            {teamStats && (
                                <section className="border border-border rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-sm font-medium flex items-center gap-1.5">
                                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                            Team
                                        </h2>
                                        <TeamPopup members={teamStats.users} totalTasks={teamStats.totalTasks}>
                                            <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                                                View details
                                            </button>
                                        </TeamPopup>
                                    </div>
                                    <div className="space-y-1">
                                        {teamStats.users.slice(0, 6).map(member => {
                                            const activeTasks = member.todo + member.inProgress + member.review
                                            return (
                                                <TeamPopup key={member.id} members={teamStats.users} totalTasks={teamStats.totalTasks}>
                                                    <button className="w-full flex items-center justify-between p-2 rounded-md hover:bg-muted/30 transition-colors text-left">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">
                                                                {member.name.charAt(0).toUpperCase()}
                                                            </div>
                                                            <span className="text-sm truncate">{member.name}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
                                                            <span>{activeTasks} active</span>
                                                            <span>{member.done} done</span>
                                                        </div>
                                                    </button>
                                                </TeamPopup>
                                            )
                                        })}
                                        {teamStats.users.length > 6 && (
                                            <TeamPopup members={teamStats.users} totalTasks={teamStats.totalTasks}>
                                                <button className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-2">
                                                    +{teamStats.users.length - 6} more members
                                                </button>
                                            </TeamPopup>
                                        )}
                                    </div>
                                </section>
                            )}

                            {/* Recent Activity */}
                            {recentActivity.length > 0 && (
                                <section className="border border-border rounded-lg p-4">
                                    <h2 className="text-sm font-medium mb-4">Recent Activity</h2>
                                    <div className="space-y-1">
                                        {recentActivity.map(log => (
                                            <DashboardClient
                                                key={log.id}
                                                activity={log}
                                            />
                                        ))}
                                    </div>
                                </section>
                            )}
                        </div>
                    )}

                    {/* Member View - Show something when no tasks */}
                    {!isLeadership && pendingTasks.length === 0 && (
                        <div className="lg:col-span-1">
                            <section className="border border-border rounded-lg p-4">
                                <h2 className="text-sm font-medium mb-3">No Tasks Assigned</h2>
                                <p className="text-xs text-muted-foreground">
                                    You have no pending tasks. Check with your team lead for new assignments.
                                </p>
                            </section>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
