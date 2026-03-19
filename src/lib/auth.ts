import { cookies } from "next/headers"
import {
    SESSION_COOKIE_NAME,
    getSession,
    type SessionMembership,
    type SessionWorkspace,
} from "./session"

export type CurrentUserRole = "Admin" | "Team Lead" | "Member"

export type CurrentUser = {
    id: string
    name: string
    email: string
    avatar: string | null
    role: CurrentUserRole
    workspaceId: string | null
    workspaceName: string | undefined
    workspace: SessionWorkspace
    memberships: SessionMembership[]
    discordId: string | null
    hasOnboarded: boolean
    skills: string[]
    interests: string | null
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

export async function getCurrentUser() {
    try {
        const cookieStore = await cookies()
        const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)

        if (!sessionToken) {
            return null
        }

        const session = await getSession(sessionToken.value)
        if (!session?.user) {
            return null
        }

        const dbUser = session.user
        const workspaceId = dbUser.workspaceId || null
        const activeMembership = workspaceId
            ? dbUser.memberships?.find((membership) => membership.workspaceId === workspaceId) ?? null
            : null
        const membershipRole = activeMembership?.role ?? null
        const resolvedRole = resolveCurrentUserRole(workspaceId, membershipRole, dbUser.role)
        const displayName = activeMembership?.name || dbUser.name

        const currentUser: CurrentUser = {
            id: dbUser.id,
            name: displayName,
            email: dbUser.email,
            avatar: dbUser.avatar || null,
            role: resolvedRole,
            workspaceId,
            workspaceName: dbUser.workspace?.name,
            workspace: dbUser.workspace,
            memberships: dbUser.memberships,
            discordId: dbUser.discordId || null,
            hasOnboarded: dbUser.hasOnboarded,
            skills: dbUser.skills,
            interests: dbUser.interests || null,
        }

        return currentUser
    } catch (error) {
        console.error("Failed to get current user:", error)
        return null
    }
}

export async function getCurrentUserRole(): Promise<string> {
    const user = await getCurrentUser()
    return user?.role || "Member"
}

export async function requireAuth() {
    const user = await getCurrentUser()
    if (!user) {
        throw new Error("Not authenticated")
    }
    return user
}
