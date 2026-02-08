import { NextResponse } from 'next/server'
// Force rebuild
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getWorkspaceUserIds } from '@/lib/access'

const PROJECT_COLORS = [
    "#ef4444", // red
    "#f97316", // orange
    "#f59e0b", // amber
    "#22c55e", // green
    "#14b8a6", // teal
    "#06b6d4", // cyan
    "#3b82f6", // blue
    "#6366f1", // indigo
    "#8b5cf6", // violet
    "#ec4899", // pink
]

const PUSH_COLORS = [
    "#3b82f6", // blue
    "#22c55e", // green
    "#f59e0b", // amber
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#06b6d4", // cyan
    "#f97316", // orange
    "#84cc16", // lime
]

function normalizeHexColor(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    if (!trimmed) return null
    const hex = trimmed.startsWith("#") ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`
    return /^#([0-9a-f]{6}|[0-9a-f]{3})$/.test(hex) ? hex : null
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const includeLead = searchParams.get('includeLead') === 'true'
        const user = await getCurrentUser()
        if (!user || !user.workspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const projects = await prisma.project.findMany({
            where: { workspaceId: user.workspaceId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                description: true,
                color: true,
                createdAt: true,
                leadId: includeLead,
                lead: includeLead ? { select: { id: true, name: true } } : false,
                members: { select: { userId: true, user: { select: { name: true } } } }
            }
        })

        const userOrders = await prisma.projectUserOrder.findMany({
            where: { userId: user.id, projectId: { in: projects.map(p => p.id) } },
            select: { projectId: true, order: true },
        })
        const orderMap = new Map(userOrders.map(o => [o.projectId, o.order]))

        const sorted = [...projects].sort((a, b) => {
            const aOrder = orderMap.get(a.id)
            const bOrder = orderMap.get(b.id)
            const aHas = aOrder !== undefined
            const bHas = bOrder !== undefined
            if (aHas && bHas) return aOrder! - bOrder!
            if (aHas) return -1
            if (bHas) return 1
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })

        return NextResponse.json(sorted)
    } catch (error) {
        console.error('Failed to fetch projects:', error)
        return NextResponse.json([], { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser()

        if (!user || !user.workspaceId) {
            return NextResponse.json({ error: 'Unauthorized or No Workspace' }, { status: 403 })
        }

        if (user.role !== 'Admin') {
            return NextResponse.json({ error: 'Forbidden: Only Admins can create divisions' }, { status: 403 })
        }

        const body = await request.json()
        const { name, description, leadId, memberIds, color, pushes } = body

        if (!name || name.trim().length === 0) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 })
        }

        if (!leadId || leadId === 'none') {
            return NextResponse.json({ error: 'Division Lead is required' }, { status: 400 })
        }

        const memberIdsInput = Array.isArray(memberIds)
            ? memberIds.filter((id: unknown) => typeof id === 'string' && id.trim().length > 0)
            : []
        const uniqueMemberIds = Array.from(new Set(memberIdsInput))

        const userIdsToCheck = [leadId, ...uniqueMemberIds].filter((id) => typeof id === 'string') as string[]
        const allowedUserIds = await getWorkspaceUserIds(userIdsToCheck, user.workspaceId)

        if (!allowedUserIds.includes(leadId)) {
            return NextResponse.json({ error: 'Division Lead must belong to this workspace' }, { status: 400 })
        }

        const validMemberIds = await getWorkspaceUserIds(uniqueMemberIds, user.workspaceId)
        if (validMemberIds.length !== uniqueMemberIds.length) {
            return NextResponse.json({ error: 'One or more members are not in this workspace' }, { status: 400 })
        }

        // Create division with default board and columns
        const project = await prisma.$transaction(async (tx) => {
            const normalizedColor = normalizeHexColor(color)
            const generatedColor = normalizedColor
                ? normalizedColor
                : PROJECT_COLORS[
                (await tx.project.count({ where: { workspaceId: user.workspaceId } })) % PROJECT_COLORS.length
                ]

            const p = await tx.project.create({
                data: {
                    name,
                    description: description || null,
                    color: generatedColor,
                    leadId: leadId || null,
                    workspaceId: user.workspaceId
                }
            })

            // Ensure lead is added as a member
            let uniqueMemberIds = new Set(validMemberIds)
            if (leadId) {
                uniqueMemberIds.add(leadId)
            }

            if (uniqueMemberIds.size > 0) {
                await tx.projectMember.createMany({
                    data: (Array.from(uniqueMemberIds) as string[]).map((userId) => ({
                        projectId: p.id,
                        userId
                    }))
                })
            }

            await tx.board.create({
                data: {
                    name: 'Kanban Board',
                    projectId: p.id,
                    columns: {
                        create: [
                            { name: 'To Do', order: 0 },
                            { name: 'In Progress', order: 1 },
                            { name: 'Review', order: 2 },
                            { name: 'Done', order: 3 },
                        ]
                    }
                }
            })

            // Create pushes if provided
            if (pushes && Array.isArray(pushes) && pushes.length > 0) {
                // First pass: create all pushes and build tempId -> realId mapping
                const tempIdToRealId = new Map<string, string>()

                for (let i = 0; i < pushes.length; i++) {
                    const push = pushes[i]
                    if (push.name && push.startDate) {
                        const createdPush = await tx.push.create({
                            data: {
                                name: push.name,
                                projectId: p.id,
                                startDate: new Date(push.startDate),
                                endDate: push.endDate ? new Date(push.endDate) : null,
                                color: push.color || PUSH_COLORS[i % PUSH_COLORS.length],
                                status: 'Active'
                            }
                        })
                        if (push.tempId) {
                            tempIdToRealId.set(push.tempId, createdPush.id)
                        }
                    }
                }

                // Second pass: update dependencies
                for (const push of pushes) {
                    if (push.dependsOn && push.tempId) {
                        const realId = tempIdToRealId.get(push.tempId)
                        const dependsOnRealId = tempIdToRealId.get(push.dependsOn)
                        if (realId && dependsOnRealId) {
                            await tx.push.update({
                                where: { id: realId },
                                data: { dependsOnId: dependsOnRealId } as any
                            })
                        }
                    }
                }
            }

            return p
        })

        return NextResponse.json(project, { status: 201 })
    } catch (error: any) {
        console.error('[API] Failed to create division:', error)
        if (error.code) console.error('[API] Error Code:', error.code)
        if (error.meta) console.error('[API] Error Meta:', error.meta)

        return NextResponse.json({
            error: error.message || 'Failed to create division',
            details: error.meta || error.code || undefined
        }, { status: 500 })
    }
}
