import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import prisma from '@/lib/prisma'

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies()
        const discordUserCookie = cookieStore.get('discord_user')

        if (!discordUserCookie) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
        }

        const discordUser = JSON.parse(discordUserCookie.value)
        const body = await request.json()
        const { name, skills, interests } = body

        if (!name || name.trim().length === 0) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 })
        }

        // Check if user exists in database
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { discordId: discordUser.id },
                    { email: discordUser.email || `discord_${discordUser.id}@discord.user` },
                    { email: `discord_${discordUser.id}@discord.user` }
                ]
            }
        })

        if (existingUser) {
            // User already exists, just update and return
            // Ensure we update onboarding fields if they are providing them
            await prisma.user.update({
                where: { id: existingUser.id },
                data: {
                    name: name.trim(),
                    skills: skills || [],
                    interests: interests || null,
                    hasOnboarded: true
                }
            })

            cookieStore.set('user_id', existingUser.id, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 60 * 60 * 24 * 7,
                path: '/',
            })
            return NextResponse.json({ success: true, userId: existingUser.id })
        }

        // Create new user
        // First user is Admin, others are Members
        const userCount = await prisma.user.count()
        let role = userCount === 0 ? 'Admin' : 'Member'

        const user = await prisma.user.create({
            data: {
                name: name.trim(),
                email: `discord_${discordUser.id}@discord.user`,
                avatar: discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : null,
                discordId: discordUser.id,
                role: role,
                skills: skills || [],
                interests: interests || null,
                hasOnboarded: true
            }
        })

        // Store user ID in cookie
        cookieStore.set('user_id', user.id, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 7,
            path: '/',
        })

        return NextResponse.json({ success: true, userId: user.id })
    } catch (error) {
        console.error('Registration error:', error)
        return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
    }
}
