import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { driveConfigTableExists } from "@/lib/googleDrive"
import { appUrl } from "@/lib/appUrl"
import { getErrorCode } from "@/lib/errors"
import { headers } from "next/headers"
import { SettingsShell } from "./SettingsShell"
import { GeneralTab } from "./GeneralTab"
import { MembersTab } from "./MembersTab"
import { IntegrationsTab } from "./IntegrationsTab"
import { DangerTab } from "./DangerTab"

export const dynamic = "force-dynamic"

async function fetchDriveConfig(workspaceId: string) {
    const hasTable = await driveConfigTableExists()
    if (!hasTable) return null

    try {
        return await prisma.workspaceDriveConfig.findUnique({
            where: { workspaceId },
            select: {
                refreshToken: true,
                folderId: true,
                folderName: true,
                connectedByName: true,
            },
        })
    } catch (error: unknown) {
        const code = getErrorCode(error)
        if (code === "P2021" || code === "P2022") return null
        throw error
    }
}

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

    // Fetch data in parallel
    const [workspace, usersRaw, allProjects, driveConfig] = await Promise.all([
        user.workspaceId
            ? prisma.workspace.findUnique({
                  where: { id: user.workspaceId },
                  select: {
                      id: true,
                      name: true,
                      inviteCode: true,
                      discordChannelId: true,
                  },
              })
            : null,
        prisma.user.findMany({
            where: {
                memberships: {
                    some: { workspaceId: user.workspaceId || "non-existent-id" },
                },
            },
            include: {
                memberships: {
                    where: { workspaceId: user.workspaceId || "non-existent-id" },
                    select: { role: true, name: true },
                },
                projectMemberships: {
                    include: {
                        project: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { name: "asc" },
        }),
        prisma.project.findMany({
            where: { workspaceId: user.workspaceId || "non-existent-id" },
            select: { id: true, name: true, color: true },
            orderBy: { createdAt: "desc" },
        }),
        user.workspaceId ? fetchDriveConfig(user.workspaceId) : null,
    ])

    const members = usersRaw.map((member) => {
        const membership = member.memberships[0]
        return {
            id: member.id,
            name: membership?.name || member.name,
            email: member.email,
            role: membership?.role || "Member",
            projectMemberships: member.projectMemberships,
        }
    })

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
                                ? host
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
