import { getCurrentUser } from '@/lib/auth'
import { fetchDashboardPageData } from "@/lib/convex/dashboard"
import { AlertCircle, Users, CheckCircle2, Circle, Loader2, Clock, Layout, ChevronRight } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { cn } from "@/lib/utils"
import { DashboardClient } from "./DashboardClient"
import { TeamPopup } from "./TeamPopup"
import { TaskRow, ApprovalRow } from "./TaskRow"
import { DashboardHeatmapLoader } from "./DashboardHeatmapLoader"
import { ProjectActivityTracker } from "./ProjectActivityTracker"
import { DriveUploadWidget } from "./DriveUploadWidget"
import { InviteNoticeCard } from "@/components/InviteNoticeCard"
import { readInviteNotice } from "@/lib/invite-status"

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

export default async function DashboardPage({
    searchParams,
}: {
    searchParams?: Promise<SearchParams>
}) {
    const user = await getCurrentUser()
    const inviteNotice = readInviteNotice(searchParams ? await searchParams : null)

    if (!user || !user.id || user.id === 'pending') {
        return <div className="p-6 text-muted-foreground">Please complete your profile setup.</div>
    }

    if (!user.workspaceId) {
        redirect('/workspaces')
    }

    const isAdmin = user.role === 'Admin'
    const isTeamLead = user.role === 'Team Lead'
    const isLeadership = isAdmin || isTeamLead

    const { myTasks, pendingApproval, teamStats, recentActivity, driveConfig } = await fetchDashboardPageData({
        userId: user.id,
        workspaceId: user.workspaceId,
        role: user.role,
    })

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
    const getDueText = (dueDate: string | null): { text: string; isOverdue: boolean } => {
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

    const driveConnected = !!driveConfig?.connected
    const driveHasFolder = !!driveConfig?.folderId
    const showDriveSetup = isAdmin && (!driveConnected || !driveHasFolder)

    return (
        <div className="h-full overflow-y-auto">
            <div className="p-4 md:p-6 space-y-5 animate-fade-in-up">
                {inviteNotice && (
                    <InviteNoticeCard notice={inviteNotice} />
                )}

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-xl font-semibold">{`${user.name?.split(' ')[0] || 'User'}'s Dashboard`}</h1>
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
                    {/* Left Column - Tasks & Activity */}
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
                                                        commentsCount: task.commentsCount,
                                                        attachmentsCount: task.attachmentsCount,
                                                        progress: task.progress,
                                                        enableProgress: task.enableProgress,
                                                        startDate: task.startDate || null,
                                                        endDate: task.endDate || null
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
                                                            submittedAt: task.submittedAt || null,
                                                            commentsCount: task.commentsCount,
                                                            attachmentsCount: task.attachmentsCount,
                                                            progress: task.progress,
                                                            enableProgress: task.enableProgress,
                                                            startDate: task.startDate || null,
                                                            endDate: task.endDate || null,
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
                        {isLeadership && (
                            <DashboardHeatmapLoader />
                        )}

                        {/* Recent Activity */}
                        {isLeadership && recentActivity.length > 0 && (
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
                                    connected: !!driveConfig?.connected,
                                    folderId: driveConfig?.folderId || null,
                                    folderName: driveConfig?.folderName || null,
                                    connectedByName: driveConfig?.connectedByName || null
                                }}
                                canManage={isAdmin}
                            />
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
