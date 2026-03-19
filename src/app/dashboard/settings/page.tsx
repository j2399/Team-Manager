import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { appUrl, getAppBaseUrl } from "@/lib/appUrl"
import { api, preloadQuery } from "@/lib/convex/server"
import { headers } from "next/headers"
import { SettingsPageClient } from "./SettingsPageClient"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
    const user = await getCurrentUser()
    if (!user) {
        redirect("/")
    }
    if (!user.workspaceId) {
        redirect("/workspaces")
    }

    const isAdmin = user.role === "Admin" || user.role === "Team Lead"
    const headerList = await headers()
    const forwardedHost = headerList.get("x-forwarded-host")
    const host = forwardedHost || headerList.get("host")
    const forwardedProto = headerList.get("x-forwarded-proto")
    const proto = forwardedProto || (host?.includes("localhost") ? "http" : "https")
    const configuredBaseUrl = getAppBaseUrl()
    const inviteBaseUrl = configuredBaseUrl
        ? appUrl("/")
        : host
            ? `${proto}://${host}/`
            : appUrl("/")
    const preloadedPageData = await preloadQuery(api.settings.getPageData, {
        workspaceId: user.workspaceId,
    })

    return (
        <SettingsPageClient
            user={{
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            }}
            isAdmin={isAdmin}
            inviteBaseUrl={inviteBaseUrl}
            preloadedPageData={preloadedPageData}
        />
    )
}
