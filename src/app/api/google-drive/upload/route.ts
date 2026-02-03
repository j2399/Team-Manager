import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { driveConfigTableExists, getDriveClientForWorkspace, getDriveFolderCache, isFolderWithinRoot, refreshDriveFolderCache } from "@/lib/googleDrive"
import { Readable } from "stream"

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
        const payloads: { name: string; type: string; buffer: Buffer }[] = []
        for (const entry of files) {
            if (!(entry instanceof File)) continue
            const arrayBuffer = await entry.arrayBuffer()
            payloads.push({
                name: entry.name,
                type: entry.type || "application/octet-stream",
                buffer: Buffer.from(arrayBuffer),
            })
        }

        const response = NextResponse.json({
            uploaded: payloads.map((file) => ({ id: "", name: file.name })),
            queued: true,
        })

        void (async () => {
            try {
                const drive = await getDriveClientForWorkspace(workspaceId)
                for (const file of payloads) {
                    await drive.files.create({
                        requestBody: {
                            name: file.name,
                            parents: [targetFolderId],
                        },
                        media: {
                            mimeType: file.type,
                            body: Readable.from(file.buffer),
                        },
                        fields: "id, name",
                        supportsAllDrives: true,
                    })
                }
                void refreshDriveFolderCache(workspaceId)
            } catch (error) {
                console.error("Google Drive background upload error:", error)
            }
        })()

        return response
    } catch (error) {
        console.error("Google Drive upload error:", error)
        return NextResponse.json({ error: "Failed to upload files" }, { status: 500 })
    }
}
