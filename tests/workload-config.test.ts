import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_WORKLOAD_CONFIG, mergeWorkloadConfig, normalizeWorkloadConfig } from '@/lib/workload'

test('mergeWorkloadConfig returns the base config for invalid patches', () => {
    assert.equal(mergeWorkloadConfig(DEFAULT_WORKLOAD_CONFIG, null), DEFAULT_WORKLOAD_CONFIG)
    assert.equal(mergeWorkloadConfig(DEFAULT_WORKLOAD_CONFIG, undefined), DEFAULT_WORKLOAD_CONFIG)
})

test('mergeWorkloadConfig merges nested sections without losing defaults', () => {
    const merged = mergeWorkloadConfig(DEFAULT_WORKLOAD_CONFIG, {
        capacity: { maxWip: 12 } as never,
        thresholds: { dueSoonDays: 5 } as never,
    })

    assert.equal(merged.capacity.maxWip, 12)
    assert.equal(merged.capacity.minWip, DEFAULT_WORKLOAD_CONFIG.capacity.minWip)
    assert.equal(merged.thresholds.dueSoonDays, 5)
    assert.equal(merged.thresholds.stuckDays, DEFAULT_WORKLOAD_CONFIG.thresholds.stuckDays)
})

const normalizationCases: Array<{
    name: string
    config: Parameters<typeof normalizeWorkloadConfig>[0]
    actual: (config: ReturnType<typeof normalizeWorkloadConfig>) => number | boolean
    expected: number | boolean
}> = [
    { name: 'clamps lookbackDays minimum', config: { lookbackDays: 1 }, actual: c => c.lookbackDays, expected: 14 },
    { name: 'clamps lookbackDays maximum', config: { lookbackDays: 999 }, actual: c => c.lookbackDays, expected: 365 },
    { name: 'clamps minCompletedTasks minimum', config: { minCompletedTasks: 0 }, actual: c => c.minCompletedTasks, expected: 1 },
    { name: 'clamps minCompletedTasks maximum', config: { minCompletedTasks: 99 }, actual: c => c.minCompletedTasks, expected: 50 },
    { name: 'clamps defaultCycleDays minimum', config: { baseline: { defaultCycleDays: 0 } as never }, actual: c => c.baseline.defaultCycleDays, expected: 1 },
    { name: 'clamps defaultCycleDays maximum', config: { baseline: { defaultCycleDays: 999 } as never }, actual: c => c.baseline.defaultCycleDays, expected: 60 },
    { name: 'clamps defaultThroughputPerWeek minimum', config: { baseline: { defaultThroughputPerWeek: 0 } as never }, actual: c => c.baseline.defaultThroughputPerWeek, expected: 0.1 },
    { name: 'clamps defaultThroughputPerWeek maximum', config: { baseline: { defaultThroughputPerWeek: 99 } as never }, actual: c => c.baseline.defaultThroughputPerWeek, expected: 20 },
    { name: 'clamps minCycleDays minimum', config: { baseline: { minCycleDays: 0 } as never }, actual: c => c.baseline.minCycleDays, expected: 0.5 },
    { name: 'clamps maxCycleDays maximum', config: { baseline: { maxCycleDays: 999 } as never }, actual: c => c.baseline.maxCycleDays, expected: 120 },
    { name: 'clamps wipMultiplier minimum', config: { capacity: { wipMultiplier: 0 } as never }, actual: c => c.capacity.wipMultiplier, expected: 0.5 },
    { name: 'clamps wipMultiplier maximum', config: { capacity: { wipMultiplier: 99 } as never }, actual: c => c.capacity.wipMultiplier, expected: 3 },
    { name: 'clamps minWip minimum', config: { capacity: { minWip: 0 } as never }, actual: c => c.capacity.minWip, expected: 0.5 },
    { name: 'clamps maxWip maximum', config: { capacity: { maxWip: 99 } as never }, actual: c => c.capacity.maxWip, expected: 20 },
    { name: 'clamps availableLoadRatio minimum', config: { capacity: { availableLoadRatio: 0 } as never }, actual: c => c.capacity.availableLoadRatio, expected: 0.1 },
    { name: 'clamps availableLoadRatio maximum', config: { capacity: { availableLoadRatio: 2 } as never }, actual: c => c.capacity.availableLoadRatio, expected: 1 },
    { name: 'clamps overloadLoadRatio minimum', config: { capacity: { overloadLoadRatio: 0 } as never }, actual: c => c.capacity.overloadLoadRatio, expected: 1 },
    { name: 'clamps overloadLoadRatio maximum', config: { capacity: { overloadLoadRatio: 10 } as never }, actual: c => c.capacity.overloadLoadRatio, expected: 3 },
    { name: 'clamps overloadMinTasks minimum', config: { capacity: { overloadMinTasks: 0 } as never }, actual: c => c.capacity.overloadMinTasks, expected: 1 },
    { name: 'clamps overloadMinTasks maximum', config: { capacity: { overloadMinTasks: 50 } as never }, actual: c => c.capacity.overloadMinTasks, expected: 10 },
    { name: 'clamps dueSoonDays minimum', config: { thresholds: { dueSoonDays: 0 } as never }, actual: c => c.thresholds.dueSoonDays, expected: 1 },
    { name: 'clamps dueSoonDays maximum', config: { thresholds: { dueSoonDays: 50 } as never }, actual: c => c.thresholds.dueSoonDays, expected: 14 },
    { name: 'clamps stuckDays minimum', config: { thresholds: { stuckDays: 0 } as never }, actual: c => c.thresholds.stuckDays, expected: 1 },
    { name: 'clamps stuckDays maximum', config: { thresholds: { stuckDays: 50 } as never }, actual: c => c.thresholds.stuckDays, expected: 14 },
    { name: 'clamps reviewStaleDays minimum', config: { thresholds: { reviewStaleDays: 0 } as never }, actual: c => c.thresholds.reviewStaleDays, expected: 1 },
    { name: 'clamps reviewStaleDays maximum', config: { thresholds: { reviewStaleDays: 50 } as never }, actual: c => c.thresholds.reviewStaleDays, expected: 21 },
    { name: 'clamps agingMultiplier minimum', config: { thresholds: { agingMultiplier: 0 } as never }, actual: c => c.thresholds.agingMultiplier, expected: 1 },
    { name: 'clamps agingMultiplier maximum', config: { thresholds: { agingMultiplier: 10 } as never }, actual: c => c.thresholds.agingMultiplier, expected: 5 },
    { name: 'clamps progressLagPercent minimum', config: { thresholds: { progressLagPercent: 0 } as never }, actual: c => c.thresholds.progressLagPercent, expected: 5 },
    { name: 'clamps progressLagPercent maximum', config: { thresholds: { progressLagPercent: 100 } as never }, actual: c => c.thresholds.progressLagPercent, expected: 80 },
    { name: 'clamps overdue weight minimum', config: { weights: { overdue: -1 } as never }, actual: c => c.weights.overdue, expected: 0 },
    { name: 'clamps overdue weight maximum', config: { weights: { overdue: 99 } as never }, actual: c => c.weights.overdue, expected: 10 },
    { name: 'clamps load weight minimum', config: { weights: { load: -1 } as never }, actual: c => c.weights.load, expected: 0 },
    { name: 'clamps load weight maximum', config: { weights: { load: 99 } as never }, actual: c => c.weights.load, expected: 10 },
    { name: 'clamps strugglingScore maximum', config: { status: { strugglingScore: 99 } as never }, actual: c => c.status.strugglingScore, expected: 20 },
    { name: 'clamps criticalOverdueCount maximum', config: { status: { criticalOverdueCount: 99 } as never }, actual: c => c.status.criticalOverdueCount, expected: 10 },
    { name: 'clamps criticalHelpCount maximum', config: { status: { criticalHelpCount: 99 } as never }, actual: c => c.status.criticalHelpCount, expected: 10 },
    { name: 'clamps criticalStuckCount maximum', config: { status: { criticalStuckCount: 99 } as never }, actual: c => c.status.criticalStuckCount, expected: 10 },
    { name: 'preserves availableRequiresNoRisk booleans', config: { status: { availableRequiresNoRisk: false } as never }, actual: c => c.status.availableRequiresNoRisk, expected: false },
]

for (const testCase of normalizationCases) {
    test(testCase.name, () => {
        const normalized = normalizeWorkloadConfig(testCase.config)
        assert.equal(testCase.actual(normalized), testCase.expected)
    })
}
