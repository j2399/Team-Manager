"use client"

import { useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import { MyBoardRouteSkeleton } from "@/components/loading/dashboard-route-skeletons"
import { useDashboardUser } from "@/components/DashboardUserProvider"
import { PersonalKanban } from "./PersonalKanban"

export function MyBoardPageClient({
}: {
    userName?: string
}) {
    const user = useDashboardUser()
    const pageData = useQuery(
        api.dashboard.getMyBoardPageData,
        user?.id && user.workspaceId
            ? {
                userId: user.id,
                workspaceId: user.workspaceId,
            }
            : "skip"
    )

    if (!user?.id || user.id === "pending") {
        return <div className="p-6 text-muted-foreground">Please complete your profile setup.</div>
    }

    if (!user.workspaceId || pageData === undefined) {
        return <MyBoardRouteSkeleton />
    }

    const { columns, projects } = pageData

    return (
        <div className="flex min-h-full flex-col bg-background md:bg-transparent">
            <PersonalKanban
                columns={columns}
                projects={projects}
                userName={user.name?.split(" ")[0] || "User"}
            />
        </div>
    )
}
