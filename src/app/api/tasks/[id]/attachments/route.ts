import { NextResponse } from 'next/server'
import { put, del } from '@vercel/blob'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getTaskContext } from '@/lib/access'
import { driveConfigTableExists, getDriveClientForWorkspace, getDriveFolderCache, isFolderWithinRoot } from '@/lib/googleDrive'
import { Readable } from 'stream'

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

        const attachments = await prisma.taskAttachment.findMany({
            where: { taskId: id },
            orderBy: [{ order: 'asc' }, { createdAt: 'desc' }]
        })
        return NextResponse.json(attachments)
    } catch (error) {
        console.error('Failed to fetch attachments:', error)
        return NextResponse.json([], { status: 200 })
    }
}

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

        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json({ error: 'File is required' }, { status: 400 })
        }

        // File size validation (max 50MB)
        const MAX_FILE_SIZE = 50 * 1024 * 1024
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'File too large. Maximum size is 50MB' }, { status: 400 })
        }

        // File type validation - allow common file types
        // Check by MIME type prefix OR by file extension for better compatibility
        const ALLOWED_MIME_PREFIXES = [
            'image/', 'video/', 'audio/', 'application/pdf',
            'application/msword', 'application/vnd.openxmlformats',
            'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
            'text/', 'application/zip', 'application/x-zip',
            'application/json', 'application/xml'
        ]
        const ALLOWED_EXTENSIONS = [
            'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico',
            'mp4', 'webm', 'mov', 'avi', 'mkv',
            'mp3', 'wav', 'ogg', 'flac',
            'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
            'txt', 'md', 'json', 'xml', 'csv',
            'zip', 'rar', '7z', 'tar', 'gz'
        ]

        const fileExtension = file.name.split('.').pop()?.toLowerCase() || ''
        const isAllowedByMime = file.type && ALLOWED_MIME_PREFIXES.some(type => file.type.startsWith(type))
        const isAllowedByExtension = ALLOWED_EXTENSIONS.includes(fileExtension)
        const isGenericBinary = !file.type || file.type === 'application/octet-stream'

        // Allow if: valid MIME type OR valid extension OR generic binary with valid extension
        if (!isAllowedByMime && !isAllowedByExtension && !isGenericBinary) {
            return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
        }

        const task = await prisma.task.findUnique({
            where: { id },
            select: { attachmentFolderId: true, attachmentFolderName: true }
        })

        let driveConfig: { refreshToken: string | null; folderId: string | null } | null = null
        if (await driveConfigTableExists()) {
            driveConfig = await prisma.workspaceDriveConfig.findUnique({
                where: { workspaceId: user.workspaceId },
                select: { refreshToken: true, folderId: true }
            })
        }

        const hasDrive = !!driveConfig?.refreshToken && !!driveConfig.folderId
        const rootFolderId = driveConfig?.folderId || null
        const FALLBACK_FOLDER_NAME = "team manager"
        let targetFolderId = task?.attachmentFolderId || null
        let targetFolderName = task?.attachmentFolderName || null

        let attachmentUrl = ''
        let storageProvider = 'vercel'
        let externalId: string | null = null

        if (hasDrive && rootFolderId) {
            const drive = await getDriveClientForWorkspace(user.workspaceId)
            const ensureFallbackFolder = async () => {
                try {
                    const existing = await drive.files.list({
                        q: `'${rootFolderId}' in parents and name = '${FALLBACK_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                        fields: "files(id, name)",
                        pageSize: 1,
                        supportsAllDrives: true,
                        includeItemsFromAllDrives: true,
                    })
                    const match = existing.data.files?.[0]
                    if (match?.id) return { id: match.id, name: match.name || FALLBACK_FOLDER_NAME }
                } catch {
                    // fall through to create
                }
                const created = await drive.files.create({
                    requestBody: {
                        name: FALLBACK_FOLDER_NAME,
                        mimeType: "application/vnd.google-apps.folder",
                        parents: [rootFolderId],
                    },
                    fields: "id, name",
                    supportsAllDrives: true,
                })
                const createdId = created.data.id || ""
                return createdId ? { id: createdId, name: created.data.name || FALLBACK_FOLDER_NAME } : null
            }

            if (!targetFolderId) {
                const fallback = await ensureFallbackFolder()
                if (fallback?.id) {
                    targetFolderId = fallback.id
                    targetFolderName = fallback.name
                    await prisma.task.update({
                        where: { id },
                        data: { attachmentFolderId: targetFolderId, attachmentFolderName: targetFolderName }
                    })
                } else {
                    targetFolderId = rootFolderId
                    targetFolderName = targetFolderName || "Drive"
                }
            }

            if (rootFolderId && targetFolderId !== rootFolderId) {
                const cached = await getDriveFolderCache(user.workspaceId)
                if (!isFolderWithinRoot(cached, rootFolderId, targetFolderId)) {
                    const fallback = await ensureFallbackFolder()
                    if (fallback?.id) {
                        targetFolderId = fallback.id
                        targetFolderName = fallback.name
                        await prisma.task.update({
                            where: { id },
                            data: { attachmentFolderId: targetFolderId, attachmentFolderName: targetFolderName }
                        })
                    } else {
                        return NextResponse.json({ error: 'Upload folder is outside the configured Drive root' }, { status: 400 })
                    }
                }
            }

            const fileBuffer = await file.arrayBuffer()
            const driveResponse = await drive.files.create({
                requestBody: {
                    name: file.name,
                    parents: [targetFolderId],
                },
                media: {
                    mimeType: file.type || "application/octet-stream",
                    body: Readable.from(Buffer.from(fileBuffer)),
                },
                fields: "id, name, webViewLink, webContentLink, mimeType",
                supportsAllDrives: true,
            })

            const fileId = driveResponse.data.id || ""
            if (!fileId) {
                return NextResponse.json({ error: 'Failed to upload to Google Drive' }, { status: 500 })
            }

            const isImage = (file.type && file.type.startsWith('image/')) || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(fileExtension)
            const viewUrl = `https://drive.google.com/uc?export=view&id=${fileId}`
            const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`

            attachmentUrl = isImage ? viewUrl : downloadUrl
            storageProvider = 'google'
            externalId = fileId

            try {
                await drive.permissions.create({
                    fileId,
                    requestBody: { role: 'reader', type: 'anyone' },
                    supportsAllDrives: true,
                })
            } catch (permError) {
                console.warn("Drive permission set failed:", permError)
            }
        } else {
            // Upload to Vercel Blob
            const filename = `${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
            const fileBuffer = await file.arrayBuffer()
            console.log(`[UPLOAD] Processing file: ${filename}, size: ${file.size} bytes`);
            const blob = await put(filename, fileBuffer, {
                access: 'public',
                contentType: file.type || 'application/octet-stream',
            })
            console.log(`[UPLOAD] Blob created: ${blob.url}`);
            attachmentUrl = blob.url
            storageProvider = 'vercel'
            externalId = null
        }

        // Get max order for this task
        const maxOrder = await prisma.taskAttachment.aggregate({
            where: { taskId: id },
            _max: { order: true }
        })

        // Store in database
        const attachment = await prisma.taskAttachment.create({
            data: {
                taskId: id,
                name: file.name,
                size: file.size,
                type: file.type || 'application/octet-stream',
                url: attachmentUrl,
                storageProvider,
                externalId,
                uploadedBy: user.name || 'User',
                order: (maxOrder._max.order ?? -1) + 1
            }
        })
        console.log(`[UPLOAD] Attachment record created in DB: ${attachment.id}`);

        // Log activity for attachment being added
        await prisma.activityLog.create({
            data: {
                taskId: id,
                taskTitle: taskContext.title || 'Untitled Task',
                action: 'updated',
                field: 'attachment',
                oldValue: 'None',
                newValue: file.name,
                changedBy: user.id,
                changedByName: user.name || 'User',
                details: `Added media file: ${file.name}`
            }
        })

        return NextResponse.json(attachment, { status: 201 })
    } catch (error: any) {
        console.error('Failed to upload attachment:', error)
        const message = error?.message || 'Unknown error'
        return NextResponse.json({
            error: `Failed to upload attachment: ${message}`,
            details: process.env.NODE_ENV === 'development' ? String(error) : undefined,
            stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
        }, { status: 500 })
    }
}

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
        const attachmentId = url.searchParams.get('attachmentId')

        if (!attachmentId) {
            return NextResponse.json({ error: 'Attachment ID is required' }, { status: 400 })
        }

        // Verify attachment exists and belongs to task
        const attachment = await prisma.taskAttachment.findUnique({
            where: { id: attachmentId }
        })

        if (!attachment || attachment.taskId !== id) {
            return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
        }

        if (attachment.storageProvider === 'google' && attachment.externalId) {
            try {
                const drive = await getDriveClientForWorkspace(user.workspaceId)
                await drive.files.delete({
                    fileId: attachment.externalId,
                    supportsAllDrives: true,
                })
            } catch (e) {
                console.error('Failed to delete from Google Drive:', e)
            }
        } else {
            // Delete from Vercel Blob
            try {
                console.log(`[DELETE] Deleting blob: ${attachment.url}`);
                await del(attachment.url)
            } catch (e) {
                console.error('Failed to delete from blob storage:', e)
            }
        }

        // Get task info before deleting
        // Delete from database
        await prisma.taskAttachment.delete({
            where: { id: attachmentId }
        })

        // Log activity for attachment being deleted
        if (taskContext.title) {
            await prisma.activityLog.create({
                data: {
                    taskId: id,
                    taskTitle: taskContext.title,
                    action: 'updated',
                    field: 'attachment',
                    oldValue: attachment.name,
                    newValue: 'None',
                    changedBy: user.id,
                    changedByName: user.name || 'User',
                    details: `Deleted media file: ${attachment.name}`
                }
            })
        }

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error) {
        console.error('Failed to delete attachment:', error)
        return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
    }
}

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
        const { attachmentIds } = body

        if (!Array.isArray(attachmentIds)) {
            return NextResponse.json({ error: 'attachmentIds array is required' }, { status: 400 })
        }

        // Get task info
        // Get attachment names for logging
        const attachments = await prisma.taskAttachment.findMany({
            where: { id: { in: attachmentIds }, taskId: id },
            select: { name: true },
            orderBy: { order: 'asc' }
        })

        // Update order for all attachments
        await Promise.all(
            attachmentIds.map((attachmentId: string, index: number) =>
                prisma.taskAttachment.updateMany({
                    where: {
                        id: attachmentId,
                        taskId: id
                    },
                    data: {
                        order: index
                    }
                })
            )
        )

        // Log activity for attachment reordering
        if (taskContext.title && attachments.length > 0) {
            await prisma.activityLog.create({
                data: {
                    taskId: id,
                    taskTitle: taskContext.title,
                    action: 'updated',
                    field: 'attachment',
                    oldValue: 'Previous order',
                    newValue: 'Reordered',
                    changedBy: user.id,
                    changedByName: user.name || 'User',
                    details: `Reordered media files: ${attachments.map(a => a.name).join(', ')}`
                }
            })
        }

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error) {
        console.error('Failed to reorder attachments:', error)
        return NextResponse.json({ error: 'Failed to reorder files' }, { status: 500 })
    }
}
