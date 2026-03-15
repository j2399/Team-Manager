import { cookies } from 'next/headers'
import { SESSION_COOKIE_NAME, getSession } from './session'

export type CurrentUserRole = 'Admin' | 'Team Lead' | 'Member'

export type CurrentUser = {
    id: string
    name: string
    email: string
    avatar: string | null
    role: CurrentUserRole
    workspaceId: string | null
    workspaceName: string | undefined
    workspace: NonNullable<Awaited<ReturnType<typeof getSession>>>['user']['workspace']
    memberships: NonNullable<Awaited<ReturnType<typeof getSession>>>['user']['memberships']
    discordId: string | null
    hasOnboarded: boolean
    skills: string[]
    interests: string | null
}

function resolveCurrentUserRole(workspaceId: string | null, membershipRole: string | null, fallbackRole: string): CurrentUserRole {
    if (!workspaceId) {
        return fallbackRole === 'Admin' || fallbackRole === 'Team Lead' ? fallbackRole : 'Member'
    }

    return membershipRole === 'Admin' || membershipRole === 'Team Lead' ? membershipRole : 'Member'
}

export async function getCurrentUser() {
    try {
        const cookieStore = await cookies()
        const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)

        if (!sessionToken) {
            return null
        }

        const session = await getSession(sessionToken.value)

        if (session?.user) {
            const dbUser = session.user
            const workspaceId = dbUser.workspaceId
            const membershipRole = workspaceId
                ? dbUser.memberships?.find((membership) => membership.workspaceId === workspaceId)?.role
                : null
            const resolvedRole = resolveCurrentUserRole(workspaceId, membershipRole ?? null, dbUser.role)

            const currentUser: CurrentUser = {
                id: dbUser.id,
                name: dbUser.name,
                email: dbUser.email,
                avatar: dbUser.avatar || null,
                role: resolvedRole,
                workspaceId: workspaceId || null,
                workspaceName: dbUser.workspace?.name,
                workspace: dbUser.workspace,
                memberships: dbUser.memberships,
                discordId: dbUser.discordId || null,
                hasOnboarded: dbUser.hasOnboarded,
                skills: dbUser.skills,
                interests: dbUser.interests
            }

            return currentUser
        }

        // No session - return null
        return null
    } catch (error) {
        console.error('Failed to get current user:', error)
        return null
    }
}

export async function getCurrentUserRole(): Promise<string> {
    const user = await getCurrentUser()
    return user?.role || 'Member'
}

export async function requireAuth() {
    const user = await getCurrentUser()
    if (!user) {
        throw new Error('Not authenticated')
    }
    return user
}
