import assert from "node:assert/strict"
import test from "node:test"
import { appendInviteNotice, readInviteNotice } from "@/lib/invite-status"

test("appendInviteNotice appends status and workspace name", () => {
    assert.equal(
        appendInviteNotice("/dashboard", {
            status: "already-member",
            workspaceName: "CuPI Core",
        }),
        "/dashboard?inviteStatus=already-member&inviteWorkspace=CuPI+Core"
    )
})

test("appendInviteNotice preserves existing query strings", () => {
    assert.equal(
        appendInviteNotice("/workspaces?tab=join", { status: "invalid" }),
        "/workspaces?tab=join&inviteStatus=invalid"
    )
})

test("readInviteNotice ignores unknown statuses", () => {
    assert.equal(readInviteNotice({ inviteStatus: "unknown" }), null)
})

test("readInviteNotice normalizes search param objects", () => {
    assert.deepEqual(
        readInviteNotice({
            inviteStatus: ["joined"],
            inviteWorkspace: ["Build Team"],
        }),
        {
            status: "joined",
            workspaceName: "Build Team",
        }
    )
})
