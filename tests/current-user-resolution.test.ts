import assert from "node:assert/strict"
import test from "node:test"
import {
    resolveCurrentUserDisplayName,
    resolveCurrentUserRole,
} from "@/lib/current-user-resolution"

const workspaceIds = [null, "workspace-1"] as const
const membershipRoles = [null, "Admin", "Team Lead", "Member", "Owner", "Random"] as const
const fallbackRoles = ["Admin", "Team Lead", "Member", "Owner", "Random"] as const

for (const workspaceId of workspaceIds) {
    for (const membershipRole of membershipRoles) {
        for (const fallbackRole of fallbackRoles) {
            test(`resolveCurrentUserRole workspace=${workspaceId ?? "none"} membership=${membershipRole ?? "none"} fallback=${fallbackRole}`, () => {
                const expected = workspaceId
                    ? (membershipRole === "Admin" || membershipRole === "Team Lead" ? membershipRole : "Member")
                    : (fallbackRole === "Admin" || fallbackRole === "Team Lead" ? fallbackRole : "Member")

                assert.equal(resolveCurrentUserRole(workspaceId, membershipRole, fallbackRole), expected)
            })
        }
    }
}

const membershipNameCases = [
    undefined,
    null,
    "",
    "   ",
    "Ada Lovelace",
    "  Grace Hopper  ",
]

const dbNameCases = [
    "Primary User",
    "Linus Torvalds",
    "Member Name",
]

for (const membershipName of membershipNameCases) {
    for (const dbName of dbNameCases) {
        test(`resolveCurrentUserDisplayName membership=${String(membershipName)} db=${dbName}`, () => {
            const trimmedMembershipName = membershipName?.trim?.()
            const expected = trimmedMembershipName || dbName

            assert.equal(resolveCurrentUserDisplayName(membershipName, dbName), expected)
        })
    }
}

for (const workspaceId of workspaceIds) {
    for (const membershipRole of membershipRoles) {
        for (const fallbackRole of fallbackRoles) {
            for (const membershipName of membershipNameCases) {
                for (const dbName of dbNameCases) {
                    test(`current user identity matrix workspace=${workspaceId ?? "none"} membershipRole=${membershipRole ?? "none"} fallback=${fallbackRole} membershipName=${String(membershipName)} db=${dbName}`, () => {
                        const expectedRole = workspaceId
                            ? (membershipRole === "Admin" || membershipRole === "Team Lead" ? membershipRole : "Member")
                            : (fallbackRole === "Admin" || fallbackRole === "Team Lead" ? fallbackRole : "Member")
                        const expectedName = membershipName?.trim?.() || dbName

                        assert.equal(resolveCurrentUserRole(workspaceId, membershipRole, fallbackRole), expectedRole)
                        assert.equal(resolveCurrentUserDisplayName(membershipName, dbName), expectedName)
                    })
                }
            }
        }
    }
}
