import prisma from "@/lib/prisma"
import { getCurrentUser } from '@/lib/auth'
import Link from "next/link"
import { AlertCircle, ChevronRight, Users, FolderKanban } from "lucide-react"
import { MyTaskCard } from "@/components/MyTaskCard"
import { DashboardClient } from "./DashboardClient"

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
                }
            },
            orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
            take: 50
        })
    }

    const fetchReviewTasks = async () => {
        if (!isLeadership) return []

        const where = isAdmin
            ? { column: { name: 'Review', board: { project: { workspaceId: dbUser.workspaceId } } } }
            : { column: { name: 'Review', board: { project: { leadId: dbUser.id } } } }

        return prisma.task.findMany({
            where,
            include: {
                assignee: { select: { id: true, name: true } },
                column: { include: { board: { include: { project: { select: { id: true, name: true, color: true } } } } } }
            },
            orderBy: { updatedAt: 'desc' },
            take: 10
        })
    }

    const fetchProjects = async () => {
        if (isAdmin) {
            return prisma.project.findMany({
                where: { workspaceId: dbUser.workspaceId },
                include: {
                    _count: { select: { boards: true } },
                    boards: {
                        include: {
                            columns: {
                                include: { _count: { select: { tasks: true } } }
                            }
                        }
                    }
                },
                orderBy: { updatedAt: 'desc' },
                take: 6
            })
        } else if (isTeamLead) {
            return prisma.project.findMany({
                where: { leadId: dbUser.id },
                include: {
                    _count: { select: { boards: true } },
                    boards: {
                        include: {
                            columns: {
                                include: { _count: { select: { tasks: true } } }
                            }
                        }
                    }
                },
                orderBy: { updatedAt: 'desc' },
                take: 6
            })
        } else {
            const memberships = await prisma.projectMember.findMany({
                where: { userId: dbUser.id },
                include: {
                    project: {
                        include: {
                            _count: { select: { boards: true } },
                            boards: {
                                include: {
                                    columns: {
                                        include: { _count: { select: { tasks: true } } }
                                    }
                                }
                            }
                        }
                    }
                }
            })
            return memberships.map(m => m.project)
        }
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
                    assigneeId: true,
                    assignees: { select: { userId: true } },
                    column: { select: { name: true } }
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
                total: userTasks.length
            }
        }).sort((a, b) => b.done - a.done)

        return { users: stats, totalTasks: tasks.length }
    }

    const fetchRecentActivity = async () => {
        if (!isLeadership) return []

        return prisma.activityLog.findMany({
            where: { task: { column: { board: { project: { workspaceId: dbUser.workspaceId } } } } },
            orderBy: { createdAt: 'desc' },
            take: 8,
            select: {
                id: true,
                action: true,
                field: true,
                taskTitle: true,
                changedByName: true,
                createdAt: true,
                task: { select: { id: true, column: { select: { board: { select: { project: { select: { id: true } } } } } } } }
            }
        })
    }

    const [myTasks, reviewTasks, projects, teamStats, recentActivity] = await Promise.all([
        fetchMyTasks(),
        fetchReviewTasks(),
        fetchProjects(),
        fetchTeamStats(),
        fetchRecentActivity()
    ])

    // Process tasks
    const pendingTasks = myTasks.filter(t => t.column?.name !== 'Done')
    const overdueTasks = pendingTasks.filter(t => {
        const due = t.dueDate || t.endDate
        return due && new Date(due) < new Date()
    })

    // Calculate project stats
    const projectsWithStats = projects.map(p => {
        const totalTasks = p.boards.reduce((acc, b) =>
            acc + b.columns.reduce((colAcc, c) => colAcc + c._count.tasks, 0), 0)
        const doneTasks = p.boards.reduce((acc, b) =>
            acc + b.columns.filter(c => c.name === 'Done').reduce((colAcc, c) => colAcc + c._count.tasks, 0), 0)
        return { ...p, totalTasks, doneTasks }
    })

    return (
        <div className="h-full overflow-y-auto">
            <div className="p-4 md:p-6 space-y-6 animate-fade-in-up">
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
                </div>

                {/* Main Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - Tasks */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* My Tasks */}
                        <section>
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-sm font-medium text-muted-foreground">My Tasks</h2>
                                <span className="text-xs text-muted-foreground">{pendingTasks.length} pending</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {pendingTasks.slice(0, 8).map(task => (
                                    <MyTaskCard
                                        key={task.id}
                                        task={{
                                            id: task.id,
                                            title: task.title,
                                            description: task.description,
                                            startDate: task.startDate,
                                            endDate: task.endDate,
                                            dueDate: task.dueDate,
                                            assignee: task.assignee,
                                            column: task.column,
                                            createdAt: task.createdAt,
                                            updatedAt: task.updatedAt
                                        }}
                                    />
                                ))}
                            </div>
                            {pendingTasks.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center py-8">No pending tasks</p>
                            )}
                        </section>

                        {/* Review Tasks - Leadership Only */}
                        {isLeadership && reviewTasks.length > 0 && (
                            <section>
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="text-sm font-medium text-muted-foreground">Needs Review</h2>
                                    <span className="text-xs text-muted-foreground">{reviewTasks.length} waiting</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {reviewTasks.slice(0, 4).map(task => {
                                        const project = task.column?.board?.project
                                        const projectColor = project?.color || '#6b7280'
                                        return (
                                            <Link
                                                key={task.id}
                                                href={`/dashboard/projects/${project?.id}?task=${task.id}`}
                                                className="group p-2.5 rounded-md border border-border/60 bg-card hover:border-border hover:shadow-sm active:scale-[0.99] transition-all duration-150"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="text-[13px] font-medium line-clamp-1">{task.title}</p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            {project && (
                                                                <span
                                                                    className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                                                                    style={{ backgroundColor: `${projectColor}12`, color: projectColor }}
                                                                >
                                                                    {project.name}
                                                                </span>
                                                            )}
                                                            {task.assignee && (
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    by {task.assignee.name}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                                </div>
                                            </Link>
                                        )
                                    })}
                                </div>
                            </section>
                        )}

                        {/* Projects */}
                        <section>
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-sm font-medium text-muted-foreground">Projects</h2>
                                <Link href="/dashboard" className="text-xs text-primary hover:underline">View all</Link>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {projectsWithStats.slice(0, 6).map(project => {
                                    const progress = project.totalTasks > 0
                                        ? Math.round((project.doneTasks / project.totalTasks) * 100)
                                        : 0
                                    return (
                                        <Link
                                            key={project.id}
                                            href={`/dashboard/projects/${project.id}`}
                                            className="group p-3 rounded-md border border-border/60 bg-card hover:border-border hover:shadow-sm active:scale-[0.99] transition-all duration-150"
                                        >
                                            <div className="flex items-center gap-2 mb-2">
                                                <div
                                                    className="w-2 h-2 rounded-full shrink-0"
                                                    style={{ backgroundColor: project.color || '#6b7280' }}
                                                />
                                                <span className="text-sm font-medium truncate">{project.name}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                                <span>{project.totalTasks} tasks</span>
                                                <span>{progress}% done</span>
                                            </div>
                                            <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-300"
                                                    style={{
                                                        width: `${progress}%`,
                                                        backgroundColor: project.color || '#6b7280'
                                                    }}
                                                />
                                            </div>
                                        </Link>
                                    )
                                })}
                            </div>
                        </section>
                    </div>

                    {/* Right Column - Leadership Only */}
                    {isLeadership && (
                        <div className="space-y-6">
                            {/* Team Overview */}
                            {teamStats && (
                                <section>
                                    <div className="flex items-center justify-between mb-3">
                                        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                                            <Users className="h-3.5 w-3.5" />
                                            Team
                                        </h2>
                                        <Link href="/dashboard/members" className="text-xs text-primary hover:underline">
                                            View all
                                        </Link>
                                    </div>
                                    <div className="space-y-1">
                                        {teamStats.users.slice(0, 5).map(member => (
                                            <div
                                                key={member.id}
                                                className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors"
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">
                                                        {member.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="text-sm truncate">{member.name}</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
                                                    <span>{member.done} done</span>
                                                    <span>{member.inProgress} active</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Recent Activity */}
                            {recentActivity.length > 0 && (
                                <section>
                                    <h2 className="text-sm font-medium text-muted-foreground mb-3">Recent Activity</h2>
                                    <div className="space-y-0.5">
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

                    {/* Member View - Full Width Projects if no team stats */}
                    {!isLeadership && pendingTasks.length === 0 && (
                        <div className="lg:col-span-1">
                            <section>
                                <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                                    <FolderKanban className="h-3.5 w-3.5" />
                                    Your Projects
                                </h2>
                                <div className="space-y-2">
                                    {projectsWithStats.map(project => (
                                        <Link
                                            key={project.id}
                                            href={`/dashboard/projects/${project.id}`}
                                            className="flex items-center justify-between p-3 rounded-md border border-border/60 bg-card hover:border-border hover:shadow-sm active:scale-[0.99] transition-all duration-150"
                                        >
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="w-2 h-2 rounded-full"
                                                    style={{ backgroundColor: project.color || '#6b7280' }}
                                                />
                                                <span className="text-sm font-medium">{project.name}</span>
                                            </div>
                                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
