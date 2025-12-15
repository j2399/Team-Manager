import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
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
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }



        const { id } = await params
        const body = await request.json()
        const { name, description, leadId, memberIds, color } = body

        const normalizedColor = typeof color === "string"
            ? (color.trim().startsWith("#") ? color.trim().toLowerCase() : `#${color.trim().toLowerCase()}`)
            : null
        const isValidColor = normalizedColor ? /^#([0-9a-f]{6}|[0-9a-f]{3})$/.test(normalizedColor) : false
        const colorUpdate = isValidColor ? { color: normalizedColor as string } : {}

        const project = await prisma.$transaction(async (tx) => {
            const updatedProject = await tx.project.update({
                where: { id },
                data: {
                    ...(name !== undefined && { name }),
                    ...(description !== undefined && { description }),
                    ...(leadId !== undefined && { leadId }),
                    ...colorUpdate
                }
            })

            if (memberIds && Array.isArray(memberIds)) {
                // Replace members
                await tx.projectMember.deleteMany({
                    where: { projectId: id }
                })

                if (memberIds.length > 0) {
                    await tx.projectMember.createMany({
                        data: memberIds.map((userId: string) => ({
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
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        if (user.role !== 'Admin' && user.role !== 'Team Lead') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const { id } = await params

        // Delete in order: tasks -> columns -> boards -> sprints -> whiteboards -> project
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

            // Delete whiteboards
            await tx.whiteboard.deleteMany({
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

