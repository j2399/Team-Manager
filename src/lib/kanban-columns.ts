type ColumnLike = {
    id: string
    name: string | null | undefined
}

export function normalizeKanbanColumnKey(value: string | null | undefined) {
    if (!value) return ""

    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
}

export function resolveProjectColumnId(
    requestedColumn: string | null | undefined,
    columns: ColumnLike[]
) {
    if (!requestedColumn) return null

    const exactIdMatch = columns.find((column) => column.id === requestedColumn)
    if (exactIdMatch) return exactIdMatch.id

    const requestedKey = normalizeKanbanColumnKey(requestedColumn)
    if (!requestedKey) return null

    const normalizedMatch = columns.find((column) => normalizeKanbanColumnKey(column.name) === requestedKey)
    return normalizedMatch?.id ?? null
}
