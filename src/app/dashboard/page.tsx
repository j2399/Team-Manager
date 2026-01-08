import prisma from "@/lib/prisma"
import { getCurrentUser } from '@/lib/auth'
import Link from "next/link"
import { AlertCircle, ChevronRight, Users, Clock, CheckCircle2, Circle, Loader2 } from "lucide-react"
import { MyTaskCard } from "@/components/MyTaskCard"
import { DashboardClient } from "./DashboardClient"
import { TeamPopup } from "./TeamPopup"

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

    const [myTasks, pendingApproval, teamStats, recentActivity] = await Promise.all([
        fetchMyTasks(),
        fetchPendingApproval(),
        fetchTeamStats(),
        fetchRecentActivity()
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

    return (
        <div className="h-full overflow-y-auto">
            <div className="p-4 md:p-6 space-y-5 animate-fade-in-up">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-semibold">Welcome back, {user.name?.split(' ')[0]}</h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            {pendingTasks.length} tasks pending
                            {overdueTasks.length > 0 && (
                                <span className="text-red-500 ml-2">
                                    <AlertCircle className="inline h-3.5 w-3.5 mr-0.5" />
                                    {overdueTasks.length} overdue
                                </span>
                            )}
                        </p>
                    </div>
                    {/* Quick Stats */}
                    <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Circle className="h-3 w-3" />
                            {todoTasks.length} to do
                        </span>
                        <span className="flex items-center gap-1">
                            <Loader2 className="h-3 w-3" />
                            {inProgressTasks.length} in progress
                        </span>
                        <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {reviewTasks.length} in review
                        </span>
                    </div>
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
                                        const isOverdue = dueDate && new Date(dueDate) < new Date()
                                        const columnName = task.column?.name || 'Unknown'

                                        let dueText = ''
                                        if (dueDate) {
                                            const diffMs = new Date(dueDate).getTime() - new Date().getTime()
                                            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
                                            if (diffMs < 0) {
                                                const overdueDays = Math.abs(diffDays)
                                                dueText = overdueDays === 0 ? 'Today' : `${overdueDays}d overdue`
                                            } else if (diffDays === 0) {
                                                dueText = 'Today'
                                            } else if (diffDays === 1) {
                                                dueText = 'Tomorrow'
                                            } else {
                                                dueText = `${diffDays}d`
                                            }
                                        }

                                        return (
                                            <Link
                                                key={task.id}
                                                href={`/dashboard/projects/${project?.id}?task=${task.id}`}
                                                className="flex items-center justify-between p-3 rounded-md border border-border hover:bg-muted/30 transition-colors group"
                                            >
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                    {/* Status indicator */}
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                                                        {columnName}
                                                    </span>

                                                    {/* Task title */}
                                                    <span className="text-sm truncate">{task.title}</span>

                                                    {/* Project badge - muted color */}
                                                    {project && (
                                                        <span
                                                            className="text-[10px] px-1.5 py-0.5 rounded shrink-0 hidden sm:inline"
                                                            style={{
                                                                backgroundColor: `${projectColor}08`,
                                                                color: `${projectColor}99`
                                                            }}
                                                        >
                                                            {project.name}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-3 shrink-0 ml-2">
                                                    {/* Comments/attachments count */}
                                                    {(task._count.comments > 0 || task._count.attachments > 0) && (
                                                        <span className="text-[10px] text-muted-foreground hidden sm:inline">
                                                            {task._count.comments > 0 && `${task._count.comments} comments`}
                                                            {task._count.comments > 0 && task._count.attachments > 0 && ' · '}
                                                            {task._count.attachments > 0 && `${task._count.attachments} files`}
                                                        </span>
                                                    )}

                                                    {/* Due date */}
                                                    {dueText && (
                                                        <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue ? 'text-red-500' : 'text-muted-foreground'}`}>
                                                            <Clock className="h-2.5 w-2.5" />
                                                            {dueText}
                                                        </span>
                                                    )}

                                                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </div>
                                            </Link>
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
                                                <Link
                                                    key={task.id}
                                                    href={`/dashboard/projects/${project?.id}?task=${task.id}`}
                                                    className="flex items-center justify-between p-3 rounded-md border border-border hover:bg-muted/30 transition-colors group"
                                                >
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        {/* Task title */}
                                                        <span className="text-sm truncate">{task.title}</span>

                                                        {/* Project badge - muted color */}
                                                        {project && (
                                                            <span
                                                                className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                                                                style={{
                                                                    backgroundColor: `${projectColor}08`,
                                                                    color: `${projectColor}99`
                                                                }}
                                                            >
                                                                {project.name}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-3 shrink-0 ml-2">
                                                        {/* Assigned to */}
                                                        {assignedTo.length > 0 && (
                                                            <span className="text-[10px] text-muted-foreground">
                                                                by {assignedTo[0]}{assignedTo.length > 1 && ` +${assignedTo.length - 1}`}
                                                            </span>
                                                        )}

                                                        {/* Comments/attachments */}
                                                        {(task._count.comments > 0 || task._count.attachments > 0) && (
                                                            <span className="text-[10px] text-muted-foreground hidden sm:inline">
                                                                {task._count.comments > 0 && `${task._count.comments}c`}
                                                                {task._count.attachments > 0 && ` ${task._count.attachments}f`}
                                                            </span>
                                                        )}

                                                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    </div>
                                                </Link>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground text-center py-6">No tasks pending approval</p>
                                )}
                            </section>
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
