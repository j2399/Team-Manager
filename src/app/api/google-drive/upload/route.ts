import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getDriveClientForWorkspace } from "@/lib/googleDrive"

export const runtime = "nodejs"

export async function POST(request: Request) {
    const user = await getCurrentUser()
    if (!user || !user.workspaceId) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const canUpload = user.role === "Admin" || user.role === "Team Lead"
    if (!canUpload) {
        return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }

    const config = await prisma.workspaceDriveConfig.findUnique({
        where: { workspaceId: user.workspaceId },
        select: { folderId: true, refreshToken: true },
    })

    if (!config?.refreshToken || !config.folderId) {
        return NextResponse.json({ error: "Google Drive is not connected or folder not set" }, { status: 400 })
    }

    const formData = await request.formData()
    const files = formData.getAll("files").filter(Boolean)

    if (files.length === 0) {
        return NextResponse.json({ error: "No files provided" }, { status: 400 })
    }

    try {
        const drive = await getDriveClientForWorkspace(user.workspaceId)
        const uploaded: { id: string; name: string }[] = []

        for (const entry of files) {
            if (!(entry instanceof File)) continue
            const arrayBuffer = await entry.arrayBuffer()
            const buffer = Buffer.from(arrayBuffer)

            const response = await drive.files.create({
                requestBody: {
                    name: entry.name,
                    parents: [config.folderId],
                },
                media: {
                    mimeType: entry.type || "application/octet-stream",
                    body: buffer,
                },
                fields: "id, name",
                supportsAllDrives: true,
            })

            if (response.data.id) {
                uploaded.push({
                    id: response.data.id,
                    name: response.data.name || entry.name,
                })
            }
        }

        return NextResponse.json({ uploaded })
    } catch (error) {
        console.error("Google Drive upload error:", error)
        return NextResponse.json({ error: "Failed to upload files" }, { status: 500 })
    }
}
