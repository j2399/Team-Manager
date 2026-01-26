import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getTaskContext } from '@/lib/access'

// GET - Fetch all checklist items for a task
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const user = await getCurrentUser()

        if (!user || !user.workspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const taskContext = await getTaskContext(id)
        if (!taskContext || taskContext.workspaceId !== user.workspaceId) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 })
        }

        const items = await prisma.taskChecklistItem.findMany({
            where: { taskId: id },
            orderBy: { order: 'asc' }
        })
        return NextResponse.json(items)
    } catch (error) {
        console.error('Failed to fetch checklist:', error)
        return NextResponse.json([], { status: 200 })
    }
}

// POST - Create a new checklist item
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const user = await getCurrentUser()

        if (!user || !user.id || user.id === 'pending') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
        }

        if (!user.workspaceId) {
            return NextResponse.json({ error: 'No workspace' }, { status: 403 })
        }

        const taskContext = await getTaskContext(id)
        if (!taskContext || taskContext.workspaceId !== user.workspaceId) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 })
        }

        const body = await request.json()
        const { content } = body

        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 })
        }

        // Get max order
        const maxOrder = await prisma.taskChecklistItem.aggregate({
            where: { taskId: id },
            _max: { order: true }
        })

        const item = await prisma.taskChecklistItem.create({
            data: {
                taskId: id,
                content: content.trim(),
                order: (maxOrder._max.order ?? -1) + 1,
                createdBy: user.id
            }
        })

        // Log activity
        await prisma.activityLog.create({
            data: {
                taskId: id,
                taskTitle: taskContext.title || 'Untitled Task',
                action: 'updated',
                field: 'checklist',
                oldValue: null,
                newValue: content.trim(),
                changedBy: user.id,
                changedByName: user.name || 'User',
                details: `Added checklist item: "${content.trim()}"`
            }
        })

        return NextResponse.json(item, { status: 201 })
    } catch (error) {
        console.error('Failed to create checklist item:', error)
        return NextResponse.json({ error: 'Failed to create checklist item' }, { status: 500 })
    }
}

// PATCH - Update checklist item (toggle completion or reorder)
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const user = await getCurrentUser()

        if (!user || !user.id || user.id === 'pending') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
        }

        if (!user.workspaceId) {
            return NextResponse.json({ error: 'No workspace' }, { status: 403 })
        }

        const taskContext = await getTaskContext(id)
        if (!taskContext || taskContext.workspaceId !== user.workspaceId) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 })
        }

        const body = await request.json()
        const { itemId, completed, content, reorder } = body

        // Handle reordering
        if (reorder && Array.isArray(reorder)) {
            await Promise.all(
                reorder.map((itemId: string, index: number) =>
                    prisma.taskChecklistItem.updateMany({
                        where: { id: itemId, taskId: id },
                        data: { order: index }
                    })
                )
            )
            return NextResponse.json({ success: true })
        }

        if (!itemId) {
            return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
        }

        // Verify item exists and belongs to task
        const item = await prisma.taskChecklistItem.findUnique({
            where: { id: itemId }
        })

        if (!item || item.taskId !== id) {
            return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 })
        }

        const updateData: any = {}

        if (typeof completed === 'boolean') {
            updateData.completed = completed
            updateData.completedBy = completed ? user.id : null
            updateData.completedAt = completed ? new Date() : null
        }

        if (typeof content === 'string') {
            updateData.content = content.trim()
        }

        const updated = await prisma.taskChecklistItem.update({
            where: { id: itemId },
            data: updateData
        })

        // Log activity for completion toggle
        if (typeof completed === 'boolean' && taskContext.title) {
            await prisma.activityLog.create({
                data: {
                    taskId: id,
                    taskTitle: taskContext.title || 'Untitled Task',
                    action: 'updated',
                    field: 'checklist',
                    oldValue: completed ? 'incomplete' : 'complete',
                    newValue: completed ? 'complete' : 'incomplete',
                    changedBy: user.id,
                    changedByName: user.name || 'User',
                    details: `${completed ? 'Completed' : 'Uncompleted'} checklist item: "${item.content}"`
                }
            })
        }

        return NextResponse.json(updated)
    } catch (error) {
        console.error('Failed to update checklist item:', error)
        return NextResponse.json({ error: 'Failed to update checklist item' }, { status: 500 })
    }
}

// DELETE - Delete a checklist item
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const user = await getCurrentUser()

        if (!user || !user.id || user.id === 'pending') {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
        }

        if (!user.workspaceId) {
            return NextResponse.json({ error: 'No workspace' }, { status: 403 })
        }

        const taskContext = await getTaskContext(id)
        if (!taskContext || taskContext.workspaceId !== user.workspaceId) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 })
        }

        const url = new URL(request.url)
        const itemId = url.searchParams.get('itemId')

        if (!itemId) {
            return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
        }

        // Verify item exists and belongs to task
        const item = await prisma.taskChecklistItem.findUnique({
            where: { id: itemId }
        })

        if (!item || item.taskId !== id) {
            return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 })
        }

        await prisma.taskChecklistItem.delete({
            where: { id: itemId }
        })

        // Log activity
        if (taskContext.title) {
            await prisma.activityLog.create({
                data: {
                    taskId: id,
                    taskTitle: taskContext.title,
                    action: 'updated',
                    field: 'checklist',
                    oldValue: item.content,
                    newValue: null,
                    changedBy: user.id,
                    changedByName: user.name || 'User',
                    details: `Removed checklist item: "${item.content}"`
                }
            })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Failed to delete checklist item:', error)
        return NextResponse.json({ error: 'Failed to delete checklist item' }, { status: 500 })
    }
}
