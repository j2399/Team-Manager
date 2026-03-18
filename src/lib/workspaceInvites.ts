import { api, createLegacyId, fetchMutation } from "@/lib/convex/server"

type JoinWorkspaceResult = {
    success?: true
    workspaceId?: string
    workspaceName?: string
    alreadyMember?: boolean
    message?: string
    error?: string
}

export async function joinWorkspaceByCode({
    userId,
    userName,
    code,
}: {
    userId: string
    userName: string
    code: string
}): Promise<JoinWorkspaceResult> {
    const trimmed = code.trim()
    if (!trimmed) return { error: "Invite code is required" }

    return fetchMutation(api.workspaces.joinWorkspaceByCode, {
        userId,
        userName,
        code: trimmed,
        membershipId: createLegacyId("workspace_member"),
        notificationId: createLegacyId("notification"),
        now: Date.now(),
    })
}
