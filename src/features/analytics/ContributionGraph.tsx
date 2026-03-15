"use client"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface ContributionGraphProps {
    data: { updatedAt: Date }[]
}

export function ContributionGraph({ data }: ContributionGraphProps) {
    const days = 365
    const endDate = new Date()

    const activityMap = new Map<string, number>()
    data.forEach(item => {
        const dateStr = new Date(item.updatedAt).toISOString().split('T')[0]
        activityMap.set(dateStr, (activityMap.get(dateStr) || 0) + 1)
    })

    const contributions = Array.from({ length: days }).map((_, i) => {
        const d = new Date(endDate)
        d.setDate(endDate.getDate() - (days - i))
        const dateStr = d.toISOString().split('T')[0]
        return {
            date: dateStr,
            count: activityMap.get(dateStr) || 0
        }
    })

    const intensityColor = (count: number) => {
        if (count === 0) return "bg-muted"
        if (count === 1) return "bg-green-200"
        if (count === 2) return "bg-green-400"
        if (count === 3) return "bg-green-600"
        return "bg-green-800"
    }

    return (
        <div className="flex flex-wrap gap-1 max-w-full overflow-hidden">
            <TooltipProvider>
                {contributions.map((day, i) => (
                    <Tooltip key={i}>
                        <TooltipTrigger asChild>
                            <div className={`w-2 h-2 rounded-sm ${intensityColor(day.count)}`} />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p className="text-xs">{day.date}: {day.count} contributions</p>
                        </TooltipContent>
                    </Tooltip>
                ))}
            </TooltipProvider>
        </div>
    )
}
