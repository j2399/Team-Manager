import assert from "node:assert/strict"
import test from "node:test"
import {
    getPrimaryProjectLeadId,
    mapProjectLeadUsers,
    mergeProjectMemberIds,
    parseProjectLeadPayload,
} from "@/lib/project-leads"

test("parseProjectLeadPayload normalizes leadIds arrays", () => {
    assert.deepEqual(
        parseProjectLeadPayload({
            leadIds: [" lead-1 ", "", "none", "lead-2", "lead-1", 123],
        }),
        {
            provided: true,
            leadIds: ["lead-1", "lead-2"],
        }
    )
})

test("parseProjectLeadPayload supports nullable legacy leadId clears", () => {
    assert.deepEqual(
        parseProjectLeadPayload({ leadId: null }),
        {
            provided: true,
            leadIds: [],
        }
    )
})

test("getPrimaryProjectLeadId returns the first lead or null", () => {
    assert.equal(getPrimaryProjectLeadId(["lead-1", "lead-2"]), "lead-1")
    assert.equal(getPrimaryProjectLeadId([]), null)
})

test("mergeProjectMemberIds keeps existing members and always includes leads once", () => {
    assert.deepEqual(
        mergeProjectMemberIds(["member-1", "lead-1", "member-2"], ["lead-1", "lead-2"]),
        ["member-1", "lead-1", "member-2", "lead-2"]
    )
})

test("mapProjectLeadUsers returns users from assignments and handles empty input", () => {
    assert.deepEqual(
        mapProjectLeadUsers([{ user: { id: "lead-1" } }, { user: { id: "lead-2" } }]),
        [{ id: "lead-1" }, { id: "lead-2" }]
    )
    assert.deepEqual(mapProjectLeadUsers(undefined), [])
})
