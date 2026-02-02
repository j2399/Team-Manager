import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import crypto from "crypto"
import { getGoogleOAuthClient, getGoogleDriveScopes } from "@/lib/googleDrive"

export const runtime = "nodejs"

export async function GET() {
    let oauthClient
    try {
        oauthClient = getGoogleOAuthClient()
    } catch (error) {
        console.error("Google OAuth setup error:", error)
        return NextResponse.json({ error: "Google OAuth not configured" }, { status: 500 })
    }

    const state = crypto.randomBytes(32).toString("hex")
    const cookieStore = await cookies()
    cookieStore.set("google_oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 10,
        path: "/",
    })

    const authUrl = oauthClient.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: getGoogleDriveScopes(),
        state,
        include_granted_scopes: true,
    })

    return NextResponse.redirect(authUrl)
}

