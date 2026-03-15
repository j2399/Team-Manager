import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
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

        const where: Prisma.NotificationWhereInput = {
            workspaceId: user.workspaceId,
            OR: [
                { userId: user.id },
                { userId: null }
            ]
        }

        // If countOnly, just check if there are unread notifications
        if (countOnly) {
            const [directUnreadCount, broadcastUnreadCount] = await Promise.all([
                prisma.notification.count({
                    where: {
                        workspaceId: user.workspaceId,
                        userId: user.id,
                        read: false,
                    }
                }),
                prisma.notification.count({
                    where: {
                        workspaceId: user.workspaceId,
                        userId: null,
                        reads: {
                            none: { userId: user.id }
                        }
                    }
                })
            ])

            const unreadCount = directUnreadCount + broadcastUnreadCount
            return NextResponse.json({ unreadCount, hasNew: unreadCount > 0 })
        }

        // If since is provided, only fetch newer notifications
        if (since) {
            where.createdAt = { gt: new Date(since) }
        }

        const notifications = await prisma.notification.findMany({
            where,
            include: {
                reads: {
                    where: { userId: user.id },
                    select: { id: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 20
        })

        const serializedNotifications = notifications.map((notification) => ({
            ...notification,
            read: notification.userId === null ? notification.reads.length > 0 : notification.read,
            reads: undefined
        }))

        return NextResponse.json({
            notifications: serializedNotifications,
            hasNew: serializedNotifications.length > 0,
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
            const broadcastNotifications = await prisma.notification.findMany({
                where: {
                    workspaceId: user.workspaceId,
                    userId: null,
                    reads: {
                        none: { userId: user.id }
                    }
                },
                select: { id: true }
            })

            await prisma.$transaction([
                prisma.notification.updateMany({
                    where: {
                        workspaceId: user.workspaceId,
                        userId: user.id,
                        read: false
                    },
                    data: { read: true }
                }),
                ...(broadcastNotifications.length > 0
                    ? [
                        prisma.notificationRead.createMany({
                            data: broadcastNotifications.map((notification) => ({
                                notificationId: notification.id,
                                userId: user.id,
                            })),
                            skipDuplicates: true,
                        })
                    ]
                    : [])
            ])
        } else if (notificationId) {
            const notification = await prisma.notification.findFirst({
                where: {
                    id: notificationId,
                    workspaceId: user.workspaceId,
                    OR: [{ userId: user.id }, { userId: null }]
                },
                select: { id: true, userId: true }
            })

            if (!notification) {
                return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
            }

            if (notification.userId === null) {
                await prisma.notificationRead.createMany({
                    data: [{ notificationId: notification.id, userId: user.id }],
                    skipDuplicates: true,
                })
            } else {
                await prisma.notification.update({
                    where: { id: notification.id },
                    data: { read: true }
                })
            }
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Failed to update notification:', error)
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    }
}
