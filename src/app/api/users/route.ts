import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(request: Request) {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser || !currentUser.workspaceId) {
            return NextResponse.json([])
        }

        const { searchParams } = new URL(request.url)
        const role = searchParams.get('role')

        // Optional pagination parameters (backward compatible - returns all if not specified)
        const pageParam = searchParams.get('page')
        const limitParam = searchParams.get('limit')
        const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : null
        const limit = limitParam ? Math.min(100, Math.max(1, parseInt(limitParam, 10) || 50)) : null

        const where: Record<string, unknown> = {
            workspaceId: currentUser.workspaceId
        }

        // If role=leads, return only Admin and Team Lead users
        if (role === 'leads') {
            where.role = { in: ['Admin', 'Team Lead'] }

            const users = await prisma.user.findMany({
                where,
                select: { id: true, name: true, role: true },
                orderBy: { name: 'asc' },
                ...(page && limit ? { skip: (page - 1) * limit, take: limit } : {})
            })
            return NextResponse.json(users)
        }

        // Build query with optional pagination
        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                include: { subteams: true },
                orderBy: { name: 'asc' },
                ...(page && limit ? { skip: (page - 1) * limit, take: limit } : {})
            }),
            // Only count if paginating
            page && limit ? prisma.user.count({ where }) : Promise.resolve(null)
        ])

        // Return paginated response if pagination params provided
        if (page && limit && total !== null) {
            return NextResponse.json({
                users,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            })
        }

        // Backward compatible: return array directly
        return NextResponse.json(users)
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        // SECURITY: Require authentication
        const currentUser = await getCurrentUser()
        if (!currentUser || !currentUser.workspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // SECURITY: Only Admins can create users
        if (currentUser.role !== 'Admin') {
            return NextResponse.json({ error: 'Forbidden: Only Admins can create users' }, { status: 403 })
        }

        const body = await request.json()
        const { email, name, role } = body

        // Input validation
        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
        }
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 })
        }

        // Validate role - only allow valid roles, and only Admin can create other Admins
        const validRoles = ['Member', 'Team Lead', 'Admin']
        const userRole = role && validRoles.includes(role) ? role : 'Member'

        if (userRole === 'Admin' && currentUser.role !== 'Admin') {
            return NextResponse.json({ error: 'Forbidden: Only Admins can create Admin users' }, { status: 403 })
        }

        const user = await prisma.$transaction(async (tx) => {
            const created = await tx.user.create({
                data: {
                    email: email.trim().toLowerCase(),
                    name: name.trim(),
                    role: userRole,
                    workspaceId: currentUser.workspaceId
                }
            })

            await tx.workspaceMember.create({
                data: {
                    userId: created.id,
                    workspaceId: currentUser.workspaceId,
                    role: userRole,
                    name: created.name
                }
            })

            return created
        })
        return NextResponse.json(user)
    } catch (error: any) {
        // Handle unique constraint violation
        if (error?.code === 'P2002') {
            return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
        }
        console.error('[POST /api/users] Error:', error)
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }
}
