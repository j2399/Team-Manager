import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
    const cookieStore = await cookies()
    const discordUser = cookieStore.get('discord_user')
    
    if (!discordUser) {
        return NextResponse.json({ user: null })
    }
    
    try {
        const user = JSON.parse(discordUser.value)
        return NextResponse.json({ user })
    } catch {
        return NextResponse.json({ user: null })
    }
}

export async function DELETE() {
    const cookieStore = await cookies()
    cookieStore.delete('discord_user')
    cookieStore.delete('discord_token')
    return NextResponse.json({ success: true })
}



