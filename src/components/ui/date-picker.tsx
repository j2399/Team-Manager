"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface DatePickerProps {
    value: string
    onChange: (value: string) => void
    min?: string
    id?: string
    className?: string
    placeholder?: string
}

interface DateRangePickerProps {
    startDate: string
    endDate: string
    onChange: (start: string, end: string) => void
    min?: string
    id?: string
    className?: string
    placeholder?: string
    quickActions?: { label: string; days: number }[]
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
]

function DatePicker({ value, onChange, min, id, className, placeholder = "Select date" }: DatePickerProps) {
    const [open, setOpen] = React.useState(false)

    const selectedDate = value ? new Date(value + "T00:00:00") : null
    const minDate = min ? new Date(min + "T00:00:00") : null

    const [viewDate, setViewDate] = React.useState(() => {
        if (selectedDate) return new Date(selectedDate)
        return new Date()
    })

    React.useEffect(() => {
        if (open) {
            if (selectedDate) {
                setViewDate(new Date(selectedDate))
            } else {
                setViewDate(new Date())
            }
        }
    }, [open])

    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()

    const firstDayOfMonth = new Date(year, month, 1)
    const lastDayOfMonth = new Date(year, month + 1, 0)
    const startingDay = firstDayOfMonth.getDay()
    const daysInMonth = lastDayOfMonth.getDate()

    const prevMonth = () => {
        setViewDate(new Date(year, month - 1, 1))
    }

    const nextMonth = () => {
        setViewDate(new Date(year, month + 1, 1))
    }

    const selectDate = (day: number) => {
        const newDate = new Date(year, month, day)
        const formatted = newDate.toISOString().split("T")[0]
        onChange(formatted)
        setOpen(false)
    }

    const isDateDisabled = (day: number) => {
        if (!minDate) return false
        const checkDate = new Date(year, month, day)
        return checkDate < minDate
    }

    const isToday = (day: number) => {
        const today = new Date()
        return (
            day === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear()
        )
    }

    const isSelected = (day: number) => {
        if (!selectedDate) return false
        return (
            day === selectedDate.getDate() &&
            month === selectedDate.getMonth() &&
            year === selectedDate.getFullYear()
        )
    }

    const formatDisplayDate = (dateStr: string) => {
        const date = new Date(dateStr + "T00:00:00")
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
        })
    }

    // Always create 42 cells (6 rows × 7 columns) for consistent height
    const calendarDays: (number | null)[] = []
    for (let i = 0; i < startingDay; i++) {
        calendarDays.push(null)
    }
    for (let day = 1; day <= daysInMonth; day++) {
        calendarDays.push(day)
    }
    // Fill remaining cells to always have 42 total (6 rows)
    while (calendarDays.length < 42) {
        calendarDays.push(null)
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    variant="outline"
                    className={cn(
                        "w-full justify-start text-left font-normal h-9",
                        !value && "text-muted-foreground",
                        className
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
                    {value ? formatDisplayDate(value) : placeholder}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <div className="p-3">
                    <div className="flex items-center justify-between mb-3">
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={prevMonth}
                            className="h-7 w-7"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="font-medium text-sm">
                            {MONTHS[month]} {year}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={nextMonth}
                            className="h-7 w-7"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 mb-1">
                        {DAYS.map((day) => (
                            <div
                                key={day}
                                className="h-8 w-8 flex items-center justify-center text-xs text-muted-foreground font-medium"
                            >
                                {day}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map((day, index) => (
                            <div key={index} className="h-8 w-8">
                                {day !== null && (
                                    <button
                                        type="button"
                                        onClick={() => selectDate(day)}
                                        disabled={isDateDisabled(day)}
                                        className={cn(
                                            "h-8 w-8 rounded-md text-sm font-medium transition-colors",
                                            "hover:bg-accent hover:text-accent-foreground",
                                            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                                            "disabled:pointer-events-none disabled:opacity-30",
                                            isSelected(day) && "bg-primary text-primary-foreground hover:bg-primary/90",
                                            isToday(day) && !isSelected(day) && "border border-primary text-primary",
                                        )}
                                    >
                                        {day}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="mt-3 pt-3 border-t flex justify-between">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                onChange("")
                                setOpen(false)
                            }}
                            className="text-xs h-7 px-2"
                        >
                            Clear
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                const today = new Date().toISOString().split("T")[0]
                                onChange(today)
                                setOpen(false)
                            }}
                            className="text-xs h-7 px-2"
                        >
                            Today
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}

function DateRangePicker({
    startDate,
    endDate,
    onChange,
    min,
    id,
    className,
    placeholder = "Select date range",
    quickActions = []
}: DateRangePickerProps) {
    const [open, setOpen] = React.useState(false)

    const selectedStart = startDate ? new Date(startDate + "T00:00:00") : null
    const selectedEnd = endDate ? new Date(endDate + "T00:00:00") : null
    const minDate = min ? new Date(min + "T00:00:00") : null

    const [viewDate, setViewDate] = React.useState(() => {
        if (selectedStart) return new Date(selectedStart)
        return new Date()
    })

    React.useEffect(() => {
        if (open) {
            if (selectedStart) {
                setViewDate(new Date(selectedStart))
            } else {
                setViewDate(new Date())
            }
        }
    }, [open])

    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()

    const firstDayOfMonth = new Date(year, month, 1)
    const lastDayOfMonth = new Date(year, month + 1, 0)
    const startingDay = firstDayOfMonth.getDay()
    const daysInMonth = lastDayOfMonth.getDate()

    const prevMonth = () => {
        setViewDate(new Date(year, month - 1, 1))
    }

    const nextMonth = () => {
        setViewDate(new Date(year, month + 1, 1))
    }

    const formatDate = (date: Date) => date.toISOString().split("T")[0]

    const selectDate = (day: number) => {
        const clicked = new Date(year, month, day)
        const clickedStr = formatDate(clicked)

        if (!selectedStart || (selectedStart && selectedEnd)) {
            onChange(clickedStr, "")
            return
        }

        if (selectedStart && !selectedEnd) {
            const startTime = selectedStart.getTime()
            const clickedTime = clicked.getTime()
            if (clickedTime < startTime) {
                onChange(clickedStr, formatDate(selectedStart))
            } else {
                onChange(formatDate(selectedStart), clickedStr)
            }
            setOpen(false)
        }
    }

    const isDateDisabled = (day: number) => {
        if (!minDate) return false
        const checkDate = new Date(year, month, day)
        return checkDate < minDate
    }

    const isToday = (day: number) => {
        const today = new Date()
        return (
            day === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear()
        )
    }

    const isSameDay = (a: Date | null, b: Date | null) => {
        if (!a || !b) return false
        return (
            a.getDate() === b.getDate() &&
            a.getMonth() === b.getMonth() &&
            a.getFullYear() === b.getFullYear()
        )
    }

    const isInRange = (day: number) => {
        if (!selectedStart || !selectedEnd) return false
        const checkDate = new Date(year, month, day).getTime()
        return checkDate >= selectedStart.getTime() && checkDate <= selectedEnd.getTime()
    }

    const formatDisplayDate = (dateStr: string) => {
        const date = new Date(dateStr + "T00:00:00")
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
        })
    }

    const formatDisplayRange = () => {
        if (startDate && endDate) {
            return `${formatDisplayDate(startDate)} — ${formatDisplayDate(endDate)}`
        }
        if (startDate) {
            return `${formatDisplayDate(startDate)} — …`
        }
        return placeholder
    }

    // Always create 42 cells (6 rows × 7 columns) for consistent height
    const calendarDays: (number | null)[] = []
    for (let i = 0; i < startingDay; i++) {
        calendarDays.push(null)
    }
    for (let day = 1; day <= daysInMonth; day++) {
        calendarDays.push(day)
    }
    while (calendarDays.length < 42) {
        calendarDays.push(null)
    }

    const applyQuickAction = (days: number) => {
        const base = selectedStart ? new Date(selectedStart) : new Date()
        const start = selectedStart ? formatDate(selectedStart) : formatDate(base)
        const end = new Date(base)
        end.setDate(base.getDate() + days)
        onChange(start, formatDate(end))
        setOpen(false)
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    variant="outline"
                    className={cn(
                        "w-full justify-start text-left font-normal h-9",
                        !startDate && "text-muted-foreground",
                        className
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
                    {formatDisplayRange()}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <div className="p-3">
                    <div className="flex items-center justify-between mb-3">
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={prevMonth}
                            className="h-7 w-7"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="font-medium text-sm">
                            {MONTHS[month]} {year}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={nextMonth}
                            className="h-7 w-7"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 mb-1">
                        {DAYS.map((day) => (
                            <div
                                key={day}
                                className="h-8 w-8 flex items-center justify-center text-xs text-muted-foreground font-medium"
                            >
                                {day}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map((day, index) => {
                            const dateObj = day !== null ? new Date(year, month, day) : null
                            const isStart = isSameDay(dateObj, selectedStart)
                            const isEnd = isSameDay(dateObj, selectedEnd)
                            const inRange = day !== null && isInRange(day)
                            return (
                                <div key={index} className="h-8 w-8">
                                    {day !== null && (
                                        <button
                                            type="button"
                                            onClick={() => selectDate(day)}
                                            disabled={isDateDisabled(day)}
                                            className={cn(
                                                "h-8 w-8 rounded-md text-sm font-medium transition-colors",
                                                "hover:bg-accent hover:text-accent-foreground",
                                                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                                                "disabled:pointer-events-none disabled:opacity-30",
                                                inRange && "bg-primary/15 text-foreground",
                                                (isStart || isEnd) && "bg-primary text-primary-foreground hover:bg-primary/90",
                                                isToday(day) && !isStart && !isEnd && "border border-primary text-primary"
                                            )}
                                        >
                                            {day}
                                        </button>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {quickActions.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {quickActions.map((action) => (
                                <Button
                                    key={action.label}
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-7 px-2"
                                    onClick={() => applyQuickAction(action.days)}
                                >
                                    {action.label}
                                </Button>
                            ))}
                        </div>
                    )}

                    <div className="mt-3 pt-3 border-t flex justify-between">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                onChange("", "")
                                setOpen(false)
                            }}
                            className="text-xs h-7 px-2"
                        >
                            Clear
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                const today = new Date().toISOString().split("T")[0]
                                onChange(today, today)
                                setOpen(false)
                            }}
                            className="text-xs h-7 px-2"
                        >
                            Today
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}

export { DatePicker, DateRangePicker }
