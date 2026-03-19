import { getCurrentUser } from '@/lib/auth'
import { redirect } from "next/navigation"
import { api, preloadQuery } from "@/lib/convex/server"
import { MyBoardPageClient } from "./MyBoardPageClient"

export const dynamic = 'force-dynamic'

export default async function MyBoardPage() {
    const user = await getCurrentUser()

    if (!user || !user.id || user.id === 'pending') {
        return <div className="p-6 text-muted-foreground">Please complete your profile setup.</div>
    }

    if (!user.workspaceId) {
        redirect("/workspaces")
    }

    const preloadedPageData = await preloadQuery(api.dashboard.getMyBoardPageData, {
        userId: user.id,
        workspaceId: user.workspaceId,
    })

    return (
        <MyBoardPageClient
            userName={user.name?.split(' ')[0] || 'User'}
            preloadedPageData={preloadedPageData}
        />
    )
}
