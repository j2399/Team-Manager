import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
    const cookieStore = await cookies()
    
    // Clear all auth cookies
    cookieStore.delete('discord_user')
    cookieStore.delete('discord_token')
    cookieStore.delete('user_id')
    
    return NextResponse.json({ success: true })
}

export async function GET() {
    const cookieStore = await cookies()
    
    // Clear all auth cookies
    cookieStore.delete('discord_user')
    cookieStore.delete('discord_token')
    cookieStore.delete('user_id')
    
    return NextResponse.redirect(new URL('/', 'http://localhost:3000'))
}



