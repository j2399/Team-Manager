import { getCurrentUser } from '@/lib/auth'
import { api, preloadQuery } from "@/lib/convex/server"
import { redirect } from "next/navigation"
import { HeatmapPageClient } from "./HeatmapPageClient"

export const dynamic = 'force-dynamic'

export default async function HeatmapPage() {
    const user = await getCurrentUser()

    if (!user || !user.id || user.id === 'pending') {
        return <div className="p-6 text-muted-foreground">Please complete your profile setup.</div>
    }

    // Only admins and team leads can view the heatmap
    if (user.role !== 'Admin' && user.role !== 'Team Lead') {
        redirect('/dashboard')
    }

    if (!user.workspaceId) {
        return <div className="p-6 text-muted-foreground">Workspace not found.</div>
    }

    const preloadedPageData = await preloadQuery(api.dashboard.getHeatmapPageData, {
        workspaceId: user.workspaceId,
    })

    return (
        <HeatmapPageClient preloadedPageData={preloadedPageData} />
    )
}
