import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { driveConfigTableExists, getDriveClientForWorkspace } from "@/lib/googleDrive"

export const runtime = "nodejs"

export async function GET() {
    const user = await getCurrentUser()
    if (!user || !user.workspaceId) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    if (user.role !== "Admin") {
        return NextResponse.json({ error: "Only admins can list folders" }, { status: 403 })
    }

    if (!(await driveConfigTableExists())) {
        return NextResponse.json({ error: "Drive config not initialized" }, { status: 503 })
    }

    try {
        const drive = await getDriveClientForWorkspace(user.workspaceId)
        const folders: { id: string; name: string; modifiedTime?: string | null }[] = []
        let pageToken: string | undefined
        let totalFetched = 0

        do {
            const response = await drive.files.list({
                q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                fields: "nextPageToken, files(id, name, modifiedTime)",
                orderBy: "modifiedTime desc",
                pageSize: 200,
                pageToken,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
                corpora: "allDrives",
            })

            const batch = (response.data.files || [])
                .map((file) => ({
                    id: file.id ?? "",
                    name: file.name ?? "",
                    modifiedTime: file.modifiedTime ?? null,
                }))
                .filter((file) => file.id && file.name)
            folders.push(...batch)
            totalFetched += batch.length
            pageToken = response.data.nextPageToken || undefined
        } while (pageToken && totalFetched < 2000)

        return NextResponse.json({
            folders,
        })
    } catch (error) {
        console.error("Google Drive folder list error:", error)
        return NextResponse.json({ error: "Failed to load folders" }, { status: 500 })
    }
}
