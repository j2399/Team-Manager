import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import prisma from '@/lib/prisma'
import { createSession, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '@/lib/session'
import { joinWorkspaceByCode } from '@/lib/workspaceInvites'
import { createWorkspaceForUser } from '@/lib/workspaces'

type PendingWorkspaceFlow = {
    mode: 'create' | 'join'
    value: string
    username: string
}

function getPendingWorkspaceFlow(cookieStore: Awaited<ReturnType<typeof cookies>>): PendingWorkspaceFlow | null {
    const mode = cookieStore.get('pending_mode')?.value
    const value = cookieStore.get('pending_value')?.value?.trim()
    const username = cookieStore.get('pending_username')?.value?.trim()

    if ((mode === 'create' || mode === 'join') && value && username) {
        return { mode, value, username }
    }

    return null
}

function clearPendingWorkspaceFlow(cookieStore: Awaited<ReturnType<typeof cookies>>) {
    cookieStore.delete('pending_mode')
    cookieStore.delete('pending_value')
    cookieStore.delete('pending_username')
}

async function syncPendingUserName(userId: string, currentName: string, pendingName: string, shouldSync: boolean) {
    const trimmedPendingName = pendingName.trim()
    if (!shouldSync || !trimmedPendingName || trimmedPendingName === currentName) {
        return currentName
    }

    await prisma.user.update({
        where: { id: userId },
        data: { name: trimmedPendingName },
    })

    return trimmedPendingName
}

async function applyPendingWorkspaceFlow({
    cookieStore,
    userId,
    currentName,
    shouldSyncName,
}: {
    cookieStore: Awaited<ReturnType<typeof cookies>>
    userId: string
    currentName: string
    shouldSyncName: boolean
}) {
    const pendingInvite = cookieStore.get('pending_invite')?.value?.trim()
    if (pendingInvite) {
        const result = await joinWorkspaceByCode({
            userId,
            userName: currentName,
            code: pendingInvite,
        })
        cookieStore.delete('pending_invite')
        return { redirectToDashboard: !result.error }
    }

    const pendingFlow = getPendingWorkspaceFlow(cookieStore)
    if (!pendingFlow) {
        return { redirectToDashboard: false }
    }

    const effectiveName = await syncPendingUserName(
        userId,
        currentName,
        pendingFlow.username,
        shouldSyncName
    )

    try {
        if (pendingFlow.mode === 'create') {
            await createWorkspaceForUser({
                userId,
                userName: effectiveName,
                workspaceName: pendingFlow.value,
            })
            return { redirectToDashboard: true }
        }

        const result = await joinWorkspaceByCode({
            userId,
            userName: effectiveName,
            code: pendingFlow.value,
        })
        return { redirectToDashboard: !result.error }
    } finally {
        clearPendingWorkspaceFlow(cookieStore)
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')

    if (!code) {
        return NextResponse.redirect(new URL('/?error=no_code', request.url))
    }

    // SECURITY: Verify CSRF state parameter
    const cookieStore = await cookies()
    const storedState = cookieStore.get('oauth_state')?.value

    if (!state || !storedState || state !== storedState) {
        console.error('OAuth state mismatch - possible CSRF attack')
        return NextResponse.redirect(new URL('/?error=invalid_state', request.url))
    }

    // Clear the state cookie after verification
    cookieStore.delete('oauth_state')

    const clientId = process.env.DISCORD_CLIENT_ID
    const clientSecret = process.env.DISCORD_CLIENT_SECRET
    const redirectUri = process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/api/discord/callback'

    if (!clientId || !clientSecret) {
        return NextResponse.redirect(new URL('/?error=not_configured', request.url))
    }

    try {
        // Exchange code for token
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
            }),
        })

        if (!tokenResponse.ok) {
            const error = await tokenResponse.text()
            console.error('Token exchange failed:', error)
            return NextResponse.redirect(new URL('/?error=token_failed', request.url))
        }

        const tokenData = await tokenResponse.json()

        // Get user info from Discord
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })

        if (!userResponse.ok) {
            return NextResponse.redirect(new URL('/?error=user_failed', request.url))
        }

        const discordUser = await userResponse.json()

        // Store Discord info in cookie
        const cookieStore = await cookies()
        const THIRTY_DAYS = 60 * 60 * 24 * 30

        cookieStore.set('discord_user', JSON.stringify({
            id: discordUser.id,
            username: discordUser.username,
            discriminator: discordUser.discriminator,
            avatar: discordUser.avatar,
            global_name: discordUser.global_name,
            email: discordUser.email,
        }), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: THIRTY_DAYS,
            path: '/',
        })

        cookieStore.set('discord_token', tokenData.access_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: tokenData.expires_in, // Keep token expiry as is from provider
            path: '/',
        })

        console.log(`[Auth] Processing login for Discord ID: ${discordUser.id} (${discordUser.username})`)

        // STRATEGY: Find existing user by Discord ID first, then Email.
        let user = await prisma.user.findUnique({
            where: { discordId: discordUser.id },
            include: { workspace: true }
        })

        if (user) {
            console.log(`[Auth] Found existing user by Discord ID. Role: ${user.role}`)
        } else {
            console.log(`[Auth] No user found by Discord ID. Checking email fallback...`)
            // Fallback: Check by email if Discord ID lookup failed (legacy users)
            const email = discordUser.email || `discord_${discordUser.id}@discord.user`
            user = await prisma.user.findFirst({
                where: {
                    OR: [
                        { email: email },
                        { email: `discord_${discordUser.id}@discord.user` }
                    ]
                },
                include: { workspace: true }
            })

            if (user) {
                console.log(`[Auth] Found existing user by Email (${user.email}). Linking Discord ID. Role: ${user.role}`)
            }
        }

        if (user) {
            // EXISTING USER: Login & Skip Onboarding
            const discordDisplayName: string = discordUser.global_name || discordUser.username
            const nextUserData: {
                avatar: string | null
                discordId: string
                hasOnboarded: true
                name?: string
            } = {
                avatar: discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : null,
                discordId: discordUser.id,
                hasOnboarded: true // Auto-onboard returning users
            }

            // Only sync name from Discord if the user hasn't completed onboarding yet.
            // Once a user customizes their name in CuPI, we should not overwrite it on re-login.
            if (!user.hasOnboarded) {
                nextUserData.name = discordDisplayName
            }

            await prisma.user.update({
                where: { id: user.id },
                data: nextUserData
            })

            console.log(`[Auth] Logged in user ${user.id}. Session active.`)

            const session = await createSession(user.id)

            const pendingFlow = await applyPendingWorkspaceFlow({
                cookieStore,
                userId: user.id,
                currentName: nextUserData.name || user.name,
                shouldSyncName: !user.hasOnboarded,
            })

            // Redirect to Workspaces or Dashboard if invite processed
            const response = NextResponse.redirect(
                new URL(pendingFlow.redirectToDashboard ? '/dashboard' : '/workspaces', request.url)
            )

            // Set session cookie on the response
            response.cookies.set(SESSION_COOKIE_NAME, session.token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: SESSION_TTL_SECONDS,
                path: '/',
            })

            return response
        }

        // NEW USER: Create & Go to Onboarding
        console.log(`[Auth] User not found. Creating NEW user.`)
        user = await prisma.$transaction(async (tx) => {
            const userCount = await tx.user.count()
            const role = userCount === 0 ? 'Admin' : 'Member'

            return tx.user.create({
                data: {
                    email: discordUser.email || `discord_${discordUser.id}@discord.user`,
                    name: discordUser.global_name || discordUser.username,
                    avatar: discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : null,
                    discordId: discordUser.id,
                    role,
                    hasOnboarded: false,
                },
                include: { workspace: true }
            })
        })

        console.log(`[Auth] Created new user ${user.id} with role Member.`)

        await applyPendingWorkspaceFlow({
            cookieStore,
            userId: user.id,
            currentName: user.name,
            shouldSyncName: true,
        })

        const response = NextResponse.redirect(new URL('/onboarding', request.url))

        const session = await createSession(user.id)

        response.cookies.set(SESSION_COOKIE_NAME, session.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: SESSION_TTL_SECONDS,
            path: '/',
        })

        return response

    } catch (error) {
        console.error('Discord OAuth error:', error)
        return NextResponse.redirect(new URL('/?error=oauth_error', request.url))
    }
}
