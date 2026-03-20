"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"

type TimelineGridProps = {
    startDate: Date
    endDate: Date
    height: number
    showToday?: boolean
}

type WeekMarker = {
    date: Date
    pos: number
}

type MonthHeader = {
    month: string
    year: string
    pos: number
    width: number
    showYear: boolean
}

export function TimelineGrid({
    startDate,
    endDate,
    height,
    showToday = true,
}: TimelineGridProps) {
    const startTime = startDate.getTime()
    const endTime = endDate.getTime()
    const totalDuration = endTime - startTime || 1

    const getPosition = (date: Date) => {
        return ((date.getTime() - startTime) / totalDuration) * 100
    }

    const today = new Date()
    const todayPos = getPosition(today)
    const showTodayLine = showToday && todayPos >= 0 && todayPos <= 100

    // Generate week markers (Mondays)
    const weekMarkers = useMemo<WeekMarker[]>(() => {
        const markers: WeekMarker[] = []
        const currentDate = new Date(startDate)
        // Move to first Monday
        while (currentDate.getDay() !== 1) {
            currentDate.setDate(currentDate.getDate() + 1)
        }
        while (currentDate <= endDate) {
            markers.push({
                date: new Date(currentDate),
                pos: getPosition(currentDate)
            })
            currentDate.setDate(currentDate.getDate() + 7)
        }
        return markers
    }, [startDate, endDate])

    // Generate month headers
    const monthHeaders = useMemo<MonthHeader[]>(() => {
        const headers: MonthHeader[] = []
        let currentMonth = new Date(startDate)
        currentMonth.setDate(1)
        let lastYear = -1

        while (currentMonth <= endDate) {
            const monthStart = new Date(Math.max(currentMonth.getTime(), startDate.getTime()))
            const nextMonth = new Date(currentMonth)
            nextMonth.setMonth(nextMonth.getMonth() + 1)
            const monthEnd = new Date(Math.min(nextMonth.getTime() - 1, endDate.getTime()))
            const pos = getPosition(monthStart)
            const endPos = getPosition(monthEnd)
            const year = currentMonth.getFullYear()
            const showYear = year !== lastYear
            lastYear = year
            headers.push({
                month: currentMonth.toLocaleDateString('en-US', { month: 'short' }),
                year: `'${String(year).slice(-2)}`,
                pos,
                width: endPos - pos,
                showYear
            })
            currentMonth = nextMonth
        }
        return headers
    }, [startDate, endDate])

    return (
        <>
            {/* Header with month and week markers */}
            <div className="flex-1 relative h-12 overflow-hidden border-b bg-muted/5">
                {/* Month labels */}
                {monthHeaders.map((month, i) => (
                    <div
                        key={i}
                        className="absolute top-0 h-6 flex items-center gap-1 px-2 text-[10px] font-medium text-muted-foreground border-b border-r border-border/50 bg-muted/30 overflow-hidden"
                        style={{ left: `${month.pos}%`, width: `${month.width}%` }}
                    >
                        <span className="truncate font-semibold">{month.month}</span>
                        {month.showYear && <span className="text-muted-foreground/60 shrink-0">{month.year}</span>}
                    </div>
                ))}
                {/* Week markers with day numbers */}
                <div className="absolute top-6 left-0 right-0 h-6">
                    {weekMarkers.map((marker, i) => (
                        <div
                            key={i}
                            className="absolute top-0 h-full flex items-center text-[9px] text-muted-foreground/70"
                            style={{ left: `${marker.pos}%` }}
                        >
                            <div className="absolute inset-y-0 left-0 w-px bg-border/50" />
                            <span className="pl-1.5 font-medium">{marker.date.getDate()}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Grid lines layer - absolute positioned behind content */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{ top: '48px', height: `${height}px` }}
            >
                {/* Week vertical lines */}
                {weekMarkers.map((marker, i) => (
                    <div
                        key={i}
                        className="absolute top-0 bottom-0 w-px bg-border/30"
                        style={{ left: `${marker.pos}%` }}
                    />
                ))}

            </div>
        </>
    )
}
