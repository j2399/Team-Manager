import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'

export async function GET(request: Request) {
    const clientId = process.env.DISCORD_CLIENT_ID
    const { origin } = new URL(request.url)
    const redirectUri = `${origin}/api/discord/callback`

    if (!clientId) {
        return NextResponse.json({ error: 'Discord Client ID not configured' }, { status: 500 })
    }

    // SECURITY: Generate cryptographically secure state for CSRF protection
    const state = crypto.randomBytes(32).toString('hex')

    // Store state in HTTP-only cookie for verification on callback
    const cookieStore = await cookies()
    cookieStore.set('oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 10, // 10 minutes
        path: '/',
    })

    const scope = 'identify email'
    const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`

    return NextResponse.redirect(url)
}


