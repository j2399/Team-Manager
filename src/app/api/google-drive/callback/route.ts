import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { getGoogleOAuthClient } from "@/lib/googleDrive"

export const runtime = "nodejs"

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")

    if (!code) {
        return NextResponse.redirect(new URL("/dashboard?drive=error_no_code", request.url))
    }

    const cookieStore = await cookies()
    const storedState = cookieStore.get("google_oauth_state")?.value

    if (!state || !storedState || state !== storedState) {
        console.error("Google OAuth state mismatch")
        return NextResponse.redirect(new URL("/dashboard?drive=error_state", request.url))
    }

    cookieStore.delete("google_oauth_state")

    const user = await getCurrentUser()
    if (!user || !user.workspaceId) {
        return NextResponse.redirect(new URL("/dashboard?drive=error_auth", request.url))
    }

    if (user.role !== "Admin") {
        return NextResponse.redirect(new URL("/dashboard?drive=error_forbidden", request.url))
    }

    let oauthClient
    try {
        oauthClient = getGoogleOAuthClient()
    } catch (error) {
        console.error("Google OAuth setup error:", error)
        return NextResponse.redirect(new URL("/dashboard?drive=error_not_configured", request.url))
    }

    try {
        const { tokens } = await oauthClient.getToken(code)
        const existing = await prisma.workspaceDriveConfig.findUnique({
            where: { workspaceId: user.workspaceId },
            select: { refreshToken: true, accessToken: true },
        })

        const refreshToken = tokens.refresh_token || existing?.refreshToken

        if (!refreshToken) {
            return NextResponse.redirect(new URL("/dashboard?drive=error_no_refresh", request.url))
        }

        await prisma.workspaceDriveConfig.upsert({
            where: { workspaceId: user.workspaceId },
            create: {
                workspaceId: user.workspaceId,
                refreshToken,
                accessToken: tokens.access_token || null,
                tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                connectedById: user.id,
                connectedByName: user.name,
            },
            update: {
                refreshToken,
                accessToken: tokens.access_token || existing?.accessToken || null,
                tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                connectedById: user.id,
                connectedByName: user.name,
            },
        })

        return NextResponse.redirect(new URL("/dashboard?drive=connected", request.url))
    } catch (error) {
        console.error("Google OAuth token exchange failed:", error)
        return NextResponse.redirect(new URL("/dashboard?drive=error_token", request.url))
    }
}

