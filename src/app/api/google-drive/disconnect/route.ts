import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

export const runtime = "nodejs"

export async function POST() {
    const user = await getCurrentUser()
    if (!user || !user.workspaceId) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    if (user.role !== "Admin") {
        return NextResponse.json({ error: "Only admins can disconnect" }, { status: 403 })
    }

    try {
        await prisma.workspaceDriveConfig.deleteMany({
            where: { workspaceId: user.workspaceId },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Google Drive disconnect error:", error)
        return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 })
    }
}

