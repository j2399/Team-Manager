"use client"

import { useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import { useDashboardUser } from "@/components/DashboardUserProvider"
import { ProjectRouteSkeleton } from "@/components/loading/dashboard-route-skeletons"
import { ProjectContent } from "@/features/projects/ProjectContent"

export function ProjectPageClient({
    projectId,
}: {
    projectId: string
}) {
    const dashboardUser = useDashboardUser()
    const pageData = useQuery(
        api.projects.getPageData,
        dashboardUser?.workspaceId
            ? {
                projectId,
                workspaceId: dashboardUser.workspaceId,
            }
            : "skip"
    )

    if (!dashboardUser?.workspaceId || pageData === undefined) {
        return <ProjectRouteSkeleton />
    }

    if (!pageData) {
        return <div className="p-6 text-muted-foreground">Division not found.</div>
    }

    return (
        <ProjectContent
            project={pageData.project}
            board={pageData.board}
            users={pageData.users}
            pushes={pageData.pushes}
        />
    )
}
