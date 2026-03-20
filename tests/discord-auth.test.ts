import assert from "node:assert/strict"
import test from "node:test"
import {
    buildExistingDiscordUserUpdate,
    getDiscordDisplayName,
    resolvePendingWorkspaceFlow,
    shouldSyncPendingUserName,
} from "@/lib/discord-auth"

const discordDisplayCases = [
    { username: "cupi_member", global_name: undefined, expected: "cupi_member" },
    { username: "cupi_member", global_name: null, expected: "cupi_member" },
    { username: "cupi_member", global_name: "", expected: "cupi_member" },
    { username: "cupi_member", global_name: "   ", expected: "cupi_member" },
    { username: "cupi_member", global_name: "Andre Boufama", expected: "Andre Boufama" },
    { username: "cupi_member", global_name: "  Ada Lovelace  ", expected: "Ada Lovelace" },
]

for (const testCase of discordDisplayCases) {
    test(`getDiscordDisplayName username=${testCase.username} global=${String(testCase.global_name)}`, () => {
        assert.equal(
            getDiscordDisplayName({
                username: testCase.username,
                global_name: testCase.global_name,
            }),
            testCase.expected
        )
    })
}

const pendingModes = [undefined, null, "", "create", "join", "invalid"] as const
const pendingValues = [undefined, null, "", "   ", "ATLAS7", " workspace-id "] as const
const pendingUsernames = [undefined, null, "", "   ", "Ada Lovelace", "  Grace Hopper  "] as const

for (const mode of pendingModes) {
    for (const value of pendingValues) {
        for (const username of pendingUsernames) {
            test(`resolvePendingWorkspaceFlow mode=${String(mode)} value=${String(value)} username=${String(username)}`, () => {
                const result = resolvePendingWorkspaceFlow(mode, value, username)
                const trimmedValue = value?.trim?.()
                const trimmedUsername = username?.trim?.()
                const isValid = (mode === "create" || mode === "join") && Boolean(trimmedValue) && Boolean(trimmedUsername)

                if (!isValid) {
                    assert.equal(result, null)
                    return
                }

                assert.deepEqual(result, {
                    mode,
                    value: trimmedValue,
                    username: trimmedUsername,
                })
            })
        }
    }
}

const syncFlags = [true, false] as const
const currentNames = ["Ada Lovelace", "Grace Hopper", "", "Preview Member"] as const
const pendingNames = ["Ada Lovelace", "  Ada Lovelace  ", "New Name", "  New Name  ", "", "   "] as const

for (const shouldSync of syncFlags) {
    for (const currentName of currentNames) {
        for (const pendingName of pendingNames) {
            test(`shouldSyncPendingUserName shouldSync=${shouldSync} current=${JSON.stringify(currentName)} pending=${JSON.stringify(pendingName)}`, () => {
                const trimmedPendingName = pendingName.trim()
                const expected = shouldSync && Boolean(trimmedPendingName) && trimmedPendingName !== currentName

                assert.equal(
                    shouldSyncPendingUserName({ currentName, pendingName, shouldSync }),
                    expected
                )
            })
        }
    }
}

const onboardedCases = [true, false] as const
const avatarCases = [null, "https://cdn.discordapp.com/avatar.png"] as const
const displayNameCases = ["cupi_member", "Andre Boufama", "Ada Lovelace"] as const

for (const existingUserHasOnboarded of onboardedCases) {
    for (const avatarUrl of avatarCases) {
        for (const discordDisplayName of displayNameCases) {
            test(`buildExistingDiscordUserUpdate onboarded=${existingUserHasOnboarded} avatar=${avatarUrl ? "yes" : "no"} display=${discordDisplayName}`, () => {
                const result = buildExistingDiscordUserUpdate({
                    existingUserHasOnboarded,
                    discordDisplayName,
                    discordId: "discord-user-1",
                    avatarUrl,
                })

                assert.deepEqual(result, {
                    avatar: avatarUrl,
                    discordId: "discord-user-1",
                    hasOnboarded: true,
                    name: existingUserHasOnboarded ? undefined : discordDisplayName,
                    shouldSyncName: !existingUserHasOnboarded,
                })
            })
        }
    }
}
