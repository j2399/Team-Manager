import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getTaskContext } from '@/lib/access'

// GET - Get help request for a task
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

        const helpRequest = await prisma.helpRequest.findFirst({
            where: {
                taskId: id,
                status: { in: ['open', 'acknowledged'] }
            },
            orderBy: { createdAt: 'desc' }
        })
        return NextResponse.json(helpRequest)
    } catch (error) {
        console.error('Failed to fetch help request:', error)
        return NextResponse.json(null, { status: 200 })
    }
}

// POST - Create a help request (ask for help)
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

        const body = await request.json()
        const { message } = body

        // Verify task exists and get project info for notification
        const task = await prisma.task.findUnique({
            where: { id },
            include: {
                column: {
                    include: {
                        board: {
                            include: {
                                project: {
                                    include: {
                                        lead: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        })

        if (!task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 })
        }

        if (task.column?.board?.project?.workspaceId !== user.workspaceId) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 })
        }

        // Check if there's already an open help request
        const existingRequest = await prisma.helpRequest.findFirst({
            where: {
                taskId: id,
                status: { in: ['open', 'acknowledged'] }
            }
        })

        if (existingRequest) {
            return NextResponse.json({ error: 'Help request already exists for this task' }, { status: 400 })
        }

        // Create the help request
        const helpRequest = await prisma.helpRequest.create({
            data: {
                taskId: id,
                requestedBy: user.id,
                requestedByName: user.name || 'User',
                message: message?.trim() || null
            }
        })

        // Log activity
        await prisma.activityLog.create({
            data: {
                taskId: id,
                taskTitle: task.title,
                action: 'help_requested',
                field: 'help',
                oldValue: null,
                newValue: 'open',
                changedBy: user.id,
                changedByName: user.name || 'User',
                details: message ? `Asked for help: "${message}"` : 'Asked for help on this task'
            }
        })

        // Create notification for project lead and admins
        const project = task.column?.board?.project
        const workspaceId = project?.workspaceId

        if (workspaceId) {
            // Notify project lead
            if (project?.leadId && project.leadId !== user.id) {
                await prisma.notification.create({
                    data: {
                        workspaceId,
                        userId: project.leadId,
                        type: 'help_requested',
                        title: 'Help Requested',
                        message: `${user.name} needs help with "${task.title}"${message ? `: ${message}` : ''}`,
                        link: `/dashboard/projects/${project.id}?task=${id}`
                    }
                })
            }

            // Notify admins in the workspace
            const admins = await prisma.user.findMany({
                where: {
                    workspaceId,
                    role: 'Admin',
                    id: { notIn: [user.id, project?.leadId || ''].filter(Boolean) }
                },
                select: { id: true }
            })

            if (admins.length > 0) {
                await prisma.notification.createMany({
                    data: admins.map(admin => ({
                        workspaceId,
                        userId: admin.id,
                        type: 'help_requested',
                        title: 'Help Requested',
                        message: `${user.name} needs help with "${task.title}"${message ? `: ${message}` : ''}`,
                        link: `/dashboard/projects/${project?.id}?task=${id}`
                    }))
                })
            }
        }

        return NextResponse.json(helpRequest, { status: 201 })
    } catch (error) {
        console.error('Failed to create help request:', error)
        return NextResponse.json({ error: 'Failed to create help request' }, { status: 500 })
    }
}

// PATCH - Update help request (acknowledge or resolve)
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

        const body = await request.json()
        const { status, helpRequestId } = body

        if (!helpRequestId) {
            return NextResponse.json({ error: 'Help request ID is required' }, { status: 400 })
        }

        if (!['acknowledged', 'resolved'].includes(status)) {
            return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
        }

        // Verify help request exists
        const helpRequest = await prisma.helpRequest.findUnique({
            where: { id: helpRequestId }
        })

        if (!helpRequest || helpRequest.taskId !== id) {
            return NextResponse.json({ error: 'Help request not found' }, { status: 404 })
        }

        const task = await prisma.task.findUnique({
            where: { id },
            select: {
                title: true,
                column: {
                    select: {
                        board: {
                            select: {
                                project: {
                                    select: { id: true, workspaceId: true }
                                }
                            }
                        }
                    }
                }
            }
        })

        if (task?.column?.board?.project?.workspaceId !== user.workspaceId) {
            return NextResponse.json({ error: 'Help request not found' }, { status: 404 })
        }

        const updateData: any = { status }

        if (status === 'resolved') {
            updateData.resolvedBy = user.id
            updateData.resolvedByName = user.name || 'User'
            updateData.resolvedAt = new Date()
        }

        const updated = await prisma.helpRequest.update({
            where: { id: helpRequestId },
            data: updateData
        })

        // Log activity
        if (task) {
            await prisma.activityLog.create({
                data: {
                    taskId: id,
                    taskTitle: task.title,
                    action: status === 'resolved' ? 'help_resolved' : 'help_acknowledged',
                    field: 'help',
                    oldValue: helpRequest.status,
                    newValue: status,
                    changedBy: user.id,
                    changedByName: user.name || 'User',
                    details: status === 'resolved' ? 'Resolved help request' : 'Acknowledged help request'
                }
            })

            // Notify the requester
            const project = task.column?.board?.project
            if (project?.workspaceId && helpRequest.requestedBy !== user.id) {
                await prisma.notification.create({
                    data: {
                        workspaceId: project.workspaceId,
                        userId: helpRequest.requestedBy,
                        type: status === 'resolved' ? 'help_resolved' : 'help_acknowledged',
                        title: status === 'resolved' ? 'Help Request Resolved' : 'Help Request Acknowledged',
                        message: `${user.name} ${status === 'resolved' ? 'resolved' : 'acknowledged'} your help request on "${task.title}"`,
                        link: `/dashboard/projects/${project.id}?task=${id}`
                    }
                })
            }
        }

        return NextResponse.json(updated)
    } catch (error) {
        console.error('Failed to update help request:', error)
        return NextResponse.json({ error: 'Failed to update help request' }, { status: 500 })
    }
}

// DELETE - Cancel a help request
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

        const url = new URL(request.url)
        const helpRequestId = url.searchParams.get('helpRequestId')

        if (!helpRequestId) {
            return NextResponse.json({ error: 'Help request ID is required' }, { status: 400 })
        }

        // Verify help request exists and belongs to user or user is admin
        const helpRequest = await prisma.helpRequest.findUnique({
            where: { id: helpRequestId }
        })

        if (!helpRequest || helpRequest.taskId !== id) {
            return NextResponse.json({ error: 'Help request not found' }, { status: 404 })
        }

        // Only the requester or admins can cancel
        if (helpRequest.requestedBy !== user.id && user.role !== 'Admin' && user.role !== 'Team Lead') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const taskContext = await getTaskContext(id)
        if (!taskContext || taskContext.workspaceId !== user.workspaceId) {
            return NextResponse.json({ error: 'Help request not found' }, { status: 404 })
        }

        const task = await prisma.task.findUnique({
            where: { id },
            select: { title: true }
        })

        await prisma.helpRequest.delete({
            where: { id: helpRequestId }
        })

        // Log activity
        if (task) {
            await prisma.activityLog.create({
                data: {
                    taskId: id,
                    taskTitle: task.title,
                    action: 'help_cancelled',
                    field: 'help',
                    oldValue: helpRequest.status,
                    newValue: 'cancelled',
                    changedBy: user.id,
                    changedByName: user.name || 'User',
                    details: 'Cancelled help request'
                }
            })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Failed to delete help request:', error)
        return NextResponse.json({ error: 'Failed to delete help request' }, { status: 500 })
    }
}
