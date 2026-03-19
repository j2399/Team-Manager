import { getCurrentUser } from "@/lib/auth"
import { api, preloadQuery } from "@/lib/convex/server"
import { redirect } from "next/navigation"
import { MembersPageClient } from "./MembersPageClient"

export const dynamic = 'force-dynamic'

export default async function MembersPage() {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        redirect('/')
    }
    if (!currentUser.workspaceId) {
        redirect('/workspaces')
    }

    const preloadedPageData = await preloadQuery(api.dashboard.getMembersPageData, {
        workspaceId: currentUser.workspaceId,
    })

    return (
        <MembersPageClient
            currentUser={{
                name: currentUser.name,
                email: currentUser.email,
                role: currentUser.role,
            }}
            preloadedPageData={preloadedPageData}
        />
    )
}
