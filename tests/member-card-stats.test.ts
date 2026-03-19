import assert from "node:assert/strict"
import test from "node:test"
import {
    buildTasksByUser,
    calculateMemberCardStats,
    getAssignedUserIds,
    isMemberTaskOverdue,
    type MemberCardTask,
} from "@/lib/member-card-stats"

test("getAssignedUserIds deduplicates primary and shared assignees", () => {
    const task: MemberCardTask = {
        id: "task-1",
        assigneeId: "user-1",
        assignees: [{ userId: "user-1" }, { userId: "user-2" }],
    }

    assert.deepEqual(getAssignedUserIds(task), ["user-1", "user-2"])
})

test("buildTasksByUser maps shared tasks to each assignee only once", () => {
    const tasks: MemberCardTask[] = [
        {
            id: "task-1",
            assigneeId: "user-1",
            assignees: [{ userId: "user-1" }, { userId: "user-2" }],
        },
        {
            id: "task-2",
            assigneeId: "user-2",
            assignees: [],
        },
    ]

    const tasksByUser = buildTasksByUser(["user-1", "user-2"], tasks)

    assert.deepEqual(tasksByUser.get("user-1")?.map((task) => task.id), ["task-1"])
    assert.deepEqual(tasksByUser.get("user-2")?.map((task) => task.id), ["task-1", "task-2"])
})

test("isMemberTaskOverdue ignores done tasks and falls back to endDate", () => {
    const now = new Date("2026-03-18T12:00:00.000Z")

    assert.equal(
        isMemberTaskOverdue(
            {
                column: { name: "Done" },
                dueDate: "2026-03-10T00:00:00.000Z",
            },
            now
        ),
        false
    )

    assert.equal(
        isMemberTaskOverdue(
            {
                column: { name: "In Progress" },
                endDate: "2026-03-17T23:59:59.000Z",
            },
            now
        ),
        true
    )
})

test("calculateMemberCardStats computes card counts and recent activity correctly", () => {
    const now = new Date("2026-03-18T12:00:00.000Z")
    const tasks: MemberCardTask[] = [
        { id: "done-task", column: { name: "Done" } },
        { id: "progress-task", column: { name: "In Progress" }, dueDate: "2026-03-20T00:00:00.000Z" },
        { id: "todo-task", column: { name: "To Do" }, dueDate: "2026-03-17T23:59:59.000Z" },
        { id: "review-task", column: { name: "Review" } },
    ]

    const stats = calculateMemberCardStats(
        tasks,
        [
            { createdAt: "2026-03-17T12:00:00.000Z" },
            { createdAt: "2026-03-08T11:59:59.000Z" },
        ],
        now
    )

    assert.equal(stats.completedTasks.length, 1)
    assert.equal(stats.inProgressTasks.length, 1)
    assert.equal(stats.todoTasks.length, 1)
    assert.equal(stats.reviewTasks.length, 1)
    assert.equal(stats.overdueTasks.length, 1)
    assert.equal(stats.completionRate, 25)
    assert.equal(stats.recentActivityCount, 1)
    assert.equal(stats.totalTasks, 4)
})
