'use server'

import { getCurrentUser } from '@/lib/auth'
import { getTaskContext } from '@/lib/access'
import { api, createLegacyId, fetchMutation, fetchQuery } from '@/lib/convex/server'
import { touchTaskInConvex } from '@/lib/convex/mirror'
import { createNotificationsInConvex } from '@/lib/convex/notifications'
import { getErrorMessage } from '@/lib/errors'

type CommentWithReplies = {
    id: string
    content: string
    taskId: string
    authorId: string
    authorName: string
    replyToId?: string | null
    createdAt: number
    replies: { id: string }[]
}

type TaskMeta = {
    id: string
    projectId: string
    pushId?: string
    columnId?: string
}

export async function createTaskComment(input: {
    taskId: string
    content: string
    replyToId?: string | null
}) {
    try {
        const user = await getCurrentUser()

        if (!user) {
            return { error: 'Authentication required. Please log in.' }
        }

        if (!user.id || user.id === 'pending') {
            return { error: 'Please complete your profile setup.' }
        }

        if (!user.workspaceId) {
            return { error: 'No workspace selected.' }
        }

        const taskId = input.taskId.trim()
        if (!taskId) {
            return { error: 'Task ID is required' }
        }

        const trimmedContent = input.content.trim()
        if (!trimmedContent) {
            return { error: 'Content is required' }
        }

        const normalizedReplyToId = typeof input.replyToId === 'string' && input.replyToId.trim().length > 0
            ? input.replyToId.trim()
            : null

        const taskContext = await getTaskContext(taskId)
        if (!taskContext || taskContext.workspaceId !== user.workspaceId) {
            return { error: 'Task not found' }
        }

        if (normalizedReplyToId) {
            const replyTarget = await fetchQuery(api.tasks.getComment, {
                commentId: normalizedReplyToId,
            }) as CommentWithReplies | null

            if (!replyTarget || replyTarget.taskId !== taskId) {
                return { error: 'Reply target not found' }
            }
        }

        const commentId = createLegacyId('comment')
        const now = Date.now()
        const authorName = (user.name || 'User').substring(0, 255)

        const comment = {
            id: commentId,
            taskId,
            content: trimmedContent,
            authorId: user.id,
            authorName,
            replyToId: normalizedReplyToId || undefined,
            createdAt: now,
        }

        await fetchMutation(api.mirror.upsertComment, { comment })
        await touchTaskInConvex(taskId, now)

        const mentionRegex = /@(\w+(?:\s+\w+)?)/g
        const mentions = trimmedContent.match(mentionRegex)

        if (mentions && mentions.length > 0) {
            const mentionNames = mentions.map((mention) => mention.substring(1).toLowerCase())
            const mentionedMembers = await fetchQuery(api.workspaces.getWorkspaceMembersByNames, {
                workspaceId: user.workspaceId,
                names: mentionNames,
                excludeUserId: user.id,
            }) as { userId: string; name: string }[]

            if (mentionedMembers.length > 0) {
                await createNotificationsInConvex(
                    mentionedMembers.map((mentionedUser) => ({
                        workspaceId: user.workspaceId!,
                        userId: mentionedUser.userId,
                        type: 'mention',
                        title: 'You were mentioned',
                        message: `${user.name} mentioned you in a comment on "${taskContext.title}"`,
                        link: taskContext.projectId ? `/dashboard/projects/${taskContext.projectId}?task=${taskId}` : undefined,
                    }))
                )
            }
        }

        return {
            success: true,
            comment: {
                ...comment,
                createdAt: new Date(comment.createdAt).toISOString(),
                replyTo: null,
            },
        }
    } catch (error: unknown) {
        return {
            error: getErrorMessage(error, 'Failed to create comment. Please try again.'),
        }
    }
}

export async function deleteTaskComment(taskId: string, commentId: string) {
    try {
        const normalizedTaskId = taskId.trim()
        const normalizedCommentId = commentId.trim()

        if (!normalizedTaskId || !normalizedCommentId) {
            return { error: 'Comment ID is required' }
        }

        const user = await getCurrentUser()
        if (!user || !user.workspaceId) {
            return { error: 'Unauthorized' }
        }

        const comment = await fetchQuery(api.tasks.getComment, {
            commentId: normalizedCommentId,
        }) as CommentWithReplies | null

        if (!comment || comment.taskId !== normalizedTaskId) {
            return { error: 'Comment not found' }
        }

        const taskMeta = await fetchQuery(api.tasks.getMeta, {
            taskId: comment.taskId,
            workspaceId: user.workspaceId,
        }) as TaskMeta | null

        if (!taskMeta) {
            return { error: 'Comment not found' }
        }

        const isAdmin = user.role === 'Admin' || user.role === 'Team Lead'
        const isOwner = comment.authorId === user.id

        if (!isAdmin && !isOwner) {
            return { error: 'Unauthorized' }
        }

        const now = Date.now()
        const hasReplies = comment.replies.length > 0

        if (hasReplies) {
            await fetchMutation(api.mirror.upsertComment, {
                comment: {
                    id: comment.id,
                    taskId: comment.taskId,
                    content: '[Deleted]',
                    authorId: comment.authorId,
                    authorName: 'Deleted',
                    replyToId: comment.replyToId || undefined,
                    createdAt: comment.createdAt,
                },
            })
        } else {
            await fetchMutation(api.mirror.deleteComment, { commentId: normalizedCommentId })
        }

        await touchTaskInConvex(normalizedTaskId, now)

        return {
            success: true,
            id: normalizedCommentId,
            softDeleted: hasReplies,
        }
    } catch (error: unknown) {
        return {
            error: getErrorMessage(error, 'Failed to delete comment'),
        }
    }
}
