import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getDriveClientForWorkspace } from "@/lib/googleDrive"

export const runtime = "nodejs"

export async function GET() {
    const user = await getCurrentUser()
    if (!user || !user.workspaceId) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    if (user.role !== "Admin") {
        return NextResponse.json({ error: "Only admins can list folders" }, { status: 403 })
    }

    try {
        const drive = await getDriveClientForWorkspace(user.workspaceId)
        const response = await drive.files.list({
            q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
            fields: "files(id, name)",
            orderBy: "name",
            pageSize: 100,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        })

        return NextResponse.json({
            folders: response.data.files || [],
        })
    } catch (error) {
        console.error("Google Drive folder list error:", error)
        return NextResponse.json({ error: "Failed to load folders" }, { status: 500 })
    }
}
