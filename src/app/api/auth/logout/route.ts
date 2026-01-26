import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { deleteSession, SESSION_COOKIE_NAME } from '@/lib/session'

export async function POST() {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)

    if (sessionToken?.value) {
        await deleteSession(sessionToken.value)
    }
    
    // Clear all auth cookies
    cookieStore.delete('discord_user')
    cookieStore.delete('discord_token')
    cookieStore.delete(SESSION_COOKIE_NAME)
    
    return NextResponse.json({ success: true })
}

export async function GET(request: Request) {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)

    if (sessionToken?.value) {
        await deleteSession(sessionToken.value)
    }

    // Clear all auth cookies
    cookieStore.delete('discord_user')
    cookieStore.delete('discord_token')
    cookieStore.delete(SESSION_COOKIE_NAME)

    // Use request URL to determine the correct host
    const url = new URL(request.url)
    return NextResponse.redirect(new URL('/', url.origin))
}



