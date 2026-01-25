// Timeline Editor Types

export type PushDraft = {
    tempId: string
    name: string
    startDate: Date
    endDate: Date | null
    color: string
}

export type TimelineViewRange = {
    start: Date
    end: Date
}

export type DragType = 'move' | 'resize-start' | 'resize-end' | null

export type DragState = {
    pushId: string
    dragType: DragType
    startX: number
    originalStartDate: Date
    originalEndDate: Date | null
} | null

export type TimelineEditorProps = {
    pushes: PushDraft[]
    onPushesChange: (pushes: PushDraft[]) => void
    viewRange?: TimelineViewRange
    onViewRangeChange?: (range: TimelineViewRange) => void
    minDate?: Date
    maxDate?: Date
    readOnly?: boolean
}

export type TimelineBarProps = {
    push: PushDraft
    dayWidth: number
    startDate: Date
    onUpdate: (id: string, updates: Partial<PushDraft>) => void
    onDelete: (id: string) => void
    onSelect: (id: string | null) => void
    isSelected: boolean
    readOnly?: boolean
}

export type TimelineGridProps = {
    startDate: Date
    endDate: Date
    dayWidth: number
    height: number
}

// Push colors matching the server-side colors
export const PUSH_COLORS = [
    "#3b82f6", // blue
    "#22c55e", // green
    "#f59e0b", // amber
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#06b6d4", // cyan
    "#f97316", // orange
    "#84cc16", // lime
] as const

export function getNextPushColor(existingCount: number): string {
    return PUSH_COLORS[existingCount % PUSH_COLORS.length]
}

export function generateTempId(): string {
    return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// Date utilities
export function startOfDay(date: Date): Date {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d
}

export function addDays(date: Date, days: number): Date {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    return d
}

export function differenceInDays(date1: Date, date2: Date): number {
    const d1 = startOfDay(date1)
    const d2 = startOfDay(date2)
    return Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24))
}

export function formatDateShort(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatDateISO(date: Date): string {
    return date.toISOString().split('T')[0]
}
