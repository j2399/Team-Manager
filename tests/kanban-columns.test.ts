import assert from "node:assert/strict"
import test from "node:test"

import { normalizeKanbanColumnKey, resolveProjectColumnId } from "@/lib/kanban-columns"

test("normalizeKanbanColumnKey collapses formatting differences", () => {
    assert.equal(normalizeKanbanColumnKey("To Do"), "todo")
    assert.equal(normalizeKanbanColumnKey("In Progress"), "inprogress")
    assert.equal(normalizeKanbanColumnKey(" review "), "review")
})

test("resolveProjectColumnId keeps exact legacy ids", () => {
    const columns = [
        { id: "column_todo", name: "To Do" },
        { id: "column_review", name: "Review" },
    ]

    assert.equal(resolveProjectColumnId("column_review", columns), "column_review")
})

test("resolveProjectColumnId maps personal board column keys to project columns", () => {
    const columns = [
        { id: "column_todo", name: "To Do" },
        { id: "column_progress", name: "In Progress" },
        { id: "column_review", name: "Review" },
        { id: "column_done", name: "Done" },
    ]

    assert.equal(resolveProjectColumnId("todo", columns), "column_todo")
    assert.equal(resolveProjectColumnId("inprogress", columns), "column_progress")
    assert.equal(resolveProjectColumnId("review", columns), "column_review")
    assert.equal(resolveProjectColumnId("done", columns), "column_done")
})

test("resolveProjectColumnId also handles Todo vs To Do naming", () => {
    const columns = [{ id: "column_todo", name: "Todo" }]

    assert.equal(resolveProjectColumnId("To Do", columns), "column_todo")
})
