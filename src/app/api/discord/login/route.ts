import { NextResponse } from 'next/server'

export async function GET() {
    const clientId = process.env.DISCORD_CLIENT_ID
    const redirectUri = process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/api/discord/callback'

    if (!clientId) {
        return NextResponse.json({ error: 'Discord Client ID not configured' }, { status: 500 })
    }

    const scope = 'identify email'
    const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`

    return NextResponse.redirect(url)
}

