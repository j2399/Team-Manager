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

    if (user.role !== "Admin") {
        return NextResponse.json({ error: "Only admins can update the folder" }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const folderId = typeof body?.folderId === "string" ? body.folderId.trim() : ""

    if (!folderId) {
        return NextResponse.json({ error: "Folder ID is required" }, { status: 400 })
    }

    try {
        const drive = await getDriveClientForWorkspace(user.workspaceId)
        const folderResponse = await drive.files.get({
            fileId: folderId,
            fields: "id, name, mimeType",
            supportsAllDrives: true,
        })

        if (folderResponse.data.mimeType !== "application/vnd.google-apps.folder") {
            return NextResponse.json({ error: "Selected item is not a folder" }, { status: 400 })
        }

        await prisma.workspaceDriveConfig.upsert({
            where: { workspaceId: user.workspaceId },
            create: {
                workspaceId: user.workspaceId,
                folderId: folderResponse.data.id || folderId,
                folderName: folderResponse.data.name || "Google Drive Folder",
                connectedById: user.id,
                connectedByName: user.name,
            },
            update: {
                folderId: folderResponse.data.id || folderId,
                folderName: folderResponse.data.name || "Google Drive Folder",
                connectedById: user.id,
                connectedByName: user.name,
            },
        })

        return NextResponse.json({
            folder: {
                id: folderResponse.data.id || folderId,
                name: folderResponse.data.name || "Google Drive Folder",
            },
        })
    } catch (error) {
        console.error("Google Drive folder update error:", error)
        return NextResponse.json({ error: "Failed to set folder" }, { status: 500 })
    }
}
