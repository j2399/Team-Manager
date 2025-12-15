import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// DEBUG ONLY - Remove in production
export async function POST(req: NextRequest) {
    try {
        const { role } = await req.json()
        
        if (!role || !['Admin', 'Team Lead', 'Member'].includes(role)) {
            return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
        }

        // Update the admin user's role (the user we use for testing)
        const user = await prisma.user.findFirst({
            where: { email: 'admin@cornell.edu' }
        })

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { role }
        })

        return NextResponse.json({ success: true, role })
    } catch (error) {
        console.error('Debug change role error:', error)
        return NextResponse.json({ error: 'Failed to change role' }, { status: 500 })
    }
}



