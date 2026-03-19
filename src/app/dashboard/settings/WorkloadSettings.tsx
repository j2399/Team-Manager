"use client"

import { useEffect, useState, useTransition } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Check, RotateCcw, ChevronDown, ChevronRight } from "lucide-react"
import { useDashboardUser } from "@/components/DashboardUserProvider"
import {
    DEFAULT_WORKLOAD_CONFIG,
    mergeWorkloadConfig,
    normalizeWorkloadConfig,
    type WorkloadConfig,
} from "@/lib/workload"

type SectionProps = {
    title: string
    description: string
    children: React.ReactNode
    defaultOpen?: boolean
}

function Section({ title, description, children, defaultOpen = false }: SectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen)
    return (
        <div className="border rounded-lg">
            <button
                className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div>
                    <h3 className="text-sm font-medium">{title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                </div>
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
            {isOpen && <div className="px-4 pb-4 pt-2 border-t space-y-4">{children}</div>}
        </div>
    )
}

type FieldProps = {
    label: string
    hint?: string
    value: number
    onChange: (value: number) => void
    min?: number
    max?: number
    step?: number
}

function Field({ label, hint, value, onChange, min = 0, max = 100, step = 1 }: FieldProps) {
    return (
        <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
                <Label className="text-xs">{label}</Label>
                {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
            </div>
            <Input
                type="number"
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                min={min}
                max={max}
                step={step}
                className="h-8 text-sm"
            />
        </div>
    )
}

export function WorkloadSettings() {
    const dashboardUser = useDashboardUser()
    const workspaceId = dashboardUser?.workspaceId ?? null
    const [isPending, startTransition] = useTransition()
    const [config, setConfig] = useState<WorkloadConfig | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const configRecord = useQuery(
        api.settings.getWorkloadConfig,
        workspaceId ? { workspaceId } : "skip"
    )
    const saveWorkloadConfig = useMutation(api.settings.upsertWorkloadConfig)

    useEffect(() => {
        if (!workspaceId || configRecord === undefined) return

        setConfig(
            normalizeWorkloadConfig(
                (configRecord?.config as Partial<WorkloadConfig> | undefined) ?? DEFAULT_WORKLOAD_CONFIG
            )
        )
    }, [configRecord, workspaceId])

    const handleSave = () => {
        if (!config || !workspaceId) return
        setError(null)
        setSuccess(false)
        startTransition(async () => {
            try {
                const baseConfig = configRecord
                    ? normalizeWorkloadConfig(configRecord.config as Partial<WorkloadConfig>)
                    : DEFAULT_WORKLOAD_CONFIG
                const mergedConfig = mergeWorkloadConfig(baseConfig, config)
                const normalized = normalizeWorkloadConfig(mergedConfig)

                await saveWorkloadConfig({
                    workspaceId,
                    config: normalized,
                    now: Date.now(),
                })

                setConfig(normalized)
                setSuccess(true)
                setTimeout(() => setSuccess(false), 2000)
            } catch {
                setError('Failed to save config')
            }
        })
    }

    const handleReset = () => {
        setConfig(DEFAULT_WORKLOAD_CONFIG)
    }

    const updateThresholds = (key: keyof WorkloadConfig['thresholds'], value: number) => {
        if (!config) return
        setConfig({ ...config, thresholds: { ...config.thresholds, [key]: value } })
    }

    const updateStatus = (key: keyof WorkloadConfig['status'], value: number) => {
        if (!config) return
        setConfig({ ...config, status: { ...config.status, [key]: value } })
    }

    const updateWeights = (key: keyof WorkloadConfig['weights'], value: number) => {
        if (!config) return
        setConfig({ ...config, weights: { ...config.weights, [key]: value } })
    }

    const updateCapacity = (key: keyof WorkloadConfig['capacity'], value: number) => {
        if (!config) return
        setConfig({ ...config, capacity: { ...config.capacity, [key]: value } })
    }

    const updateBaseline = (key: keyof WorkloadConfig['baseline'], value: number) => {
        if (!config) return
        setConfig({ ...config, baseline: { ...config.baseline, [key]: value } })
    }

    if ((workspaceId && configRecord === undefined) || !config) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold">Workload Scoring</h2>
                    <p className="text-sm text-muted-foreground">Configure how team member status is computed on the heatmap.</p>
                </div>
                <div className="flex items-center gap-2">
                    {success && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                            <Check className="h-3 w-3" /> Saved
                        </span>
                    )}
                    <Button variant="outline" size="sm" onClick={handleReset} className="h-8">
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        Reset
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={isPending} className="h-8">
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                        Save Changes
                    </Button>
                </div>
            </div>

            {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded">{error}</p>}

            <div className="space-y-3">
                <Section title="Thresholds" description="Define when tasks are considered stuck, overdue soon, etc." defaultOpen>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <Field label="Stuck Days" hint="No activity" value={config.thresholds.stuckDays} onChange={v => updateThresholds('stuckDays', v)} min={1} max={14} />
                        <Field label="Due Soon Days" hint="Warning window" value={config.thresholds.dueSoonDays} onChange={v => updateThresholds('dueSoonDays', v)} min={1} max={14} />
                        <Field label="Review Stale Days" hint="In review" value={config.thresholds.reviewStaleDays} onChange={v => updateThresholds('reviewStaleDays', v)} min={1} max={21} />
                        <Field label="Aging Multiplier" hint="× cycle time" value={config.thresholds.agingMultiplier} onChange={v => updateThresholds('agingMultiplier', v)} min={1} max={5} step={0.1} />
                        <Field label="Progress Lag %" hint="Behind expected" value={config.thresholds.progressLagPercent} onChange={v => updateThresholds('progressLagPercent', v)} min={5} max={80} />
                    </div>
                </Section>

                <Section title="Status Triggers" description="When to mark someone as struggling.">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <Field label="Struggling Score" hint="Risk threshold" value={config.status.strugglingScore} onChange={v => updateStatus('strugglingScore', v)} min={0} max={20} />
                        <Field label="Critical Overdue" hint="Task count" value={config.status.criticalOverdueCount} onChange={v => updateStatus('criticalOverdueCount', v)} min={0} max={10} />
                        <Field label="Critical Help" hint="Help requests" value={config.status.criticalHelpCount} onChange={v => updateStatus('criticalHelpCount', v)} min={0} max={10} />
                        <Field label="Critical Stuck" hint="Stuck tasks" value={config.status.criticalStuckCount} onChange={v => updateStatus('criticalStuckCount', v)} min={0} max={10} />
                    </div>
                </Section>

                <Section title="Scoring Weights" description="How much each risk factor contributes to the workload score.">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <Field label="Overdue" value={config.weights.overdue} onChange={v => updateWeights('overdue', v)} min={0} max={10} />
                        <Field label="Stuck" value={config.weights.stuck} onChange={v => updateWeights('stuck', v)} min={0} max={10} />
                        <Field label="Help Request" value={config.weights.help} onChange={v => updateWeights('help', v)} min={0} max={10} />
                        <Field label="Due Soon" value={config.weights.dueSoon} onChange={v => updateWeights('dueSoon', v)} min={0} max={10} />
                        <Field label="Aging" value={config.weights.age} onChange={v => updateWeights('age', v)} min={0} max={10} />
                        <Field label="Progress Lag" value={config.weights.progress} onChange={v => updateWeights('progress', v)} min={0} max={10} />
                        <Field label="Review Stale" value={config.weights.review} onChange={v => updateWeights('review', v)} min={0} max={10} />
                        <Field label="Load" value={config.weights.load} onChange={v => updateWeights('load', v)} min={0} max={10} />
                    </div>
                </Section>

                <Section title="Capacity" description="How task capacity is calculated per user.">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <Field label="WIP Multiplier" value={config.capacity.wipMultiplier} onChange={v => updateCapacity('wipMultiplier', v)} min={0.5} max={3} step={0.1} />
                        <Field label="Available Ratio" hint="< this = available" value={config.capacity.availableLoadRatio} onChange={v => updateCapacity('availableLoadRatio', v)} min={0.1} max={1} step={0.1} />
                        <Field label="Overload Ratio" hint="> this = overloaded" value={config.capacity.overloadLoadRatio} onChange={v => updateCapacity('overloadLoadRatio', v)} min={1} max={3} step={0.05} />
                        <Field label="Overload Min Tasks" value={config.capacity.overloadMinTasks} onChange={v => updateCapacity('overloadMinTasks', v)} min={1} max={10} />
                    </div>
                </Section>

                <Section title="Baseline" description="Fallback values when user has insufficient history.">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <Field label="Lookback Days" value={config.lookbackDays} onChange={v => setConfig({ ...config, lookbackDays: v })} min={14} max={365} />
                        <Field label="Min Completed Tasks" hint="For baseline calc" value={config.minCompletedTasks} onChange={v => setConfig({ ...config, minCompletedTasks: v })} min={1} max={50} />
                        <Field label="Default Cycle Days" value={config.baseline.defaultCycleDays} onChange={v => updateBaseline('defaultCycleDays', v)} min={1} max={60} />
                        <Field label="Default Throughput/Week" value={config.baseline.defaultThroughputPerWeek} onChange={v => updateBaseline('defaultThroughputPerWeek', v)} min={0.1} max={20} step={0.1} />
                    </div>
                </Section>
            </div>
        </div>
    )
}
