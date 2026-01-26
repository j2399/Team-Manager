import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import prisma from '@/lib/prisma'
import { getCurrentUser } from "@/lib/auth"

export async function GET() {
    try {
        const user = await getCurrentUser()

        if (user) {
            return NextResponse.json({
                id: user.id,
                name: user.name,
                role: user.role,
                avatar: user.avatar,
                workspaceName: user.workspaceName
            })
        }

        return NextResponse.json({ id: null, name: 'Guest', role: 'Member', avatar: null })
    } catch (error) {
        console.error('Failed to get role:', error)
        return NextResponse.json({ id: null, name: 'Guest', role: 'Member', avatar: null })
    }
}

export async function POST(request: Request) {
    try {
        const currentUser = await getCurrentUser()

        if (!currentUser || !currentUser.id || currentUser.id === 'pending') {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
        }

        // Only admins can change roles
        if (currentUser.role !== 'Admin') {
            return NextResponse.json({ error: 'Only admins can change roles' }, { status: 403 })
        }

        const body = await request.json()
        const { userId, role } = body

        if (!userId) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
        }

        if (!['Admin', 'Team Lead', 'Member'].includes(role)) {
            return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
        }

        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { workspaceId: true, name: true }
        })

        if (!targetUser || !currentUser.workspaceId) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        const workspaceId = currentUser.workspaceId

        const membership = await prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId, workspaceId } },
            select: { id: true }
        })

        if (!membership && targetUser.workspaceId !== workspaceId) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        await prisma.$transaction(async (tx) => {
            if (membership) {
                await tx.workspaceMember.update({
                    where: { userId_workspaceId: { userId, workspaceId } },
                    data: { role }
                })
            } else if (targetUser.workspaceId === workspaceId) {
                await tx.workspaceMember.create({
                    data: {
                        userId,
                        workspaceId,
                        role,
                        name: targetUser.name || 'User'
                    }
                })
            } else {
                throw new Error('User not found')
            }

            if (targetUser.workspaceId === workspaceId) {
                await tx.user.update({
                    where: { id: userId },
                    data: { role }
                })
            }
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Failed to update role:', error)
        return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
    }
}
