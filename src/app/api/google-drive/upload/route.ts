import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { driveConfigTableExists, getDriveClientForWorkspace, getDriveFolderCache, isFolderWithinRoot, refreshDriveFolderCache } from "@/lib/googleDrive"
import { Readable } from "stream"
import type { ReadableStream } from "stream/web"

export const runtime = "nodejs"

export async function POST(request: Request) {
    const user = await getCurrentUser()
    if (!user || !user.workspaceId) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    const workspaceId = user.workspaceId

    const canUpload = user.role === "Admin" || user.role === "Team Lead"
    if (!canUpload) {
        return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }

    if (!(await driveConfigTableExists())) {
        return NextResponse.json({ error: "Drive config not initialized" }, { status: 503 })
    }

    const config = await prisma.workspaceDriveConfig.findUnique({
        where: { workspaceId },
        select: { folderId: true, refreshToken: true },
    })

    if (!config?.refreshToken) {
        return NextResponse.json({ error: "Google Drive is not connected" }, { status: 400 })
    }

    const formData = await request.formData()
    const requestedFolderId = formData.get("folderId")?.toString()?.trim() || ""
    const targetFolderId = requestedFolderId || config.folderId || ""
    const files = formData.getAll("files").filter(Boolean)

    if (!targetFolderId) {
        return NextResponse.json({ error: "No destination folder specified" }, { status: 400 })
    }

    if (files.length === 0) {
        return NextResponse.json({ error: "No files provided" }, { status: 400 })
    }

    if (requestedFolderId && config.folderId && requestedFolderId !== config.folderId) {
        try {
            const cached = await getDriveFolderCache(workspaceId)
            if (!isFolderWithinRoot(cached, config.folderId, requestedFolderId)) {
                return NextResponse.json({ error: "Folder is outside the configured root" }, { status: 400 })
            }
        } catch (error) {
            console.error("Folder validation failed:", error)
            return NextResponse.json({ error: "Folder validation failed" }, { status: 500 })
        }
    }

    try {
        const drive = await getDriveClientForWorkspace(workspaceId)
        const uploaded: { id: string; name: string }[] = []

        for (const entry of files) {
            if (!(entry instanceof File)) continue
            const response = await drive.files.create({
                requestBody: {
                    name: entry.name,
                    parents: [targetFolderId],
                },
                media: {
                    mimeType: entry.type || "application/octet-stream",
                    body: Readable.fromWeb(entry.stream() as unknown as ReadableStream),
                },
                fields: "id, name",
                supportsAllDrives: true,
            })

            uploaded.push({
                id: response.data.id || "",
                name: response.data.name || entry.name,
            })
        }

        void refreshDriveFolderCache(workspaceId)

        return NextResponse.json({ uploaded, queued: false })
    } catch (error) {
        console.error("Google Drive upload error:", error)
        return NextResponse.json({ error: "Failed to upload files" }, { status: 500 })
    }
}
