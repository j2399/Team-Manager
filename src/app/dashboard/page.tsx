import { getCurrentUser } from '@/lib/auth'
import { api, preloadQuery } from "@/lib/convex/server"
import { redirect } from "next/navigation"
import { DashboardPageClient } from "./DashboardPageClient"
import { readInviteNotice } from "@/lib/invite-status"

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

export default async function DashboardPage({
    searchParams,
}: {
    searchParams?: Promise<SearchParams>
}) {
    const user = await getCurrentUser()
    const inviteNotice = readInviteNotice(searchParams ? await searchParams : null)

    if (!user || !user.id || user.id === 'pending') {
        return <div className="p-6 text-muted-foreground">Please complete your profile setup.</div>
    }

    if (!user.workspaceId) {
        redirect('/workspaces')
    }

    const preloadedPageData = await preloadQuery(api.dashboard.getDashboardPageData, {
        userId: user.id,
        workspaceId: user.workspaceId,
        role: user.role,
    })
    return (
        <DashboardPageClient
            user={{
                id: user.id,
                name: user.name,
                role: user.role,
                workspaceId: user.workspaceId,
            }}
            inviteNotice={inviteNotice}
            preloadedPageData={preloadedPageData}
        />
    )
}
