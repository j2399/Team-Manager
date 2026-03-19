import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { getAppBaseUrl, getDiscordRedirectUri } from '@/lib/appUrl'

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

    const redirectUri = getDiscordRedirectUri(request.url)

    if (!clientId) {
        return NextResponse.json({ error: 'Discord Client ID not configured' }, { status: 500 })
    }

    // SECURITY: Generate cryptographically secure state for CSRF protection
    const state = crypto.randomBytes(18).toString('base64url')

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
    const url = new URL('https://discord.com/oauth2/authorize')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', scope)
    url.searchParams.set('state', state)

    return NextResponse.redirect(url)
}
