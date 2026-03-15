import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RoleSelect } from "./RoleSelect"
import { ProjectSelect } from "./ProjectSelect"
import { MemberActions } from "./MemberActions"
import { MemberTaskList } from "./MemberTaskList"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { CheckCircle2, Clock, Circle, TrendingUp, AlertCircle, Activity } from "lucide-react"
import { getErrorCode } from "@/lib/errors"

export const dynamic = 'force-dynamic'

export default async function MembersPage() {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        redirect('/')
    }
    if (!currentUser.workspaceId) {
        redirect('/workspaces')
    }

    const workspaceId = currentUser.workspaceId
    const canChangeRoles = currentUser.role === 'Admin' || currentUser.role === 'Team Lead'

    // Fetch workspace members and profile data
    const usersRaw = await prisma.user.findMany({
        where: {
            memberships: {
                some: {
                    workspaceId
                }
            }
        },
        include: {
            memberships: {
                where: {
                    workspaceId
                },
                select: { role: true, name: true }
            },
            projectMemberships: {
                where: {
                    project: { workspaceId }
                },
                include: {
                    project: { select: { id: true, name: true, color: true } }
                }
            }
        },
        orderBy: { name: 'asc' }
    })

    const users = usersRaw.map((user) => {
        const membership = user.memberships[0]
        return {
            ...user,
            name: membership?.name || user.name,
            role: membership?.role || 'Member'
        }
    })

    const userIds = users.map(u => u.id)
    const userIdSet = new Set(userIds)

    // Fetch workspace tasks once and distribute to users by assignment.
    const workspaceTasks = await prisma.task.findMany({
        where: {
            OR: [
                { column: { board: { project: { workspaceId } } } },
                { push: { project: { workspaceId } } }
            ]
        },
        select: {
            id: true,
            title: true,
            description: true,
            dueDate: true,
            endDate: true,
            startDate: true,
            updatedAt: true,
            progress: true,
            enableProgress: true,
            assigneeId: true,
            assignees: { select: { userId: true } },
            column: {
                select: {
                    name: true,
                    board: {
                        select: {
                            project: { select: { id: true, name: true, color: true } }
                        }
                    }
                }
            },
            push: { select: { name: true, color: true } }
        },
        orderBy: { updatedAt: 'desc' }
    }).catch((error: unknown) => {
        if (getErrorCode(error) === 'P2021') {
            console.warn('[MembersPage] Task query failed due to missing table. Returning empty task list.')
            return []
        }
        throw error
    })

    const tasksByUser = new Map<string, typeof workspaceTasks>()
    for (const task of workspaceTasks) {
        const assigneeIds = new Set<string>()
        if (task.assigneeId) assigneeIds.add(task.assigneeId)
        for (const assignee of task.assignees) assigneeIds.add(assignee.userId)

        for (const assigneeId of assigneeIds) {
            if (!userIdSet.has(assigneeId)) continue
            const current = tasksByUser.get(assigneeId) || []
            current.push(task)
            tasksByUser.set(assigneeId, current)
        }
    }

    // Fetch activity logs separately by user ID
    const activityLogs = await prisma.activityLog.findMany({
        where: {
            changedBy: { in: userIds },
            OR: [
                { task: { column: { board: { project: { workspaceId } } } } },
                { task: { push: { project: { workspaceId } } } },
                { task: null }
            ]
        },
        orderBy: { createdAt: 'desc' },
        take: 100, // Get recent logs
        select: {
            id: true,
            action: true,
            field: true,
            taskTitle: true,
            createdAt: true,
            details: true,
            changedBy: true
        }
    }).catch((error: unknown) => {
        if (getErrorCode(error) === 'P2021') {
            console.warn('[MembersPage] Activity log query failed due to missing table. Returning empty activity list.')
            return []
        }
        throw error
    })

    // Group activity logs by user
    const activityByUser = userIds.reduce((acc, id) => {
        acc[id] = activityLogs.filter(log => log.changedBy === id).slice(0, 10)
        return acc
    }, {} as Record<string, typeof activityLogs>)

    const allProjects = await prisma.project.findMany({
        where: { workspaceId },
        select: { id: true, name: true, color: true },
        orderBy: { createdAt: 'desc' }
    })

    // Process user stats
    const userStats = users.map(user => {
        const uniqueTasks = tasksByUser.get(user.id) || []

        const completedTasks = uniqueTasks.filter(t => t.column?.name === 'Done')
        const inProgressTasks = uniqueTasks.filter(t => t.column?.name === 'In Progress')
        const todoTasks = uniqueTasks.filter(t => t.column?.name === 'Todo' || t.column?.name === 'To Do')
        const reviewTasks = uniqueTasks.filter(t => t.column?.name === 'Review')

        // Calculate overdue tasks
        const overdueTasks = uniqueTasks.filter(t => {
            if (t.column?.name === 'Done') return false
            const dueDate = t.dueDate || t.endDate
            if (!dueDate) return false
            return new Date(dueDate) < new Date()
        })

        // Calculate completion rate
        const completionRate = uniqueTasks.length > 0
            ? Math.round((completedTasks.length / uniqueTasks.length) * 100)
            : 0

        // Get recent activity count (last 7 days)
        const userLogs = activityByUser[user.id] || []
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        const recentActivityCount = userLogs.filter(
            log => new Date(log.createdAt) > weekAgo
        ).length

        return {
            ...user,
            tasks: uniqueTasks,
            completedTasks,
            inProgressTasks,
            todoTasks,
            reviewTasks,
            overdueTasks,
            completionRate,
            recentActivityCount,
            totalTasks: uniqueTasks.length,
            activityLogs: userLogs
        }
    })

    // Sort by completion rate, then by total tasks
    const sortedUsers = userStats.sort((a, b) => {
        if (b.completionRate !== a.completionRate) return b.completionRate - a.completionRate
        return b.totalTasks - a.totalTasks
    })

    return (
        <div className="flex flex-col gap-4 md:gap-6 p-4 md:p-6 animate-fade-in-up">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl md:text-2xl font-semibold">Team Members</h1>
                    <Badge variant="secondary" className="text-xs">
                        {users.length} members
                    </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Logged in as:</span>
                    <Badge variant="outline" className="font-medium">
                        {currentUser.name}
                    </Badge>
                </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/20 dark:to-green-900/10 border-green-200/50 dark:border-green-800/30">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-xs font-medium">Total Completed</span>
                        </div>
                        <p className="text-2xl font-bold text-green-800 dark:text-green-300 mt-1">
                            {sortedUsers.reduce((acc, u) => acc + u.completedTasks.length, 0)}
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/20 dark:to-blue-900/10 border-blue-200/50 dark:border-blue-800/30">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                            <Clock className="h-4 w-4" />
                            <span className="text-xs font-medium">In Progress</span>
                        </div>
                        <p className="text-2xl font-bold text-blue-800 dark:text-blue-300 mt-1">
                            {sortedUsers.reduce((acc, u) => acc + u.inProgressTasks.length, 0)}
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/20 dark:to-amber-900/10 border-amber-200/50 dark:border-amber-800/30">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                            <Circle className="h-4 w-4" />
                            <span className="text-xs font-medium">Pending Review</span>
                        </div>
                        <p className="text-2xl font-bold text-amber-800 dark:text-amber-300 mt-1">
                            {sortedUsers.reduce((acc, u) => acc + u.reviewTasks.length, 0)}
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/20 dark:to-red-900/10 border-red-200/50 dark:border-red-800/30">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                            <AlertCircle className="h-4 w-4" />
                            <span className="text-xs font-medium">Overdue</span>
                        </div>
                        <p className="text-2xl font-bold text-red-800 dark:text-red-300 mt-1">
                            {sortedUsers.reduce((acc, u) => acc + u.overdueTasks.length, 0)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Member Cards */}
            <div className="space-y-4">
                {sortedUsers.map((user) => {
                    const isCurrentUser = user.email === currentUser.email
                    const assignedProjectIds = user.projectMemberships.map(pm => pm.project.id)

                    return (
                        <Card key={user.id} className={`overflow-hidden ${isCurrentUser ? 'ring-2 ring-primary/20' : ''}`}>
                            <CardHeader className="pb-3">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-12 w-12">
                                            <AvatarImage src={user.avatar || undefined} />
                                            <AvatarFallback className="text-lg bg-primary/10 text-primary">
                                                {user.name?.charAt(0).toUpperCase() || '?'}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <CardTitle className="text-lg">{user.name}</CardTitle>
                                                {isCurrentUser && <Badge variant="secondary" className="text-xs">You</Badge>}
                                            </div>
                                            <p className="text-sm text-muted-foreground">{user.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <RoleSelect userId={user.id} currentRole={user.role} disabled={!canChangeRoles} />
                                        <ProjectSelect
                                            userId={user.id}
                                            currentProjectIds={assignedProjectIds}
                                            allProjects={allProjects}
                                            disabled={!canChangeRoles}
                                        />
                                        {canChangeRoles && (
                                            <MemberActions
                                                userId={user.id}
                                                isCurrentUser={isCurrentUser}
                                                canRemove={canChangeRoles}
                                            />
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-0">
                                {/* Stats Row */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mb-4">
                                    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                        <div>
                                            <p className="text-lg font-bold">{user.completedTasks.length}</p>
                                            <p className="text-[10px] text-muted-foreground">Completed</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                                        <Clock className="h-4 w-4 text-blue-500" />
                                        <div>
                                            <p className="text-lg font-bold">{user.inProgressTasks.length}</p>
                                            <p className="text-[10px] text-muted-foreground">In Progress</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                                        <Circle className="h-4 w-4 text-gray-500" />
                                        <div>
                                            <p className="text-lg font-bold">{user.todoTasks.length}</p>
                                            <p className="text-[10px] text-muted-foreground">To Do</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                                        <TrendingUp className="h-4 w-4 text-purple-500" />
                                        <div>
                                            <p className="text-lg font-bold">{user.completionRate}%</p>
                                            <p className="text-[10px] text-muted-foreground">Completion</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                                        <AlertCircle className="h-4 w-4 text-red-500" />
                                        <div>
                                            <p className="text-lg font-bold">{user.overdueTasks.length}</p>
                                            <p className="text-[10px] text-muted-foreground">Overdue</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                                        <Activity className="h-4 w-4 text-cyan-500" />
                                        <div>
                                            <p className="text-lg font-bold">{user.recentActivityCount}</p>
                                            <p className="text-[10px] text-muted-foreground">This Week</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Task List */}
                                <MemberTaskList
                                    tasks={user.tasks}
                                    activityLogs={user.activityLogs}
                                    userId={user.id}
                                />
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
