import crypto from "node:crypto"
import { cookies } from "next/headers"
import { api, fetchMutation } from "@/lib/convex/server"

const SESSION_COOKIE_NAME = "session_token"

type CurrentUserRole = "Admin" | "Team Lead" | "Member"

function hashSessionToken(token: string) {
    return crypto.createHash("sha256").update(token).digest("hex")
}

function resolveCurrentUserRole(
    workspaceId: string | null,
    membershipRole: string | null,
    fallbackRole: string
): CurrentUserRole {
    if (!workspaceId) {
        return fallbackRole === "Admin" || fallbackRole === "Team Lead" ? fallbackRole : "Member"
    }

    return membershipRole === "Admin" || membershipRole === "Team Lead" ? membershipRole : "Member"
}

export async function getConvexCurrentUser() {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value

    if (!sessionToken) {
        return null
    }

    const session = await fetchMutation(api.auth.getSessionByTokenHash, {
        tokenHash: hashSessionToken(sessionToken),
    })

    if (!session?.user) {
        return null
    }

    const dbUser = session.user
    const workspaceId = dbUser.workspaceId ?? null
    const activeMembership = workspaceId
        ? dbUser.memberships?.find((membership) => membership.workspaceId === workspaceId) ?? null
        : null
    const membershipRole = activeMembership?.role ?? null

    return {
        id: dbUser.id,
        name: activeMembership?.name || dbUser.name,
        email: dbUser.email,
        avatar: dbUser.avatar ?? null,
        role: resolveCurrentUserRole(workspaceId, membershipRole, dbUser.role),
        workspaceId,
        workspaceName: dbUser.workspace?.name,
        workspace: dbUser.workspace,
        memberships: dbUser.memberships,
        discordId: dbUser.discordId ?? null,
        hasOnboarded: dbUser.hasOnboarded,
        skills: dbUser.skills,
        interests: dbUser.interests ?? null,
    }
}
