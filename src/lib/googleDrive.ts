import { google } from "googleapis"
import prisma from "@/lib/prisma"
import { appUrl } from "@/lib/appUrl"

type DriveConfig = {
    workspaceId: string
    accessToken: string | null
    refreshToken: string | null
    tokenExpiry: Date | null
}

function getOAuthRedirectUri() {
    return process.env.GOOGLE_REDIRECT_URI || appUrl("/api/google-drive/callback")
}

export function getGoogleOAuthClient() {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const redirectUri = getOAuthRedirectUri()

    if (!clientId || !clientSecret) {
        throw new Error("Google OAuth is not configured")
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

async function refreshAccessToken(config: DriveConfig) {
    const oauthClient = getGoogleOAuthClient()
    oauthClient.setCredentials({
        refresh_token: config.refreshToken || undefined,
        access_token: config.accessToken || undefined,
        expiry_date: config.tokenExpiry?.getTime(),
    })

    const accessTokenResponse = await oauthClient.getAccessToken()
    const accessToken = accessTokenResponse?.token || oauthClient.credentials.access_token
    const expiryDate = oauthClient.credentials.expiry_date

    if (accessToken && (accessToken !== config.accessToken || (expiryDate && expiryDate !== config.tokenExpiry?.getTime()))) {
        await prisma.workspaceDriveConfig.update({
            where: { workspaceId: config.workspaceId },
            data: {
                accessToken,
                tokenExpiry: expiryDate ? new Date(expiryDate) : null,
            },
        })
    }

    return oauthClient
}

export async function getDriveClientForWorkspace(workspaceId: string) {
    const config = await prisma.workspaceDriveConfig.findUnique({
        where: { workspaceId },
        select: {
            workspaceId: true,
            accessToken: true,
            refreshToken: true,
            tokenExpiry: true,
        },
    })

    if (!config?.refreshToken) {
        throw new Error("Google Drive not connected")
    }

    const oauthClient = await refreshAccessToken(config)

    return google.drive({
        version: "v3",
        auth: oauthClient,
    })
}

export function getGoogleDriveScopes() {
    return ["https://www.googleapis.com/auth/drive"]
}

