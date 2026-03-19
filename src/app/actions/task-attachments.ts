'use server'

import { Readable } from 'stream'
import { del, put } from '@vercel/blob'
import { getCurrentUser } from '@/lib/auth'
import { getTaskContext } from '@/lib/access'
import {
    appendActivityLogToConvex,
    deleteTaskAttachmentFromConvex,
    touchTaskInConvex,
    upsertTaskAttachmentToConvex,
} from '@/lib/convex/mirror'
import {
    MAX_ATTACHMENT_SIZE,
    buildAttachmentAccessUrl,
    buildAttachmentStoragePath,
    isAllowedAttachmentType,
} from '@/lib/attachments'
import {
    driveConfigTableExists,
    getDriveClientForWorkspace,
    getDriveFolderCache,
    isFolderWithinRoot,
} from '@/lib/googleDrive'
import { getErrorMessage } from '@/lib/errors'
import { api, createLegacyId, fetchQuery } from '@/lib/convex/server'

export async function uploadTaskAttachment(taskId: string, formData: FormData) {
    try {
        const normalizedTaskId = taskId.trim()
        if (!normalizedTaskId) {
            return { error: 'Task ID is required' }
        }

        const user = await getCurrentUser()
        if (!user || !user.id || user.id === 'pending') {
            return { error: 'Authentication required' }
        }

        if (!user.workspaceId) {
            return { error: 'No workspace' }
        }

        const taskContext = await getTaskContext(normalizedTaskId)
        if (!taskContext || taskContext.workspaceId !== user.workspaceId) {
            return { error: 'Task not found' }
        }

        const file = formData.get('file')
        if (!(file instanceof File)) {
            return { error: 'File is required' }
        }

        if (file.size > MAX_ATTACHMENT_SIZE) {
            return { error: 'File too large. Maximum size is 50MB' }
        }

        if (!isAllowedAttachmentType(file.name, file.type || '')) {
            return { error: 'File type not allowed' }
        }

        const task = await fetchQuery(api.tasks.getTaskById, { taskId: normalizedTaskId })

        let driveConfig: { refreshToken: string | null; folderId: string | null } | null = null
        if (await driveConfigTableExists()) {
            const config = await fetchQuery(api.settings.getWorkspaceDriveConfig, {
                workspaceId: user.workspaceId,
            })
            if (config) {
                driveConfig = {
                    refreshToken: config.refreshToken ?? null,
                    folderId: config.folderId ?? null,
                }
            }
        }

        const hasDrive = !!driveConfig?.refreshToken && !!driveConfig.folderId
        const rootFolderId = driveConfig?.folderId || null
        const targetFolderId = task?.attachmentFolderId || null

        let attachmentUrl = ''
        let storageProvider = 'vercel'
        let externalId: string | null = null

        if (hasDrive && rootFolderId && targetFolderId) {
            const drive = await getDriveClientForWorkspace(user.workspaceId)

            if (targetFolderId !== rootFolderId) {
                const cached = await getDriveFolderCache(user.workspaceId)
                if (!isFolderWithinRoot(cached, rootFolderId, targetFolderId)) {
                    return { error: 'Upload folder is outside the configured Drive root' }
                }
            }

            const fileBuffer = await file.arrayBuffer()
            const driveResponse = await drive.files.create({
                requestBody: {
                    name: file.name,
                    parents: [targetFolderId],
                },
                media: {
                    mimeType: file.type || 'application/octet-stream',
                    body: Readable.from(Buffer.from(fileBuffer)),
                },
                fields: 'id, name, webViewLink, webContentLink, mimeType',
                supportsAllDrives: true,
            })

            const fileId = driveResponse.data.id || ''
            if (!fileId) {
                return { error: 'Failed to upload to Google Drive' }
            }

            attachmentUrl = fileId
            storageProvider = 'google'
            externalId = fileId
        } else {
            const filename = buildAttachmentStoragePath(normalizedTaskId, file.name)
            const fileBuffer = await file.arrayBuffer()
            const blob = await put(filename, fileBuffer, {
                access: 'public',
                contentType: file.type || 'application/octet-stream',
            })
            attachmentUrl = blob.url
        }

        const existingAttachments = await fetchQuery(api.tasks.getAttachments, { taskId: normalizedTaskId })
        const maxOrder = existingAttachments.length > 0
            ? Math.max(...existingAttachments.map((attachment) => attachment.order))
            : -1

        const now = Date.now()
        const attachment = {
            id: createLegacyId('attachment'),
            taskId: normalizedTaskId,
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            url: attachmentUrl,
            storageProvider,
            externalId: externalId || undefined,
            uploadedBy: user.name || 'User',
            order: maxOrder + 1,
            createdAt: now,
        }

        await upsertTaskAttachmentToConvex(attachment)
        await appendActivityLogToConvex({
            taskId: normalizedTaskId,
            taskTitle: taskContext.title || 'Untitled Task',
            action: 'updated',
            field: 'attachment',
            oldValue: 'None',
            newValue: file.name,
            changedBy: user.id,
            changedByName: user.name || 'User',
            details: `Added media file: ${file.name}`,
        })
        await touchTaskInConvex(normalizedTaskId, now)

        return {
            success: true,
            attachment: {
                ...attachment,
                url: buildAttachmentAccessUrl(attachment.id),
            },
        }
    } catch (error: unknown) {
        return {
            error: `Failed to upload attachment: ${getErrorMessage(error)}`,
        }
    }
}

export async function deleteTaskAttachment(taskId: string, attachmentId: string) {
    try {
        const normalizedTaskId = taskId.trim()
        const normalizedAttachmentId = attachmentId.trim()

        if (!normalizedTaskId || !normalizedAttachmentId) {
            return { error: 'Attachment ID is required' }
        }

        const user = await getCurrentUser()
        if (!user || !user.id || user.id === 'pending') {
            return { error: 'Authentication required' }
        }

        if (!user.workspaceId) {
            return { error: 'No workspace' }
        }

        const taskContext = await getTaskContext(normalizedTaskId)
        if (!taskContext || taskContext.workspaceId !== user.workspaceId) {
            return { error: 'Task not found' }
        }

        const attachment = await fetchQuery(api.tasks.getAttachment, {
            attachmentId: normalizedAttachmentId,
        })

        if (!attachment || attachment.taskId !== normalizedTaskId) {
            return { error: 'Attachment not found' }
        }

        if (attachment.storageProvider === 'google' && attachment.externalId) {
            try {
                const drive = await getDriveClientForWorkspace(user.workspaceId)
                await drive.files.delete({
                    fileId: attachment.externalId,
                    supportsAllDrives: true,
                })
            } catch (error) {
                console.error('Failed to delete from Google Drive:', error)
            }
        } else {
            try {
                await del(attachment.url)
            } catch (error) {
                console.error('Failed to delete from blob storage:', error)
            }
        }

        await deleteTaskAttachmentFromConvex(normalizedAttachmentId)

        if (taskContext.title) {
            await appendActivityLogToConvex({
                taskId: normalizedTaskId,
                taskTitle: taskContext.title,
                action: 'updated',
                field: 'attachment',
                oldValue: attachment.name,
                newValue: 'None',
                changedBy: user.id,
                changedByName: user.name || 'User',
                details: `Deleted media file: ${attachment.name}`,
            })
        }

        await touchTaskInConvex(normalizedTaskId, Date.now())

        return { success: true }
    } catch (error: unknown) {
        return {
            error: getErrorMessage(error, 'Failed to delete file'),
        }
    }
}
