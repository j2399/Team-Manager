import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { appUrl, getAppBaseUrl } from "@/lib/appUrl"
import { getSettingsPageDataFromConvex } from "@/lib/convex/settings"
import { headers } from "next/headers"
import { SettingsShell } from "./SettingsShell"
import { GeneralTab } from "./GeneralTab"
import { MembersTab } from "./MembersTab"
import { IntegrationsTab } from "./IntegrationsTab"
import { DangerTab } from "./DangerTab"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
    const user = await getCurrentUser()
    if (!user) {
        redirect("/")
    }

    const isAdmin = user.role === "Admin" || user.role === "Team Lead"
    const headerList = await headers()
    const forwardedHost = headerList.get("x-forwarded-host")
    const host = forwardedHost || headerList.get("host")
    const forwardedProto = headerList.get("x-forwarded-proto")
    const proto = forwardedProto || (host?.includes("localhost") ? "http" : "https")
    const configuredBaseUrl = getAppBaseUrl()

    // Fetch data in parallel
    const settingsData = user.workspaceId
        ? await getSettingsPageDataFromConvex(user.workspaceId)
        : null

    const workspace = settingsData?.workspace ?? null
    const members = settingsData?.members ?? []
    const allProjects = settingsData?.projects ?? []
    const driveConfig = settingsData?.driveConfig ?? null

    // Determine which tabs to show
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
                        inviteLink={
                            workspace?.inviteCode
                                ? configuredBaseUrl
                                    ? appUrl(`/invite/${workspace.inviteCode}`)
                                    : host
                                        ? `${proto}://${host}/invite/${workspace.inviteCode}`
                                        : appUrl(`/invite/${workspace.inviteCode}`)
                                : null
                        }
                    />
                ),
                members: (
                    <MembersTab
                        members={members}
                        allProjects={allProjects}
                        currentUserEmail={user.email}
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
