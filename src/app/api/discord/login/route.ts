import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { getAppBaseUrl, resolveAppBaseUrl } from '@/lib/appUrl'

export async function GET(request: Request) {
    const clientId = process.env.DISCORD_CLIENT_ID
    const requestUrl = new URL(request.url)
    const configuredBaseUrl = getAppBaseUrl()

    if (configuredBaseUrl) {
        const canonicalLoginUrl = new URL(
            `${requestUrl.pathname}${requestUrl.search}`,
            configuredBaseUrl
        )

        if (canonicalLoginUrl.origin !== requestUrl.origin) {
            return NextResponse.redirect(canonicalLoginUrl)
        }
    }

    const appBaseUrl = resolveAppBaseUrl(request.url)
    const redirectUri = new URL('/api/discord/callback', appBaseUrl).toString()

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
    cookieStore.set('oauth_redirect_uri', redirectUri, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 10,
        path: '/',
    })

    const scope = 'identify email'
    const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`

    return NextResponse.redirect(url)
}

