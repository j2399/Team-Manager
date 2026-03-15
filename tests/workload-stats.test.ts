import assert from 'node:assert/strict'
import test from 'node:test'
import {
    buildWorkloadTasks,
    computeWorkloadStats,
    DEFAULT_WORKLOAD_CONFIG,
    normalizeWorkloadConfig,
    type WorkloadUser,
} from '@/lib/workload'

const NOW = new Date('2026-03-15T12:00:00.000Z')
const CONFIG = normalizeWorkloadConfig(DEFAULT_WORKLOAD_CONFIG)
const USERS: WorkloadUser[] = [
    { id: 'user-1', name: 'Avery Owner', avatar: null, role: 'Member' },
    { id: 'user-2', name: 'Blake Builder', avatar: null, role: 'Member' },
]

function daysAgo(days: number) {
    return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)
}

function daysAhead(days: number) {
    return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000)
}

function buildTaskInput(overrides: Record<string, unknown> = {}) {
    return {
        id: 'task-1',
        title: 'Task',
        columnId: 'col-1',
        assigneeId: 'user-1',
        assignees: [],
        column: {
            name: 'In Progress',
            board: {
                project: {
                    id: 'project-1',
                    name: 'Division One',
                    color: '#3b82f6',
                },
            },
        },
        push: { id: 'push-1', name: 'Push One' },
        dueDate: daysAhead(2),
        startDate: daysAgo(2),
        createdAt: daysAgo(5),
        updatedAt: daysAgo(1),
        submittedAt: null,
        approvedAt: null,
        progress: 50,
        enableProgress: true,
        helpRequests: [],
        activityLogs: [{ createdAt: daysAgo(1) }],
        checklistItems: [{ completed: true }, { completed: false }],
        ...overrides,
    }
}

const buildTaskCases = [
    {
        name: 'marks overdue tasks outside Done',
        overrides: { dueDate: daysAgo(1) },
        assertTask: (task: ReturnType<typeof buildWorkloadTasks>[number]) => assert.equal(task.isOverdue, true),
    },
    {
        name: 'does not mark Done tasks as overdue',
        overrides: { dueDate: daysAgo(1), column: { name: 'Done', board: { project: { id: 'project-1', name: 'Division One', color: '#3b82f6' } } } },
        assertTask: (task: ReturnType<typeof buildWorkloadTasks>[number]) => assert.equal(task.isOverdue, false),
    },
    {
        name: 'detects stuck in-progress tasks',
        overrides: { activityLogs: [{ createdAt: daysAgo(CONFIG.thresholds.stuckDays + 1) }] },
        assertTask: (task: ReturnType<typeof buildWorkloadTasks>[number]) => assert.equal(task.isStuck, true),
    },
    {
        name: 'detects review stale tasks',
        overrides: { column: { name: 'Review', board: { project: { id: 'project-1', name: 'Division One', color: '#3b82f6' } } }, submittedAt: daysAgo(CONFIG.thresholds.reviewStaleDays + 1) },
        assertTask: (task: ReturnType<typeof buildWorkloadTasks>[number]) => assert.equal(task.isReviewStale, true),
    },
    {
        name: 'detects blocked by help requests',
        overrides: { helpRequests: [{ id: 'help-1' }] },
        assertTask: (task: ReturnType<typeof buildWorkloadTasks>[number]) => assert.equal(task.isBlockedByHelp, true),
    },
    {
        name: 'detects unassigned active tasks',
        overrides: { assigneeId: null, assignees: [] },
        assertTask: (task: ReturnType<typeof buildWorkloadTasks>[number]) => assert.equal(task.isUnassigned, true),
    },
    {
        name: 'falls back to endDate when dueDate is absent',
        overrides: { dueDate: null, endDate: daysAhead(4) },
        assertTask: (task: ReturnType<typeof buildWorkloadTasks>[number]) => assert.equal(task.dueDate?.toISOString(), daysAhead(4).toISOString()),
    },
    {
        name: 'counts checklist items and completions',
        overrides: { checklistItems: [{ completed: true }, { completed: false }, { completed: true }] },
        assertTask: (task: ReturnType<typeof buildWorkloadTasks>[number]) => {
            assert.equal(task.checklistTotal, 3)
            assert.equal(task.checklistCompleted, 2)
        },
    },
    {
        name: 'uses unknown defaults when project metadata is missing',
        overrides: { column: { name: 'To Do', board: { project: null } } },
        assertTask: (task: ReturnType<typeof buildWorkloadTasks>[number]) => {
            assert.equal(task.projectId, '')
            assert.equal(task.projectColor, '#6b7280')
        },
    },
    {
        name: 'combines direct and join-table assignees without duplicates',
        overrides: {
            assigneeId: 'user-1',
            assignees: [{ userId: 'user-1' }, { user: { id: 'user-2' } }, { userId: 'user-2' }],
        },
        assertTask: (task: ReturnType<typeof buildWorkloadTasks>[number]) => {
            assert.deepEqual(task.assigneeIds.sort(), ['user-1', 'user-2'])
        },
    },
]

for (const testCase of buildTaskCases) {
    test(`buildWorkloadTasks ${testCase.name}`, () => {
        const [task] = buildWorkloadTasks([buildTaskInput(testCase.overrides)], NOW, CONFIG)
        testCase.assertTask(task)
    })
}

