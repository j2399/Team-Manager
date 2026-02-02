import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser()
        if (!user || !user.workspaceId) {
            return NextResponse.json({ comments: [], hasNew: false }, { status: 200 })
        }

        const { id } = await params
        const { searchParams } = new URL(request.url)
        const since = searchParams.get('since') // ISO timestamp for incremental updates
        const countOnly = searchParams.get('countOnly') === 'true'

        // Verify task belongs to user's workspace
        const task = await prisma.task.findUnique({
            where: { id },
            select: {
                column: {
                    select: {
                        board: {
                            select: {
                                project: { select: { workspaceId: true } }
                            }
                        }
                    }
                }
            }
        })

        if (task?.column?.board?.project?.workspaceId !== user.workspaceId) {
            return NextResponse.json({ comments: [], hasNew: false }, { status: 200 })
        }

        // If countOnly, just return the count for quick polling
        if (countOnly) {
            const count = await prisma.comment.count({
                where: { taskId: id }
            })
            return NextResponse.json({ count })
        }

        const where: any = { taskId: id }

        // If since is provided, only fetch newer comments
        if (since) {
            where.createdAt = { gt: new Date(since) }
        }

        const comments = await prisma.comment.findMany({
            where,
            orderBy: { createdAt: 'asc' },
            include: {
                replyTo: {
                    select: {
                        id: true,
                        content: true,
                        authorName: true
                    }
                }
            }
        })

        return NextResponse.json({
            comments,
            hasNew: comments.length > 0,
            lastCheck: new Date().toISOString()
        })
    } catch (error) {
        return NextResponse.json({ comments: [], hasNew: false }, { status: 200 })
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    let taskId: string | null = null
    try {
        const resolvedParams = await params
        taskId = resolvedParams.id

        if (!taskId) {
            return NextResponse.json({ error: 'Task ID is required' }, { status: 400 })
        }

        const user = await getCurrentUser()

        if (!user) {
            return NextResponse.json({ error: 'Authentication required. Please log in.' }, { status: 401 })
        }

        if (!user.id || user.id === 'pending') {
            return NextResponse.json({ error: 'Please complete your profile setup.' }, { status: 401 })
        }

        if (!user.workspaceId) {
            return NextResponse.json({ error: 'No workspace selected.' }, { status: 403 })
        }
        const workspaceId = user.workspaceId

        const dbUser = await prisma.user.findUnique({
            where: { id: user.id }
        })

        if (!dbUser) {
            return NextResponse.json({ error: 'User account not found. Please log in again.' }, { status: 401 })
        }

        let body: any = {}
        try {
            body = await request.json()
        } catch (parseError) {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const { content, replyToId } = body

        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 })
        }

        // Verify task exists AND belongs to user's workspace
        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: {
                column: {
                    include: {
                        board: {
                            include: {
                                project: { select: { workspaceId: true } }
                            }
                        }
                    }
                }
            }
        })

        if (!task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 })
        }

        // Workspace validation - prevent cross-workspace comments
        if (task.column?.board?.project?.workspaceId !== user.workspaceId) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 })
        }

        const commentData = {
            taskId: taskId,
            content: content.trim(),
            authorId: dbUser.id,
            authorName: (dbUser.name || user.name || 'User').substring(0, 255),
            replyToId: replyToId || null
        }

        const comment = await prisma.comment.create({
            data: commentData,
            include: {
                replyTo: {
                    select: {
                        id: true,
                        content: true,
                        authorName: true
                    }
                }
            }
        })

        // Parse @mentions and create notifications
        const mentionRegex = /@(\w+(?:\s+\w+)?)/g
        const mentions = content.match(mentionRegex)

        if (mentions && mentions.length > 0) {
            const mentionNames = mentions.map((m: string) => m.substring(1).toLowerCase())

            // Find users in the same workspace whose name contains any of the mentioned names
            const mentionedMembers = await prisma.workspaceMember.findMany({
                where: {
                    workspaceId,
                    userId: { not: dbUser.id }, // Don't notify the commenter
                    OR: mentionNames.map((name: string) => ({
                        name: { contains: name, mode: 'insensitive' as const }
                    }))
                },
                select: { userId: true, name: true }
            })

            // Create notifications for mentioned users
            if (mentionedMembers.length > 0) {
                const projectId = task.column?.board?.projectId
                await prisma.notification.createMany({
                    data: mentionedMembers.map(mentionedUser => ({
                        workspaceId,
                        userId: mentionedUser.userId,
                        type: 'mention',
                        title: 'You were mentioned',
                        message: `${dbUser.name} mentioned you in a comment on "${task.title}"`,
                        link: projectId ? `/dashboard/projects/${projectId}?task=${taskId}` : undefined
                    }))
                })
            }
        }

        return NextResponse.json(comment, { status: 201 })
    } catch (error: any) {
        let errorMessage = 'Failed to create comment. Please try again.'
        if (error?.code === 'P2002') {
            errorMessage = 'A comment with this data already exists.'
        } else if (error?.code === 'P2003') {
            errorMessage = 'Invalid task or user reference.'
        } else if (error?.message) {
            errorMessage = error.message
        }

        return NextResponse.json({
            error: errorMessage,
            code: error?.code || 'UNKNOWN_ERROR'
        }, { status: 500 })
    }
}

export async function DELETE(
    request: Request
) {
    try {
        const url = new URL(request.url)
        const commentId = url.searchParams.get('commentId')

        if (!commentId) {
            return NextResponse.json({ error: 'Comment ID is required' }, { status: 400 })
        }

        const user = await getCurrentUser()
        if (!user || !user.workspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const comment = await prisma.comment.findUnique({
            where: { id: commentId },
            include: {
                replies: { select: { id: true } },
                task: {
                    select: {
                        column: {
                            select: {
                                board: {
                                    select: {
                                        project: { select: { workspaceId: true } }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        })

        if (!comment) {
            return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
        }

        // Verify comment's task belongs to user's workspace
        const commentWorkspaceId = comment.task?.column?.board?.project?.workspaceId
        if (!commentWorkspaceId || commentWorkspaceId !== user.workspaceId) {
            return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
        }

        const isAdmin = user.role === 'Admin' || user.role === 'Team Lead'
        const isOwner = comment.authorId === user.id

        if (!isAdmin && !isOwner) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        // Check if this comment has replies
        const hasReplies = comment.replies && comment.replies.length > 0

        if (hasReplies) {
            // Soft delete - just replace content with [Deleted]
            await prisma.comment.update({
                where: { id: commentId },
                data: {
                    content: '[Deleted]',
                    authorName: 'Deleted'
                }
            })
            return NextResponse.json({ success: true, id: commentId, softDeleted: true })
        } else {
            // Hard delete - no replies, safe to remove
            await prisma.comment.delete({
                where: { id: commentId }
            })
            return NextResponse.json({ success: true, id: commentId, softDeleted: false })
        }
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 })
    }
}
