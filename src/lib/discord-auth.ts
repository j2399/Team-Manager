export type PendingWorkspaceFlow = {
    mode: "create" | "join"
    value: string
    username: string
}

export function getDiscordDisplayName(discordUser: {
    username: string
    global_name?: string | null
}) {
    const globalName = discordUser.global_name?.trim()
    return globalName || discordUser.username
}

export function resolvePendingWorkspaceFlow(
    mode: string | null | undefined,
    value: string | null | undefined,
    username: string | null | undefined
): PendingWorkspaceFlow | null {
    const trimmedValue = value?.trim()
    const trimmedUsername = username?.trim()

    if ((mode === "create" || mode === "join") && trimmedValue && trimmedUsername) {
        return {
            mode,
            value: trimmedValue,
            username: trimmedUsername,
        }
    }

    return null
}

export function shouldSyncPendingUserName({
    currentName,
    pendingName,
    shouldSync,
}: {
    currentName: string
    pendingName: string
    shouldSync: boolean
}) {
    const trimmedPendingName = pendingName.trim()
    return shouldSync && Boolean(trimmedPendingName) && trimmedPendingName !== currentName
}

export function buildExistingDiscordUserUpdate({
    existingUserHasOnboarded,
    discordDisplayName,
    discordId,
    avatarUrl,
}: {
    existingUserHasOnboarded: boolean
    discordDisplayName: string
    discordId: string
    avatarUrl: string | null
}) {
    return {
        avatar: avatarUrl,
        discordId,
        hasOnboarded: true as const,
        name: existingUserHasOnboarded ? undefined : discordDisplayName,
        shouldSyncName: !existingUserHasOnboarded,
    }
}
