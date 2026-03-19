"use client"

import { useCallback } from "react"
import { useConvex } from "convex/react"
import { useRouter } from "next/navigation"
import { api } from "@convex/_generated/api"
import { useDashboardUser } from "@/components/DashboardUserProvider"
import { preloadBoardModule } from "@/lib/board-module"

export function useProjectRoute() {
    const convex = useConvex()
    const router = useRouter()
    const dashboardUser = useDashboardUser()
    const workspaceId = dashboardUser?.workspaceId ?? null

    const prefetchProjectRoute = useCallback((projectId: string) => {
        preloadBoardModule()
        router.prefetch(`/dashboard/projects/${projectId}`)
        if (workspaceId) {
            convex.prewarmQuery({
                query: api.projects.getPageData,
                args: {
                    projectId,
                    workspaceId,
                },
                extendSubscriptionFor: 15_000,
            })
        }
    }, [convex, router, workspaceId])

    const pushProjectRoute = useCallback((href: string, projectId: string) => {
        prefetchProjectRoute(projectId)
        router.push(href)
    }, [prefetchProjectRoute, router])

    return {
        prefetchProjectRoute,
        pushProjectRoute,
    }
}
