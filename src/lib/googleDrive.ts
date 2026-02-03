import { google } from "googleapis"
import prisma from "@/lib/prisma"
import { appUrl } from "@/lib/appUrl"

type DriveConfig = {
    workspaceId: string
    accessToken: string | null
    refreshToken: string | null
    tokenExpiry: Date | null
}

export type DriveFolderNode = {
    id: string
    name: string
    parents: string[]
    modifiedTime?: string | null
}

const FOLDER_CACHE_TTL_MINUTES = 30

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

export async function driveConfigTableExists() {
    try {
        const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name = 'WorkspaceDriveConfig'
            ) as "exists"
        `
        return rows?.[0]?.exists === true
    } catch (error) {
        console.error("Drive config table check failed:", error)
        return false
    }
}

async function listAllFolders(drive: ReturnType<typeof google.drive>) {
    const seen = new Map<string, DriveFolderNode>()

    const listQuery = async (query: string, corpora: "allDrives" | "user") => {
        let pageToken: string | undefined
        let totalFetched = 0

        do {
            const response = await drive.files.list({
                q: query,
                fields: "nextPageToken, files(id, name, parents, modifiedTime, capabilities(canAddChildren, canEdit))",
                orderBy: "modifiedTime desc",
                pageSize: 500,
                pageToken,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
                corpora,
            })

            const batch = response.data.files || []
            batch.forEach((file) => {
                const id = file.id || ""
                const name = file.name || ""
                if (!id || !name) return
                const canEdit = file.capabilities?.canAddChildren || file.capabilities?.canEdit
                if (!canEdit) return
                const parents = (file.parents || []).filter(Boolean) as string[]
                seen.set(id, {
                    id,
                    name,
                    parents,
                    modifiedTime: file.modifiedTime || null,
                })
            })

            totalFetched += batch.length
            pageToken = response.data.nextPageToken || undefined
        } while (pageToken && totalFetched < 5000)
    }

    await listQuery("mimeType = 'application/vnd.google-apps.folder' and trashed = false", "allDrives")
    await listQuery("sharedWithMe = true and mimeType = 'application/vnd.google-apps.folder' and trashed = false", "user")

    return Array.from(seen.values())
}

export async function refreshDriveFolderCache(workspaceId: string) {
    const drive = await getDriveClientForWorkspace(workspaceId)
    const folders = await listAllFolders(drive)

    try {
        await prisma.workspaceDriveConfig.update({
            where: { workspaceId },
            data: {
                folderTree: folders,
                folderTreeUpdatedAt: new Date(),
            },
        })
    } catch (error: any) {
        if (error?.code === "P2022") {
            return folders
        }
        throw error
    }

    return folders
}

export async function getDriveFolderCache(workspaceId: string) {
    let config: { folderTree: unknown; folderTreeUpdatedAt: Date | null } | null = null

    try {
        config = await prisma.workspaceDriveConfig.findUnique({
            where: { workspaceId },
            select: {
                folderTree: true,
                folderTreeUpdatedAt: true,
            },
        })
    } catch (error: any) {
        if (error?.code === "P2022") {
            try {
                const drive = await getDriveClientForWorkspace(workspaceId)
                return await listAllFolders(drive)
            } catch (innerError) {
                console.error("Drive folder cache fallback failed:", innerError)
                return []
            }
        }
        throw error
    }

    const now = Date.now()
    const updatedAt = config?.folderTreeUpdatedAt?.getTime() || 0
    const isStale = !updatedAt || now - updatedAt > FOLDER_CACHE_TTL_MINUTES * 60 * 1000

    if (!config?.folderTree || isStale) {
        try {
            return await refreshDriveFolderCache(workspaceId)
        } catch (error: any) {
            if (error?.code === "P2022") {
                try {
                    const drive = await getDriveClientForWorkspace(workspaceId)
                    return await listAllFolders(drive)
                } catch (innerError) {
                    console.error("Drive folder cache fallback failed:", innerError)
                    return []
                }
            }
            console.error("Drive folder cache refresh failed:", error)
            if (Array.isArray(config?.folderTree)) {
                return config.folderTree as DriveFolderNode[]
            }
            return []
        }
    }

    return config.folderTree as DriveFolderNode[]
}

export function isFolderWithinRoot(nodes: DriveFolderNode[], rootId: string, targetId: string) {
    if (rootId === targetId) return true
    const parentMap = new Map<string, string[]>()
    nodes.forEach((node) => parentMap.set(node.id, node.parents || []))

    const visited = new Set<string>()
    const queue = [targetId]
    while (queue.length > 0) {
        const current = queue.shift()!
        if (visited.has(current)) continue
        visited.add(current)
        const parents = parentMap.get(current) || []
        if (parents.includes(rootId)) return true
        parents.forEach((parent) => {
            if (!visited.has(parent)) queue.push(parent)
        })
    }
    return false
}
