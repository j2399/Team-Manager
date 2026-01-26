import { cookies } from 'next/headers'
import { SESSION_COOKIE_NAME, getSession } from './session'

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
            return {
                id: dbUser.id,
                name: dbUser.name,
                email: dbUser.email,
                avatar: dbUser.avatar,
                role: dbUser.role as 'Admin' | 'Team Lead' | 'Member',
                workspaceId: dbUser.workspaceId,
                workspaceName: dbUser.workspace?.name,
                workspace: dbUser.workspace,
                memberships: dbUser.memberships,
                discordId: dbUser.discordId,
                hasOnboarded: dbUser.hasOnboarded,
                skills: dbUser.skills,
                interests: dbUser.interests
            }
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