type StatusScenario = {
    name: string
    tasks: ReturnType<typeof buildWorkloadTasks>
    expectedStatus: 'available' | 'on-track' | 'struggling'
    expected: Partial<{ overdueTasks: number; stuckTasks: number; helpRequestTasks: number; dueSoonTasks: number; reviewStaleTasks: number; progressLagTasks: number; agingTasks: number }>
}

const statusScenarios: StatusScenario[] = [
    {
        name: 'available when user has no tasks',
        tasks: [],
        expectedStatus: 'available',
        expected: { overdueTasks: 0 },
    },
    {
        name: 'on-track for healthy in-progress work',
        tasks: buildWorkloadTasks([buildTaskInput()], NOW, CONFIG),
        expectedStatus: 'on-track',
        expected: { overdueTasks: 0, stuckTasks: 0 },
    },
    {
        name: 'struggling for overdue work',
        tasks: buildWorkloadTasks([buildTaskInput({ dueDate: daysAgo(1) })], NOW, CONFIG),
        expectedStatus: 'struggling',
        expected: { overdueTasks: 1 },
    },
    {
        name: 'struggling for active help requests',
        tasks: buildWorkloadTasks([buildTaskInput({ helpRequests: [{ id: 'help-1' }] })], NOW, CONFIG),
        expectedStatus: 'struggling',
        expected: { helpRequestTasks: 1 },
    },
    {
        name: 'tracks stale review tasks',
        tasks: buildWorkloadTasks([
            buildTaskInput({
                column: { name: 'Review', board: { project: { id: 'project-1', name: 'Division One', color: '#3b82f6' } } },
                submittedAt: daysAgo(CONFIG.thresholds.reviewStaleDays + 2),
            })
        ], NOW, CONFIG),
        expectedStatus: 'on-track',
        expected: { reviewStaleTasks: 1 },
    },
    {
        name: 'tracks progress lag',
        tasks: buildWorkloadTasks([
            buildTaskInput({
                startDate: daysAgo(8),
                dueDate: daysAhead(2),
                progress: 10,
            })
        ], NOW, CONFIG),
        expectedStatus: 'on-track',
        expected: { progressLagTasks: 1 },
    },
    {
        name: 'tracks aging tasks',
        tasks: buildWorkloadTasks([
            buildTaskInput({
                startDate: daysAgo(20),
                createdAt: daysAgo(20),
                approvedAt: null,
            })
        ], NOW, CONFIG),
        expectedStatus: 'on-track',
        expected: { agingTasks: 1 },
    },
    {
        name: 'tracks stuck tasks',
        tasks: buildWorkloadTasks([
            buildTaskInput({
                activityLogs: [{ createdAt: daysAgo(CONFIG.thresholds.stuckDays + 3) }],
            })
        ], NOW, CONFIG),
        expectedStatus: 'on-track',
        expected: { stuckTasks: 1 },
    },
]

for (const scenario of statusScenarios) {
    test(`computeWorkloadStats ${scenario.name}`, () => {
        const { userStats } = computeWorkloadStats(USERS, scenario.tasks, CONFIG, NOW)
        const stat = userStats.find((entry) => entry.id === 'user-1')

        assert.ok(stat)
        assert.equal(stat.status, scenario.expectedStatus)

        for (const [key, value] of Object.entries(scenario.expected)) {
            assert.equal(stat[key as keyof typeof scenario.expected], value)
        }
    })
}

for (let completedCount = 0; completedCount < 12; completedCount += 1) {
    test(`computeWorkloadStats calculates throughput with ${completedCount} completed tasks`, () => {
        const completedTasks = Array.from({ length: completedCount }, (_, index) =>
            buildWorkloadTasks([
                buildTaskInput({
                    id: `done-${index}`,
                    title: `Done ${index}`,
                    column: { name: 'Done', board: { project: { id: 'project-1', name: 'Division One', color: '#3b82f6' } } },
                    approvedAt: daysAgo(index + 1),
                    startDate: daysAgo(index + 4),
                    dueDate: daysAgo(index + 2),
                })
            ], NOW, CONFIG)[0]
        )

        const { userStats } = computeWorkloadStats(USERS, completedTasks, CONFIG, NOW)
        const stat = userStats.find((entry) => entry.id === 'user-1')

        assert.ok(stat)
        assert.equal(stat.doneTasks, completedCount)
        assert.equal(stat.totalTasks, completedCount)
        assert.equal(stat.throughputPerWeek >= 0, true)
    })
}

for (let activeCount = 1; activeCount <= 20; activeCount += 1) {
    test(`computeWorkloadStats tracks active load for ${activeCount} concurrent tasks`, () => {
        const tasks = Array.from({ length: activeCount }, (_, index) =>
            buildWorkloadTasks([
                buildTaskInput({
                    id: `active-${index}`,
                    title: `Active ${index}`,
                    dueDate: daysAhead((index % 5) + 1),
                    startDate: daysAgo(index % 3),
                    updatedAt: daysAgo(1),
                })
            ], NOW, CONFIG)[0]
        )

        const { userStats, overloadedUsers } = computeWorkloadStats(USERS, tasks, CONFIG, NOW)
        const stat = userStats.find((entry) => entry.id === 'user-1')

        assert.ok(stat)
        assert.equal(stat.activeTasks, activeCount)
        assert.equal(stat.totalTasks, activeCount)
        assert.equal(overloadedUsers.includes('user-1'), stat.loadRatio >= CONFIG.capacity.overloadLoadRatio && stat.activeTasks >= CONFIG.capacity.overloadMinTasks)
    })
}
