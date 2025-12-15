import { cookies } from 'next/headers'
import prisma from './prisma'

export async function getCurrentUser() {
    try {
        const cookieStore = await cookies()
        const userId = cookieStore.get('user_id')
        const discordUserCookie = cookieStore.get('discord_user')

        // If we have a user ID, fetch from database
        if (userId) {
            const dbUser = await prisma.user.findUnique({
                where: { id: userId.value },
                include: {
                    workspace: true,
                    memberships: {
                        include: {
                            workspace: {
                                include: {
                                    _count: {
                                        select: {
                                            members: true,
                                            projects: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            })

            if (dbUser) {
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
                    interests: dbUser.interests,
                    themePreference: dbUser.themePreference ?? 'system'
                }
            }
        }

        // If we have Discord info but no user ID, user needs to complete onboarding
        if (discordUserCookie) {
            const discordUser = JSON.parse(discordUserCookie.value)
            return {
                id: 'pending',
                name: discordUser.global_name || discordUser.username,
                email: `discord_${discordUser.id}@discord.user`,
                avatar: discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : null,
                role: 'Member' as const,
                discordId: discordUser.id,
                hasOnboarded: false,
                skills: [],
                interests: null
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
