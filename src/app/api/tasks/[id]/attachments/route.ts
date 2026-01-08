import { NextResponse } from 'next/server'
import { put, del } from '@vercel/blob'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
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

        // Verify task exists
        const task = await prisma.task.findUnique({
            where: { id }
        })

        if (!task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 })
        }

        // Upload to Vercel Blob
        const filename = `${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
        const fileBuffer = await file.arrayBuffer()
        const blob = await put(filename, fileBuffer, {
            access: 'public',
            contentType: file.type || 'application/octet-stream',
        })

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
                url: blob.url,
                uploadedBy: user.name || 'User',
                order: (maxOrder._max.order ?? -1) + 1
            }
        })

        // Log activity for attachment being added
        await prisma.activityLog.create({
            data: {
                taskId: id,
                taskTitle: task.title,
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
        console.error('Failed to create attachment:', error)
        const errorMessage = error?.message || 'Failed to upload file'
        return NextResponse.json({
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? String(error) : undefined
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

        // Delete from Vercel Blob
        try {
            await del(attachment.url)
        } catch (e) {
            console.error('Failed to delete from blob storage:', e)
        }

        // Get task info before deleting
        const task = await prisma.task.findUnique({
            where: { id },
            select: { title: true }
        })

        // Delete from database
        await prisma.taskAttachment.delete({
            where: { id: attachmentId }
        })

        // Log activity for attachment being deleted
        if (task) {
            await prisma.activityLog.create({
                data: {
                    taskId: id,
                    taskTitle: task.title,
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

        const body = await request.json()
        const { attachmentIds } = body

        if (!Array.isArray(attachmentIds)) {
            return NextResponse.json({ error: 'attachmentIds array is required' }, { status: 400 })
        }

        // Get task info
        const task = await prisma.task.findUnique({
            where: { id },
            select: { title: true }
        })

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
        if (task && attachments.length > 0) {
            await prisma.activityLog.create({
                data: {
                    taskId: id,
                    taskTitle: task.title,
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
