import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getErrorCode } from '@/lib/errors'

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

        const where = {
            workspaceId: currentUser.workspaceId
        }

        // If role=leads, return only Admin and Team Lead users
        if (role === 'leads') {
            const memberships = await prisma.workspaceMember.findMany({
                where: {
                    ...where,
                    role: { in: ['Admin', 'Team Lead'] }
                },
                select: {
                    userId: true,
                    role: true,
                    name: true,
                    user: { select: { name: true } }
                },
                orderBy: { name: 'asc' },
                ...(page && limit ? { skip: (page - 1) * limit, take: limit } : {})
            })

            const users = memberships.map((membership) => ({
                id: membership.userId,
                name: membership.name || membership.user.name,
                role: membership.role
            }))

            return NextResponse.json(users)
        }

        // Build query with optional pagination
        const [memberships, total] = await Promise.all([
            prisma.workspaceMember.findMany({
                where,
                select: {
                    role: true,
                    name: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            avatar: true,
                            skills: true,
                            interests: true,
                            hasOnboarded: true,
                        }
                    }
                },
                orderBy: { name: 'asc' },
                ...(page && limit ? { skip: (page - 1) * limit, take: limit } : {})
            }),
            // Only count if paginating
            page && limit ? prisma.workspaceMember.count({ where }) : Promise.resolve(null)
        ])

        const users = memberships.map((membership) => ({
            ...membership.user,
            name: membership.name || membership.user.name,
            role: membership.role
        }))

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

        const workspaceId = currentUser.workspaceId

        const user = await prisma.$transaction(async (tx) => {
            const created = await tx.user.create({
                data: {
                    email: email.trim().toLowerCase(),
                    name: name.trim(),
                    role: userRole,
                    workspaceId
                }
            })

            await tx.workspaceMember.create({
                data: {
                    userId: created.id,
                    workspaceId,
                    role: userRole,
                    name: created.name
                }
            })

            return created
        })
        return NextResponse.json(user)
    } catch (error: unknown) {
        // Handle unique constraint violation
        if (getErrorCode(error) === 'P2002') {
            return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
        }
        console.error('[POST /api/users] Error:', error)
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }
}
