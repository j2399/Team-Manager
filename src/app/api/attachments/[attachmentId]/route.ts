import { NextResponse } from "next/server"
import { Readable } from "stream"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { getTaskContext } from "@/lib/access"
import { buildAttachmentContentDisposition } from "@/lib/attachments"
import { getDriveClientForWorkspace } from "@/lib/googleDrive"

export const runtime = "nodejs"

export async function GET(
    request: Request,
    { params }: { params: Promise<{ attachmentId: string }> }
) {
    const user = await getCurrentUser()
    if (!user?.workspaceId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { attachmentId } = await params
    const attachment = await prisma.taskAttachment.findUnique({
        where: { id: attachmentId },
        select: {
            id: true,
            taskId: true,
            name: true,
            type: true,
            url: true,
            storageProvider: true,
            externalId: true,
        },
    })

    if (!attachment) {
        return NextResponse.json({ error: "Attachment not found" }, { status: 404 })
    }

    const taskContext = await getTaskContext(attachment.taskId)
    if (!taskContext || taskContext.workspaceId !== user.workspaceId) {
        return NextResponse.json({ error: "Attachment not found" }, { status: 404 })
    }

    const download = new URL(request.url).searchParams.get("download") === "1"
    const headers = new Headers({
        "Content-Type": attachment.type || "application/octet-stream",
        "Content-Disposition": buildAttachmentContentDisposition(attachment.name, download),
        "Cache-Control": "private, max-age=60",
    })

    try {
        if (attachment.storageProvider === "google" && attachment.externalId) {
            const drive = await getDriveClientForWorkspace(user.workspaceId)
            const response = await drive.files.get(
                {
                    fileId: attachment.externalId,
                    alt: "media",
                    supportsAllDrives: true,
                },
                { responseType: "stream" }
            )

            return new Response(Readable.toWeb(response.data as Readable) as unknown as BodyInit, { headers })
        }

        const response = await fetch(attachment.url)
        if (!response.ok || !response.body) {
            return NextResponse.json({ error: "Attachment unavailable" }, { status: 502 })
        }

        return new Response(response.body, { headers })
    } catch (error) {
        console.error("Failed to proxy attachment:", error)
        return NextResponse.json({ error: "Failed to load attachment" }, { status: 500 })
    }
}
