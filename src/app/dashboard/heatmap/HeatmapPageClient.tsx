"use client"

import { type Preloaded, usePreloadedQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import { buildWorkloadTasks, computeWorkloadStats, normalizeWorkloadConfig } from "@/lib/workload"
import { HeatmapView } from "./HeatmapView"

export function HeatmapPageClient({
    preloadedPageData,
}: {
    preloadedPageData: Preloaded<typeof api.dashboard.getHeatmapPageData>
}) {
    const { config: workloadConfig, memberships, tasks, projects } = usePreloadedQuery(preloadedPageData)
    const config = normalizeWorkloadConfig(workloadConfig)

    const users = memberships.map((member) => ({
        id: member.userId,
        name: member.name || member.user.name,
        avatar: member.user.avatar,
        role: member.role,
    }))

    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const workloadTasks = buildWorkloadTasks(
        tasks.map((task) => ({
            ...task,
            dueDate: task.dueDate ? new Date(task.dueDate) : null,
            endDate: task.endDate ? new Date(task.endDate) : null,
            startDate: task.startDate ? new Date(task.startDate) : null,
            createdAt: new Date(task.createdAt),
            updatedAt: new Date(task.updatedAt),
            submittedAt: task.submittedAt ? new Date(task.submittedAt) : null,
            approvedAt: task.approvedAt ? new Date(task.approvedAt) : null,
            helpRequests: task.helpRequests.map((request) => ({
                ...request,
                createdAt: new Date(request.createdAt),
            })),
            activityLogs: task.activityLogs.map((log) => ({
                ...log,
                createdAt: new Date(log.createdAt),
            })),
        })),
        now,
        config
    )
    const { userStats, overloadedUsers, idleUsers } = computeWorkloadStats(users, workloadTasks, config, now)

    const transformedTasks = workloadTasks.map((task) => ({
        id: task.id,
        title: task.title,
        columnName: task.columnName,
        columnId: task.columnId,
        projectId: task.projectId,
        projectName: task.projectName,
        projectColor: task.projectColor,
        pushId: task.pushId,
        pushName: task.pushName,
        assigneeIds: task.assigneeIds,
        dueDate: task.dueDate ? task.dueDate.toISOString() : null,
        isOverdue: task.isOverdue,
        daysUntilDue: task.daysUntilDue,
        daysSinceActivity: task.daysSinceActivity,
        isStuck: task.isStuck,
        isBlockedByHelp: task.isBlockedByHelp,
        isUnassigned: task.isUnassigned,
        helpRequestStatus: task.isBlockedByHelp ? "open" : null,
        checklistTotal: task.checklistTotal,
        checklistCompleted: task.checklistCompleted,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
    }))

    const taskMap = new Map(transformedTasks.map((task) => [task.id, task]))
    const userStatsForView = userStats.map((user) => ({
        ...user,
        tasks: user.tasks
            .map((task) => taskMap.get(task.id))
            .filter((task): task is (typeof transformedTasks)[number] => Boolean(task)),
    }))

    const bottlenecks = {
        totalOverdue: transformedTasks.filter((task) => task.isOverdue && task.columnName !== "Done").length,
        totalStuck: transformedTasks.filter((task) => task.isStuck).length,
        totalUnassigned: transformedTasks.filter((task) => task.isUnassigned).length,
        totalHelpRequests: transformedTasks.filter((task) => task.isBlockedByHelp).length,
        tasksInReview: transformedTasks.filter((task) => task.columnName === "Review").length,
        overdueThisWeek: transformedTasks.filter((task) => {
            if (!task.dueDate || task.columnName === "Done") return false
            const due = new Date(task.dueDate)
            return due >= sevenDaysAgo && due < now
        }).length,
    }

    const criticalIssues: { type: string; severity: "critical" | "warning" | "info"; message: string; count: number; tasks: typeof transformedTasks }[] = []

    if (bottlenecks.totalOverdue > 0) {
        criticalIssues.push({
            type: "overdue",
            severity: "critical",
            message: `${bottlenecks.totalOverdue} tasks are overdue`,
            count: bottlenecks.totalOverdue,
            tasks: transformedTasks.filter((task) => task.isOverdue && task.columnName !== "Done"),
        })
    }

    if (bottlenecks.totalStuck > 0) {
        criticalIssues.push({
            type: "stuck",
            severity: "warning",
            message: `${bottlenecks.totalStuck} tasks stuck in progress (no activity for ${config.thresholds.stuckDays}+ days)`,
            count: bottlenecks.totalStuck,
            tasks: transformedTasks.filter((task) => task.isStuck),
        })
    }

    if (bottlenecks.totalHelpRequests > 0) {
        criticalIssues.push({
            type: "help",
            severity: "warning",
            message: `${bottlenecks.totalHelpRequests} tasks need help`,
            count: bottlenecks.totalHelpRequests,
            tasks: transformedTasks.filter((task) => task.isBlockedByHelp),
        })
    }

    if (bottlenecks.totalUnassigned > 0) {
        criticalIssues.push({
            type: "unassigned",
            severity: "info",
            message: `${bottlenecks.totalUnassigned} tasks are unassigned`,
            count: bottlenecks.totalUnassigned,
            tasks: transformedTasks.filter((task) => task.isUnassigned),
        })
    }

    if (bottlenecks.tasksInReview > 5) {
        criticalIssues.push({
            type: "review_queue",
            severity: "warning",
            message: `${bottlenecks.tasksInReview} tasks waiting for review`,
            count: bottlenecks.tasksInReview,
            tasks: transformedTasks.filter((task) => task.columnName === "Review"),
        })
    }

    if (overloadedUsers.length > 0) {
        criticalIssues.push({
            type: "overloaded",
            severity: "warning",
            message: `${overloadedUsers.length} team members are overloaded`,
            count: overloadedUsers.length,
            tasks: [],
        })
    }

    return (
        <div className="h-full flex flex-col">
            <HeatmapView
                userStats={userStatsForView}
                bottlenecks={bottlenecks}
                criticalIssues={criticalIssues}
                projects={projects.map((project) => ({
                    id: project.id,
                    name: project.name,
                    color: project.color || "#6b7280",
                    leadNames: project.leadAssignments.map((assignment) => assignment.user.name),
                }))}
                overloadedUsers={overloadedUsers}
                idleUsers={idleUsers}
                allTasks={transformedTasks}
            />
        </div>
    )
}
