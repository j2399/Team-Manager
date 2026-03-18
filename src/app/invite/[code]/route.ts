import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getCurrentUser } from "@/lib/auth"
import { joinWorkspaceByCode } from "@/lib/workspaceInvites"
import { getAppBaseUrl } from "@/lib/appUrl"
import { appendInviteNotice } from "@/lib/invite-status"

export const dynamic = "force-dynamic"

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ code: string }> }
) {
    const { code } = await context.params
    const trimmedCode = code?.trim()
    if (!trimmedCode) {
        return NextResponse.redirect(new URL("/workspaces", request.url))
    }

    const configuredBaseUrl = getAppBaseUrl()
    if (configuredBaseUrl) {
        const currentOrigin = new URL(request.url).origin
        const canonicalOrigin = new URL(configuredBaseUrl).origin

        if (canonicalOrigin !== currentOrigin) {
            return NextResponse.redirect(new URL(`/invite/${encodeURIComponent(trimmedCode)}`, configuredBaseUrl))
        }
    }

    const user = await getCurrentUser()
    const cookieStore = await cookies()

    if (!user || user.id === "pending") {
        cookieStore.set("pending_invite", trimmedCode, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 10,
            path: "/",
        })
        return NextResponse.redirect(new URL("/api/discord/login", request.url))
    }

    const result = await joinWorkspaceByCode({
        userId: user.id,
        userName: user.name,
        code: trimmedCode,
    })

    if (result.error) {
        return NextResponse.redirect(
            new URL(appendInviteNotice("/workspaces", { status: "invalid" }), request.url)
        )
    }

    return NextResponse.redirect(
        new URL(
            appendInviteNotice("/dashboard", {
                status: result.alreadyMember ? "already-member" : "joined",
                workspaceName: result.workspaceName,
            }),
            request.url
        )
    )
}
