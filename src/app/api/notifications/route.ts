import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(request: Request) {
    try {
        const user = await getCurrentUser()

        if (!user || !user.id || user.id === 'pending' || !user.workspaceId) {
            return NextResponse.json({ notifications: [], hasNew: false })
        }

        const { searchParams } = new URL(request.url)
        const since = searchParams.get('since') // ISO timestamp for incremental updates
        const countOnly = searchParams.get('countOnly') === 'true' // Just check for new ones

        const where: any = {
            workspaceId: user.workspaceId,
            OR: [
                { userId: user.id },
                { userId: null }
            ]
        }

        // If countOnly, just check if there are unread notifications
        if (countOnly) {
            const unreadCount = await prisma.notification.count({
                where: { ...where, read: false }
            })
            return NextResponse.json({ unreadCount, hasNew: unreadCount > 0 })
        }

        // If since is provided, only fetch newer notifications
        if (since) {
            where.createdAt = { gt: new Date(since) }
        }

        const notifications = await prisma.notification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 20
        })

        return NextResponse.json({
            notifications,
            hasNew: notifications.length > 0,
            lastCheck: new Date().toISOString()
        })
    } catch (error) {
        console.error('Failed to fetch notifications:', error)
        return NextResponse.json({ notifications: [], hasNew: false })
    }
}

export async function PATCH(request: Request) {
    try {
        const user = await getCurrentUser()

        if (!user || !user.id || user.id === 'pending' || !user.workspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { notificationId, markAllRead } = await request.json()

        if (markAllRead) {
            // Mark all notifications for this user as read
            await prisma.notification.updateMany({
                where: {
                    workspaceId: user.workspaceId,
                    OR: [
                        { userId: user.id },
                        { userId: null }
                    ],
                    read: false
                },
                data: { read: true }
            })
        } else if (notificationId) {
            // Mark single notification as read
            const updated = await prisma.notification.updateMany({
                where: {
                    id: notificationId,
                    workspaceId: user.workspaceId,
                    OR: [
                        { userId: user.id },
                        { userId: null }
                    ]
                },
                data: { read: true }
            })

            if (updated.count === 0) {
                return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
            }
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Failed to update notification:', error)
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    }
}
