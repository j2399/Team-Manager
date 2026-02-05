"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { DashboardHeatmap } from "./DashboardHeatmap"

type HeatmapResponse = {
    userStats: any[]
    criticalIssues: any[]
    overloadedUsers: any[]
    idleUsers: any[]
    allTasks: any[]
    projects: any[]
}

export function DashboardHeatmapLoader() {
    const [data, setData] = useState<HeatmapResponse | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        const load = async () => {
            try {
                const res = await fetch("/api/workload/heatmap")
                const payload = await res.json()
                if (!res.ok) throw new Error(payload?.error || "Failed to load heatmap")
                if (!cancelled) setData(payload)
            } catch {
                if (!cancelled) setData(null)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        load()
        return () => {
            cancelled = true
        }
    }, [])

    if (loading) {
        return (
            <section className="border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading work distribution…
                </div>
            </section>
        )
    }

    if (!data || !Array.isArray(data.userStats) || data.userStats.length === 0) {
        return null
    }

    return (
        <DashboardHeatmap
            userStats={data.userStats}
            criticalIssues={data.criticalIssues}
            overloadedUsers={data.overloadedUsers}
            idleUsers={data.idleUsers}
            allTasks={data.allTasks}
            projects={data.projects}
        />
    )
}
