import prisma from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getCurrentUser } from '@/lib/auth'
import Link from "next/link"
import {
    Clock, AlertCircle,
    FileText, Activity, Calendar
} from "lucide-react"
import { ProjectTimeline } from "@/components/dashboard/ProjectTimeline"
import { MemberStats } from "@/components/dashboard/MemberStats"
import { ActivityLogList } from "@/components/ActivityLogList"
import { PendingReviewTask } from "@/components/PendingReviewTask"
import { MyTaskCard } from "@/components/MyTaskCard"

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
    const user = await getCurrentUser()

    if (!user || !user.id || user.id === 'pending') {
        return <div className="p-4">Please complete your profile setup.</div>
    }

    const dbUser = await prisma.user.findUnique({
        where: { id: user.id }
    })

    if (!dbUser) return <div className="p-4">User not found. Please log in again.</div>

    const isAdmin = user.role === 'Admin'
    const isTeamLead = user.role === 'Team Lead'
    const isMember = user.role === 'Member'

    // --- OPTIMIZATION START ---
    // Parallelize all independent fetches

    // 1. Fetch My Tasks (User's assigned tasks)
    const fetchMyTasks = async () => {
        let myTasksWhere: any = {
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
            const assignedProjectIds = memberProjects.map(pm => pm.projectId)

            if (assignedProjectIds.length > 0) {
                myTasksWhere.column = {
                    board: {
                        projectId: { in: assignedProjectIds }
                    }
                }
            } else {
                myTasksWhere = { id: 'none' }
            }
        }

        return prisma.task.findMany({
            where: myTasksWhere,
            include: {
                assignee: { select: { id: true, name: true } },
                assignees: { include: { user: { select: { id: true, name: true } } } },
                column: {
                    include: {
                        board: {
                            include: { project: { select: { id: true, name: true } } }
                        }
                    }
                }
            },
            orderBy: { updatedAt: 'desc' }
        })
    }

    // 2. Fetch Pending Review Tasks (Admin/Team Lead only)
    const fetchPendingReviews = async () => {
        if (user.role !== 'Admin' && user.role !== 'Team Lead') return []

        const where = user.role === 'Admin'
            ? { column: { name: 'Review', board: { project: { workspaceId: dbUser.workspaceId } } } }
            : { column: { name: 'Review', board: { project: { is: { leadId: dbUser.id } } } } }

        const tasks = await prisma.task.findMany({
            where,
            include: {
                assignee: { select: { id: true, name: true } },
                column: { include: { board: { include: { project: { select: { id: true, name: true } } } } } }
            },
            orderBy: { createdAt: 'desc' },
            take: 10
        })

        // Enrich with review log date 
        // (Optimization: Do this in parallel for the 10 items)
        return Promise.all(tasks.map(async (task) => {
            const reviewLog = await prisma.activityLog.findFirst({
                where: { taskId: task.id, field: 'status', newValue: 'Review' },
                orderBy: { createdAt: 'desc' },
                select: { createdAt: true }
            })
            return {
                ...task,
                reviewSince: reviewLog?.createdAt || null,
            }
        }))
    }

    // 3. Fetch Activity Logs (Admin & Team Lead)
    const fetchActivityLogs = async () => {
        if (user.role !== 'Admin' && user.role !== 'Team Lead') return []
        return prisma.activityLog.findMany({
            where: { task: { column: { board: { project: { workspaceId: dbUser.workspaceId } } } } },
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: {
                task: {
                    include: {
                        column: {
                            include: {
                                board: { include: { project: { select: { id: true, name: true } } } }
                            }
                        }
                    }
                }
            }
        })
    }

    // 4. Fetch Timeline Data (Gantt)
    const fetchTimelineData = async () => {
        // Now treating Team Lead same as Admin for fetching logic
        if (!isAdmin && !isTeamLead && !isMember) return []

        let where: any = {
            startDate: { not: null },
            endDate: { not: null },
        }

        if (isAdmin || isTeamLead) {
            where.column = { board: { project: { workspaceId: dbUser.workspaceId } } }
        } else if (isMember) {
            const memberProjects = await prisma.projectMember.findMany({
                where: { userId: dbUser.id },
                select: { projectId: true }
            })
            const assignedProjectIds = memberProjects.map(pm => pm.projectId)
            if (assignedProjectIds.length === 0) return []

            where = {
                ...where,
                OR: [
                    { assigneeId: dbUser.id },
                    { assignees: { some: { userId: dbUser.id } } }
                ],
                column: { board: { projectId: { in: assignedProjectIds } } }
            }
        }

        return prisma.task.findMany({
            where,
            include: {
                column: { include: { board: { include: { project: { select: { id: true, name: true } } } } } },
                push: { select: { id: true, name: true, color: true } }
            },
            orderBy: { startDate: 'asc' },
            take: 50 // Same limit as before
        })
    }

    // 5. Fetch Member Stats (Admin & Team Lead) - OPTIMIZED
    const fetchMemberStats = async () => {
        if (!isAdmin && !isTeamLead) return []

        // Parallel fetch users and lightweight task data
        const [allUsers, allTasksLight] = await Promise.all([
            prisma.user.findMany({
                where: { workspaceId: dbUser.workspaceId },
                select: { id: true, name: true, avatar: true, role: true }
            }),
            prisma.task.findMany({
                where: { column: { board: { project: { workspaceId: dbUser.workspaceId } } } },
                select: {
                    assigneeId: true,
                    assignees: { select: { user: { select: { id: true } } } },
                    column: { select: { name: true } }
                }
            })
        ])

        return allUsers.map(user => {
            // Filter in memory from lightweight dataset
            const userTasks = allTasksLight.filter(t =>
                t.assignees.some(ta => ta.user.id === user.id) ||
                t.assigneeId === user.id
            )
            const completed = userTasks.filter(t => t.column?.name === 'Done').length
            const inProgress = userTasks.filter(t => t.column?.name === 'In Progress' || t.column?.name === 'Review').length
            const todo = userTasks.filter(t => t.column?.name && ['Todo', 'To Do'].includes(t.column.name)).length

            return {
                userId: user.id,
                userName: user.name,
                userAvatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null,
                role: user.role,
                completedTasks: completed,
                inProgressTasks: inProgress,
                todoTasks: todo,
                totalTasks: userTasks.length
            }
        })
    }

    // EXECUTE ALL FETCHES IN PARALLEL
    const [
        myTasks,
        pendingReviewTasksWithDetails,
        activityLogs,
        allTasksWithDates,
        memberStats
    ] = await Promise.all([
        fetchMyTasks(),
        fetchPendingReviews(),
        fetchActivityLogs(),
        fetchTimelineData(),
        fetchMemberStats()
    ])

    // Post-processing
    const pendingTasks = myTasks.filter(t => t.column?.name !== 'Done' && t.column?.name !== 'Review')
    const overdueTasks = pendingTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date()).length

    const formatTimeAgo = (date: Date) => {
        const diff = new Date().getTime() - new Date(date).getTime()
        const minutes = Math.floor(diff / 60000)
        const hours = Math.floor(minutes / 60)
        const days = Math.floor(hours / 24)
        if (days > 0) return `${days}d`
        if (hours > 0) return `${hours}h`
        return `${minutes}m`
    }

    // Transform tasks for MiniGanttChart / ProjectTimeline
    const ganttTasks = allTasksWithDates.map(t => ({
        id: t.id,
        title: t.title,
        startDate: t.startDate,
        endDate: t.endDate,
        column: t.column ? { name: t.column.name } : null,
        project: t.column?.board?.project || null,
        push: t.push || null
    }))

    return (
        <div className="h-full flex flex-col p-4 gap-4">
            {/* Header - only show if there are overdue tasks */}
            {overdueTasks > 0 && (
                <div className="flex items-center justify-end shrink-0">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1 text-red-500">
                            <AlertCircle className="h-4 w-4" />{overdueTasks} overdue
                        </span>
                    </div>
                </div>
            )}

            {/* Main Content - Mobile: stack, Desktop: grid - NO HORIZONTAL SCROLL */}
            <div className="flex-1 min-h-0 flex flex-col lg:grid gap-4 lg:grid-cols-12 overflow-y-auto overflow-x-hidden">
                {/* 1. My Tasks */}
                <Card className={`flex flex-col min-h-[300px] lg:min-h-0 ${isAdmin || isTeamLead ? 'lg:col-span-6 2xl:col-span-3' : 'lg:col-span-6'}`}>
                    <CardHeader className="pb-2 px-4 pt-4 shrink-0">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <FileText className="h-4 w-4" />My Tasks
                            </CardTitle>
                            <Badge variant="outline">{pendingTasks.length}</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-0 px-2 pb-4 overflow-hidden">
                        <ScrollArea className="h-full max-h-[400px] lg:max-h-none">
                            <div className="space-y-2 px-2 pb-2">
                                {pendingTasks.slice(0, 15).map(task => (
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
                                {pendingTasks.length === 0 && (
                                    <p className="text-xs text-muted-foreground text-center py-4">No pending tasks</p>
                                )}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>

                {/* 2. Admin & Team Lead: Pending Reviews */}
                {(isAdmin || isTeamLead) && (
                    <Card className="lg:col-span-6 2xl:col-span-3 flex flex-col min-h-[250px] lg:min-h-0 overflow-hidden">
                        <CardHeader className="pb-2 px-4 pt-4 shrink-0">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <Clock className="h-4 w-4" />Pending Review
                                </CardTitle>
                                <Badge variant="secondary">{pendingReviewTasksWithDetails.length}</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 min-h-0 p-3 pt-0 overflow-hidden">
                            <ScrollArea className="h-full max-h-[300px] lg:max-h-none">
                                <div className="flex flex-col gap-2">
                                    {pendingReviewTasksWithDetails.length > 0 ? (
                                        pendingReviewTasksWithDetails.map(task => (
                                            <PendingReviewTask key={task.id} task={task} />
                                        ))
                                    ) : (
                                        <div className="text-xs text-muted-foreground text-center py-4">
                                            Nothing to review
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                )}

                {/* 3. Admin & Team Lead: Activity Log */}
                {(isAdmin || isTeamLead) && (
                    <Card className="lg:col-span-6 2xl:col-span-3 flex flex-col min-h-[250px] lg:min-h-0">
                        <CardHeader className="pb-2 px-4 pt-4 shrink-0">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Activity className="h-4 w-4" />Activity Log
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 min-h-0 px-2 pb-2">
                            <ActivityLogList logs={activityLogs} />
                        </CardContent>
                    </Card>
                )}

                {/* 4. Admin & Team Lead: Metrics */}
                {(isAdmin || isTeamLead) && (
                    <Card className="lg:col-span-6 2xl:col-span-3 flex flex-col min-h-[300px] lg:min-h-0">
                        <CardHeader className="pb-2 px-4 pt-4 shrink-0">
                            <CardTitle className="text-sm flex items-center gap-2">
                                Activity Overview
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 min-h-0 p-0">
                            <ScrollArea className="h-full max-h-[400px] lg:max-h-none">
                                <div className="p-4 space-y-6">
                                    <ProjectTimeline tasks={ganttTasks} />
                                    <div className="pt-2 border-t">
                                        <MemberStats stats={memberStats} />
                                    </div>
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                )}

                {/* Member Timeline */}
                {isMember && (
                    <Card className="lg:col-span-6 flex flex-col min-h-[300px] lg:min-h-0">
                        <CardHeader className="pb-2 px-4 pt-4 shrink-0">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Calendar className="h-4 w-4" />My Timeline
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 min-h-0 px-2 pb-2">
                            <ScrollArea className="h-full max-h-[400px] lg:max-h-none">
                                <ProjectTimeline tasks={ganttTasks} />
                            </ScrollArea>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    )
}
