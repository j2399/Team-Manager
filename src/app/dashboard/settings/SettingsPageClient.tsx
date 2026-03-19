"use client"

import { type Preloaded, usePreloadedQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import { SettingsShell } from "./SettingsShell"
import { GeneralTab } from "./GeneralTab"
import { MembersTab } from "./MembersTab"
import { IntegrationsTab } from "./IntegrationsTab"
import { DangerTab } from "./DangerTab"

type SettingsPageClientProps = {
    user: {
        id: string
        name: string
        email: string
        role: string
    }
    isAdmin: boolean
    inviteBaseUrl: string
    preloadedPageData: Preloaded<typeof api.settings.getPageData>
}

function joinInviteLink(baseUrl: string, inviteCode: string) {
    const normalizedBase = baseUrl.replace(/\/+$/, "")
    return `${normalizedBase}/invite/${inviteCode}`
}

export function SettingsPageClient({
    user,
    isAdmin,
    inviteBaseUrl,
    preloadedPageData,
}: SettingsPageClientProps) {
    const settingsData = usePreloadedQuery(preloadedPageData)
    const workspace = settingsData.workspace ?? null
    const members = settingsData.members ?? []
    const allProjects = settingsData.projects ?? []
    const driveConfig = settingsData.driveConfig ?? null

    const visibleTabs = ["general", "members"]
    if (isAdmin) visibleTabs.push("integrations")
    if (isAdmin && workspace) visibleTabs.push("danger")

    return (
        <SettingsShell visibleTabs={visibleTabs}>
            {{
                general: (
                    <GeneralTab
                        userName={user.name || ""}
                        userId={user.id}
                        userRole={user.role}
                        inviteCode={workspace?.inviteCode || null}
                        inviteLink={workspace?.inviteCode ? joinInviteLink(inviteBaseUrl, workspace.inviteCode) : null}
                    />
                ),
                members: (
                    <MembersTab
                        members={members}
                        allProjects={allProjects}
                        currentUserEmail={user.email}
                        currentUserRole={user.role}
                        canManage={isAdmin}
                        showWorkload={user.role === "Admin"}
                    />
                ),
                integrations: (
                    <IntegrationsTab
                        driveConfig={{
                            connected: !!driveConfig?.refreshToken,
                            folderId: driveConfig?.folderId || null,
                            folderName: driveConfig?.folderName || null,
                            connectedByName: driveConfig?.connectedByName || null,
                        }}
                        discordChannelId={workspace?.discordChannelId || null}
                        isAdmin={isAdmin}
                    />
                ),
                danger: workspace ? (
                    <DangerTab workspaceId={workspace.id} workspaceName={workspace.name} />
                ) : null,
            }}
        </SettingsShell>
    )
}
