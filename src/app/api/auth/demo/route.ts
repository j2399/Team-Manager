import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import prisma from '@/lib/prisma'
import { createSession, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '@/lib/session'

export async function GET(request: Request) {
    // Disable demo mode in production
    if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_DEMO_MODE) {
        return NextResponse.json({ error: 'Demo mode disabled' }, { status: 403 })
    }

    const url = new URL(request.url)

    try {
        const cookieStore = await cookies()

        // Find or create demo admin user
        let demoUser = await prisma.user.findFirst({
            where: { email: 'demo@cupi.admin' }
        })

        if (!demoUser) {
            demoUser = await prisma.user.create({
                data: {
                    name: 'Demo Admin',
                    email: 'demo@cupi.admin',
                    role: 'Admin',
                    avatar: null
                }
            })
        } else {
            // Always ensure demo user is Admin
            demoUser = await prisma.user.update({
                where: { id: demoUser.id },
                data: { role: 'Admin' }
            })
        }

        const session = await createSession(demoUser.id)

        // Set cookies
        cookieStore.set(SESSION_COOKIE_NAME, session.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: SESSION_TTL_SECONDS,
            path: '/',
        })

        cookieStore.set('discord_user', JSON.stringify({
            id: 'demo',
            username: 'demo_admin',
            discriminator: '0000',
            avatar: null,
            global_name: 'Demo Admin',
        }), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 7,
            path: '/',
        })

        return NextResponse.redirect(new URL('/dashboard', url.origin))
    } catch (error) {
        console.error('Demo login error:', error)
        return NextResponse.redirect(new URL('/?error=demo_failed', url.origin))
    }
}
