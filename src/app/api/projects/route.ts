import { NextResponse } from 'next/server'
// Force rebuild
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

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
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        // Show projects if:
        // 1. In user's workspace
        // 2. User is a member
        // 3. User is the lead
        let whereClause: any = {
            OR: [
                { workspaceId: user.workspaceId },
                { members: { some: { userId: user.id } } },
                { leadId: user.id }
            ]
        }

        const projects = await prisma.project.findMany({
            where: whereClause,
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

        const body = await request.json()
        const { name, description, leadId, memberIds, color } = body

        if (!name || name.trim().length === 0) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 })
        }

        if (!leadId || leadId === 'none') {
            return NextResponse.json({ error: 'Project Lead is required' }, { status: 400 })
        }

        // Create project with default board and columns
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
            let uniqueMemberIds = new Set(memberIds || [])
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
            return p
        })

        return NextResponse.json(project, { status: 201 })
    } catch (error: any) {
        console.error('[API] Failed to create project:', error)
        return NextResponse.json({ error: error.message || 'Failed to create project' }, { status: 500 })
    }
}
