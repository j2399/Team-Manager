export type MemberCardTask = {
    id: string
    assigneeId?: string | null
    assignees?: { userId: string }[]
    column?: { name: string | null } | null
    dueDate?: Date | string | null
    endDate?: Date | string | null
}

export type MemberCardActivityLog = {
    createdAt: Date | string
}

export function getAssignedUserIds(task: MemberCardTask) {
    const assigneeIds = new Set<string>()

    if (task.assigneeId) {
        assigneeIds.add(task.assigneeId)
    }

    for (const assignee of task.assignees ?? []) {
        if (assignee.userId) {
            assigneeIds.add(assignee.userId)
        }
    }

    return Array.from(assigneeIds)
}

export function buildTasksByUser<TTask extends MemberCardTask>(userIds: string[], tasks: TTask[]) {
    const userIdSet = new Set(userIds)
    const tasksByUser = new Map<string, TTask[]>()

    for (const task of tasks) {
        for (const assigneeId of getAssignedUserIds(task)) {
            if (!userIdSet.has(assigneeId)) continue
            const current = tasksByUser.get(assigneeId) ?? []
            current.push(task)
            tasksByUser.set(assigneeId, current)
        }
    }

    return tasksByUser
}

export function isMemberTaskOverdue(
    task: Pick<MemberCardTask, "column" | "dueDate" | "endDate">,
    now = new Date()
) {
    if (task.column?.name === "Done") return false

    const dueDate = task.dueDate || task.endDate
    if (!dueDate) return false

    return new Date(dueDate).getTime() < now.getTime()
}

export function calculateMemberCardStats<
    TTask extends MemberCardTask,
    TActivityLog extends MemberCardActivityLog,
>(
    tasks: TTask[],
    activityLogs: TActivityLog[],
    now = new Date()
) {
    const completedTasks = tasks.filter((task) => task.column?.name === "Done")
    const inProgressTasks = tasks.filter((task) => task.column?.name === "In Progress")
    const todoTasks = tasks.filter((task) => task.column?.name === "Todo" || task.column?.name === "To Do")
    const reviewTasks = tasks.filter((task) => task.column?.name === "Review")
    const overdueTasks = tasks.filter((task) => isMemberTaskOverdue(task, now))

    const completionRate = tasks.length > 0
        ? Math.round((completedTasks.length / tasks.length) * 100)
        : 0

    const weekAgo = new Date(now)
    weekAgo.setDate(weekAgo.getDate() - 7)
    const recentActivityCount = activityLogs.filter((log) => new Date(log.createdAt).getTime() > weekAgo.getTime()).length

    return {
        completedTasks,
        inProgressTasks,
        todoTasks,
        reviewTasks,
        overdueTasks,
        completionRate,
        recentActivityCount,
        totalTasks: tasks.length,
    }
}
