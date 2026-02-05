import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { buildWorkloadTasks, computeWorkloadStats, getWorkloadConfig } from "@/lib/workload"

export async function GET() {
    const user = await getCurrentUser()
    if (!user || !user.workspaceId) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    try {
        const workspaceId = user.workspaceId
        const [config, memberships, tasks, projects] = await Promise.all([
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
                        where: { status: { in: ["open", "acknowledged"] } },
                        select: { id: true }
                    },
                    activityLogs: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: { createdAt: true }
                    }
                }
            }),
            prisma.project.findMany({
                where: { workspaceId },
                select: {
                    id: true,
                    name: true,
                    color: true,
                    pushes: {
                        where: { status: "Active" },
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
                                orderBy: { order: "asc" }
                            }
                        }
                    },
                    members: {
                        select: { userId: true }
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

        const criticalIssues: { type: string; severity: "critical" | "warning" | "info"; message: string; count: number; tasks: typeof workloadTasks }[] = []

        const totalOverdue = workloadTasks.filter(t => t.isOverdue).length
        const totalStuck = workloadTasks.filter(t => t.isStuck).length
        const totalHelpRequests = workloadTasks.filter(t => t.isBlockedByHelp).length
        const totalUnassigned = workloadTasks.filter(t => t.isUnassigned).length

        if (totalOverdue > 0) {
            criticalIssues.push({
                type: "overdue",
                severity: "critical",
                message: `${totalOverdue} tasks are overdue`,
                count: totalOverdue,
                tasks: workloadTasks.filter(t => t.isOverdue)
            })
        }

        if (totalStuck > 0) {
            criticalIssues.push({
                type: "stuck",
                severity: "warning",
                message: `${totalStuck} tasks stuck (${config.thresholds.stuckDays}+ days)`,
                count: totalStuck,
                tasks: workloadTasks.filter(t => t.isStuck)
            })
        }

        if (totalHelpRequests > 0) {
            criticalIssues.push({
                type: "help",
                severity: "warning",
                message: `${totalHelpRequests} tasks need help`,
                count: totalHelpRequests,
                tasks: workloadTasks.filter(t => t.isBlockedByHelp)
            })
        }

        if (totalUnassigned > 0) {
            criticalIssues.push({
                type: "unassigned",
                severity: "info",
                message: `${totalUnassigned} tasks unassigned`,
                count: totalUnassigned,
                tasks: workloadTasks.filter(t => t.isUnassigned)
            })
        }

        return NextResponse.json({
            userStats,
            criticalIssues,
            overloadedUsers,
            idleUsers,
            allTasks: workloadTasks,
            projects
        })
    } catch (error) {
        console.error("Failed to load heatmap data:", error)
        return NextResponse.json({ error: "Failed to load heatmap data" }, { status: 500 })
    }
}
