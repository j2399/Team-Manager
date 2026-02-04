import prisma from "@/lib/prisma"
import { getCurrentUser } from '@/lib/auth'
import { buildWorkloadTasks, computeWorkloadStats, getWorkloadConfig } from '@/lib/workload'
import { AlertCircle, Users, CheckCircle2, Circle, Loader2, Clock, Layout, ChevronRight } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { cn } from "@/lib/utils"
import { DashboardClient } from "./DashboardClient"
import { TeamPopup } from "./TeamPopup"
import { TaskRow, ApprovalRow } from "./TaskRow"
import { DashboardHeatmap } from "./DashboardHeatmap"
import { ProjectActivityTracker } from "./ProjectActivityTracker"
import { DriveUploadWidget } from "./DriveUploadWidget"
import { driveConfigTableExists } from "@/lib/googleDrive"

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
    const workspaceId = dbUser.workspaceId
    if (!workspaceId) {
        redirect('/workspaces')
    }

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
            ? { column: { name: 'Review', board: { project: { workspaceId } } } }
            : { column: { name: 'Review', board: { project: { leadId: dbUser.id } } } }

        return prisma.task.findMany({
            where,
            include: {
                assignee: { select: { id: true, name: true } },
                assignees: { include: { user: { select: { id: true, name: true } } } },
                column: {
                    include: {
                        board: {
                            include: {
                                project: { select: { id: true, name: true, color: true } },
                                columns: { select: { id: true, name: true } }
                            }
                        }
                    }
                },
                push: { select: { id: true } },
                _count: { select: { comments: true, attachments: true } }
            },
            orderBy: { updatedAt: 'desc' },
            take: 20
        })
    }

    const fetchTeamStats = async () => {
        if (!isLeadership) return null

        const [memberships, tasks] = await Promise.all([
            prisma.workspaceMember.findMany({
                where: { workspaceId },
                select: {
                    userId: true,
                    name: true,
                    user: { select: { name: true, avatar: true } }
                }
            }),
            prisma.task.findMany({
                where: { column: { board: { project: { workspaceId } } } },
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

        const users = memberships.map((member) => ({
            id: member.userId,
            name: member.name || member.user.name,
            avatar: member.user.avatar
        }))

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
            where: { task: { column: { board: { project: { workspaceId } } } } },
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

        const [config, memberships, tasks] = await Promise.all([
            getWorkloadConfig(workspaceId),
            prisma.workspaceMember.findMany({
                where: { workspaceId },
                select: {
                    userId: true,
                    name: true,
                    role: true,
                    user: { select: { name: true, avatar: true } }
                }
            }),
            prisma.task.findMany({
                where: {
                    column: { board: { project: { workspaceId } } }
                },
                include: {
                    assignee: { select: { id: true } },
                    assignees: { select: { userId: true } },
                    column: {
                        include: {
                            board: { include: { project: { select: { id: true, name: true, color: true } } } }
                        }
                    },
                    push: { select: { id: true, name: true } },
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

        const users = memberships.map((member) => ({
            id: member.userId,
            name: member.name || member.user.name,
            avatar: member.user.avatar,
            role: member.role
        }))

        const now = new Date()
        const workloadTasks = buildWorkloadTasks(tasks, now, config)
        const { userStats, overloadedUsers, idleUsers } = computeWorkloadStats(users, workloadTasks, config, now)

        // Critical issues
        const criticalIssues: { type: string; severity: 'critical' | 'warning' | 'info'; message: string; count: number; tasks: typeof workloadTasks }[] = []

        const totalOverdue = workloadTasks.filter(t => t.isOverdue).length
        const totalStuck = workloadTasks.filter(t => t.isStuck).length
        const totalHelpRequests = workloadTasks.filter(t => t.isBlockedByHelp).length
        const totalUnassigned = workloadTasks.filter(t => t.isUnassigned).length

        if (totalOverdue > 0) {
            criticalIssues.push({
                type: 'overdue',
                severity: 'critical',
                message: `${totalOverdue} tasks are overdue`,
                count: totalOverdue,
                tasks: workloadTasks.filter(t => t.isOverdue)
            })
        }

        if (totalStuck > 0) {
            criticalIssues.push({
                type: 'stuck',
                severity: 'warning',
                message: `${totalStuck} tasks stuck (${config.thresholds.stuckDays}+ days)`,
                count: totalStuck,
                tasks: workloadTasks.filter(t => t.isStuck)
            })
        }

        if (totalHelpRequests > 0) {
            criticalIssues.push({
                type: 'help',
                severity: 'warning',
                message: `${totalHelpRequests} tasks need help`,
                count: totalHelpRequests,
                tasks: workloadTasks.filter(t => t.isBlockedByHelp)
            })
        }

        if (totalUnassigned > 0) {
            criticalIssues.push({
                type: 'unassigned',
                severity: 'info',
                message: `${totalUnassigned} tasks unassigned`,
                count: totalUnassigned,
                tasks: workloadTasks.filter(t => t.isUnassigned)
            })
        }

        return { userStats, criticalIssues, overloadedUsers, idleUsers, allTasks: workloadTasks }
    }

    const fetchProjects = async () => {
        return prisma.project.findMany({
            where: { workspaceId },
            select: {
                id: true,
                name: true,
                color: true,
                pushes: {
                    where: { status: 'Active' },
                    select: {
                        id: true,
                        name: true,
                        color: true
                    }
                },
                boards: {
                    select: {
                        id: true,
                        columns: {
                            select: { id: true, name: true },
                            orderBy: { order: 'asc' }
                        }
                    }
                },
                members: {
                    select: { userId: true }
                }
            }
        })
    }

    const fetchDriveConfig = async () => {
        if (!isLeadership) return null

        const driveDelegate = (prisma as { workspaceDriveConfig?: { findUnique?: Function } }).workspaceDriveConfig
        if (!driveDelegate?.findUnique) return null

        const hasTable = await driveConfigTableExists()
        if (!hasTable) return null

        try {
            return await driveDelegate.findUnique({
                where: { workspaceId },
                select: {
                    refreshToken: true,
                    folderId: true,
                    folderName: true,
                    connectedByName: true
                }
            })
        } catch (error: any) {
            if (error?.code === "P2021") {
                return null
            }
            throw error
        }
    }

    const [myTasks, pendingApproval, teamStats, recentActivity, heatmapData, projects, driveConfig] = await Promise.all([
        fetchMyTasks(),
        fetchPendingApproval(),
        fetchTeamStats(),
        fetchRecentActivity(),
        fetchHeatmapData(),
        fetchProjects(),
        fetchDriveConfig()
    ])

    // Process tasks
    const pendingTasks = myTasks.filter(t => t.column?.name !== 'Done' && t.column?.name !== 'Review')
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
        const now = new Date().getTime()
        const endTime = new Date(dueDate).getTime()
        const daysLeft = Math.ceil((endTime - now) / (1000 * 60 * 60 * 24))
        const isOverdue = daysLeft < 0

        const text = isOverdue
            ? `${Math.abs(daysLeft)}d overdue`
            : daysLeft === 0
                ? "Today"
                : `${daysLeft}d`

        return { text, isOverdue }
    }

    const driveConnected = !!driveConfig?.refreshToken
    const driveHasFolder = !!driveConfig?.folderId
    const showDriveSetup = isAdmin && (!driveConnected || !driveHasFolder)

    return (
        <div className="h-full overflow-y-auto">
            <div className="p-4 md:p-6 space-y-5 animate-fade-in-up">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-xl font-semibold">{user.name?.split(' ')[0]}'s Dashboard</h1>
                    </div>
                </div>

                {/* Drive setup prompt */}
                {showDriveSetup && (
                    <Link
                        href="/dashboard/settings?tab=integrations"
                        className="flex items-center gap-4 p-4 border border-dashed border-blue-300 dark:border-blue-700 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors group"
                    >
                        <div className="w-10 h-10 rounded-lg bg-white dark:bg-zinc-900 border flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                            </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">
                                {!driveConnected ? "Connect Google Drive" : "Select a root folder"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {!driveConnected
                                    ? "Set up Google Drive to manage and upload files directly from your dashboard."
                                    : "Pick a root folder to organize your team's uploads."}
                            </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                    </Link>
                )}

                {/* Main Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Left Column - Tasks & Approval Side-by-Side */}
                    <div className="lg:col-span-2 space-y-5">
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                            {/* My Tasks - Detailed View */}
                            <section className={cn(
                                "border border-border rounded-lg p-4 h-full",
                                isLeadership ? "xl:col-span-1" : "xl:col-span-2"
                            )}>
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-sm font-medium">My Tasks</h2>
                                    <Link
                                        href="/dashboard/my-board"
                                        className="text-[10px] text-muted-foreground hover:text-foreground transition-all flex items-center gap-1"
                                    >
                                        Personal Board
                                        <ChevronRight className="h-3 w-3" />
                                    </Link>
                                </div>

                                {pendingTasks.length > 0 ? (
                                    <div className="grid grid-cols-1 gap-3">
                                        {pendingTasks.map(task => {
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
                                                        attachmentsCount: task._count.attachments,
                                                        progress: task.progress,
                                                        enableProgress: task.enableProgress,
                                                        startDate: task.startDate?.toISOString() || null,
                                                        endDate: task.endDate?.toISOString() || null
                                                    }}
                                                />
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground text-center py-8">No pending tasks</p>
                                )}
                            </section>

                            {/* Pending Approval - Leadership Only */}
                            {isLeadership && (
                                <section className="border border-border rounded-lg p-4 h-full xl:col-span-1">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-sm font-medium">Approval</h2>
                                    </div>

                                    {pendingApproval.length > 0 ? (
                                        <div className="grid grid-cols-1 gap-3">
                                            {pendingApproval.map(task => {
                                                const project = task.column?.board?.project
                                                const projectColor = project?.color || '#6b7280'
                                                const assignees = task.assignees?.map(a => a.user.name) || []
                                                const assignee = task.assignee?.name
                                                const assignedTo = assignees.length > 0 ? assignees : (assignee ? [assignee] : [])

                                                // Get Done and In Progress column IDs from the board
                                                const columns = task.column?.board?.columns || []
                                                const doneColumn = columns.find(c => c.name === 'Done')
                                                const inProgressColumn = columns.find(c => c.name === 'In Progress')

                                                return (
                                                    <ApprovalRow
                                                        key={task.id}
                                                        task={{
                                                            id: task.id,
                                                            title: task.title,
                                                            description: task.description,
                                                            projectId: project?.id || '',
                                                            projectName: project?.name || '',
                                                            projectColor,
                                                            pushId: task.push?.id || null,
                                                            assignedTo,
                                                            submittedAt: task.submittedAt?.toISOString() || null,
                                                            commentsCount: task._count.comments,
                                                            attachmentsCount: task._count.attachments,
                                                            progress: task.progress,
                                                            enableProgress: task.enableProgress,
                                                            startDate: task.startDate?.toISOString() || null,
                                                            endDate: task.endDate?.toISOString() || null,
                                                            doneColumnId: doneColumn?.id || '',
                                                            inProgressColumnId: inProgressColumn?.id || ''
                                                        }}
                                                    />
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground text-center py-6">None pending</p>
                                    )}
                                </section>
                            )}
                        </div>

                        {/* Team Heatmap - Leadership Only */}
                        {isLeadership && heatmapData && (
                            <DashboardHeatmap
                                userStats={heatmapData.userStats}
                                criticalIssues={heatmapData.criticalIssues}
                                overloadedUsers={heatmapData.overloadedUsers}
                                idleUsers={heatmapData.idleUsers}
                                allTasks={heatmapData.allTasks}
                                projects={projects}
                            />
                        )}
                    </div>

                    {/* Right Column - Leadership Only */}
                    {isLeadership && (
                        <div className="flex flex-col gap-5 h-full">
                            {/* Project Activity Tracker */}
                            <div className="shrink-0">
                                <ProjectActivityTracker />
                            </div>

                            {/* Drive Uploads */}
                            <DriveUploadWidget
                                className="flex-1"
                                initialConfig={{
                                    connected: !!driveConfig?.refreshToken,
                                    folderId: driveConfig?.folderId || null,
                                    folderName: driveConfig?.folderName || null,
                                    connectedByName: driveConfig?.connectedByName || null
                                }}
                                canManage={isAdmin}
                            />
                        </div>
                    )}

                    {/* Recent Activity - Bottom Left */}
                    {isLeadership && recentActivity.length > 0 && (
                        <div className="lg:col-span-2">
                            <section className="border border-border rounded-lg p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-sm font-medium">Recent Activity</h2>
                                    {teamStats && (
                                        <TeamPopup members={teamStats.users} totalTasks={teamStats.totalTasks}>
                                            <button className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                                                <Users className="h-3 w-3" />
                                                Team
                                            </button>
                                        </TeamPopup>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    {recentActivity.map(log => (
                                        <DashboardClient
                                            key={log.id}
                                            activity={log}
                                        />
                                    ))}
                                </div>
                            </section>
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
