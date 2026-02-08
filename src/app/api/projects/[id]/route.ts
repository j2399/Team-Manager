import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getWorkspaceUserIds } from '@/lib/access'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser()
        if (!user || !user.workspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id } = await params
        const project = await prisma.project.findUnique({
            where: { id },
            include: {
                lead: { select: { id: true, name: true } },
                members: {
                    select: {
                        userId: true,
                        user: { select: { id: true, name: true } }
                    }
                },
                _count: { select: { pushes: true } }
            }
        })

        if (!project) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }

        // Verify project belongs to user's workspace
        if (project.workspaceId !== user.workspaceId) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }

        return NextResponse.json(project)
    } catch (error) {
        console.error('Failed to fetch project:', error)
        return NextResponse.json({ error: 'Failed' }, { status: 500 })
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser()
        if (!user || !user.workspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        // SECURITY: Only Admins and Team Leads can update divisions
        if (user.role !== 'Admin' && user.role !== 'Team Lead') {
            return NextResponse.json({ error: 'Forbidden: Only Admins and Team Leads can update divisions' }, { status: 403 })
        }

        const { id } = await params

        // Verify project exists and belongs to user's workspace
        const existingProject = await prisma.project.findUnique({
            where: { id },
            select: { workspaceId: true }
        })

        if (!existingProject) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }

        if (existingProject.workspaceId !== user.workspaceId) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }

        const body = await request.json()
        const { name, description, leadId, memberIds, color } = body
        const normalizedName = typeof name === 'string' ? name.trim() : undefined
        const normalizedDescription = typeof description === 'string' ? description.trim() : description

        if (name !== undefined && !normalizedName) {
            return NextResponse.json({ error: 'Division name is required' }, { status: 400 })
        }

        const memberIdsInput = Array.isArray(memberIds)
            ? memberIds.filter((id: unknown) => typeof id === 'string' && id.trim().length > 0)
            : undefined
        const uniqueMemberIds = memberIdsInput ? Array.from(new Set(memberIdsInput)) : undefined

        const leadIdValue = leadId === null
            ? null
            : (typeof leadId === 'string' && leadId.trim().length > 0 ? leadId : undefined)

        if (leadId !== undefined && leadIdValue === undefined) {
            return NextResponse.json({ error: 'Invalid division lead' }, { status: 400 })
        }

        if (leadIdValue) {
            const allowedLeadIds = await getWorkspaceUserIds([leadIdValue], user.workspaceId)
            if (allowedLeadIds.length !== 1) {
                return NextResponse.json({ error: 'Division Lead must belong to this workspace' }, { status: 400 })
            }
        }

        const validMemberIds = uniqueMemberIds
            ? await getWorkspaceUserIds(uniqueMemberIds, user.workspaceId)
            : undefined

        if (uniqueMemberIds && validMemberIds && validMemberIds.length !== uniqueMemberIds.length) {
            return NextResponse.json({ error: 'One or more members are not in this workspace' }, { status: 400 })
        }

        const normalizedColor = typeof color === "string"
            ? (color.trim().startsWith("#") ? color.trim().toLowerCase() : `#${color.trim().toLowerCase()}`)
            : null
        const isValidColor = normalizedColor ? /^#([0-9a-f]{6}|[0-9a-f]{3})$/.test(normalizedColor) : false
        const colorUpdate = isValidColor ? { color: normalizedColor as string } : {}

        const project = await prisma.$transaction(async (tx) => {
            const updatedProject = await tx.project.update({
                where: { id },
                data: {
                    ...(name !== undefined && { name: normalizedName }),
                    ...(description !== undefined && { description: normalizedDescription || null }),
                    ...(leadId !== undefined && { leadId: leadIdValue }),
                    ...colorUpdate
                }
            })

            if (validMemberIds) {
                // Replace members
                await tx.projectMember.deleteMany({
                    where: { projectId: id }
                })

                if (validMemberIds.length > 0) {
                    await tx.projectMember.createMany({
                        data: validMemberIds.map((userId: string) => ({
                            projectId: id,
                            userId
                        }))
                    })
                }
            }
            return updatedProject
        })

        return NextResponse.json(project)
    } catch (error) {
        console.error('Failed to update project:', error)
        return NextResponse.json({ error: 'Failed' }, { status: 500 })
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser()
        if (!user || !user.workspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        if (user.role !== 'Admin' && user.role !== 'Team Lead') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const { id } = await params

        // Parse request body for confirmation name
        let confirmName: string | undefined
        try {
            const body = await request.json()
            confirmName = body.confirmName
        } catch {
            // Body might be empty for backwards compatibility
        }

        // Verify project exists and belongs to user's workspace
        const existingProject = await prisma.project.findUnique({
            where: { id },
            select: { workspaceId: true, name: true }
        })

        if (!existingProject) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }

        if (existingProject.workspaceId !== user.workspaceId) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }

        // Verify confirmation name matches (trimmed comparison)
        if (confirmName !== undefined && confirmName.trim() !== existingProject.name.trim()) {
            return NextResponse.json({ error: 'Division name does not match' }, { status: 400 })
        }

        // Delete in order: tasks -> columns -> boards -> pushes -> project
        await prisma.$transaction(async (tx) => {
            // Get all boards for this project
            const boards = await tx.board.findMany({
                where: { projectId: id },
                select: { id: true }
            })
            const boardIds = boards.map(b => b.id)

            // Get all columns for these boards
            const columns = await tx.column.findMany({
                where: { boardId: { in: boardIds } },
                select: { id: true }
            })
            const columnIds = columns.map(c => c.id)

            // Record deletions for sync consumers
            const tasksToDelete = await tx.task.findMany({
                where: {
                    OR: [
                        { columnId: { in: columnIds } },
                        { push: { projectId: id } }
                    ]
                },
                select: { id: true }
            })

            if (tasksToDelete.length > 0) {
                await tx.taskDeletion.createMany({
                    data: tasksToDelete.map((task) => ({
                        taskId: task.id,
                        projectId: id,
                        workspaceId: user.workspaceId!,
                        deletedBy: user.id,
                        deletedByName: user.name || 'Unknown',
                        deletedAt: new Date()
                    })),
                    skipDuplicates: true
                })
            }

            // Delete comments on tasks in these columns
            await tx.comment.deleteMany({
                where: { task: { columnId: { in: columnIds } } }
            })

            // Delete tasks in these columns
            await tx.task.deleteMany({
                where: { columnId: { in: columnIds } }
            })

            // Delete columns
            await tx.column.deleteMany({
                where: { boardId: { in: boardIds } }
            })

            // Delete boards
            await tx.board.deleteMany({
                where: { projectId: id }
            })

            // Delete tasks in pushes
            await tx.task.deleteMany({
                where: { push: { projectId: id } }
            })

            // Delete pushes
            await tx.push.deleteMany({
                where: { projectId: id }
            })

            // Finally delete the project
            await tx.project.delete({
                where: { id }
            })
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Failed to delete project:', error)
        return NextResponse.json({ error: 'Failed' }, { status: 500 })
    }
}
