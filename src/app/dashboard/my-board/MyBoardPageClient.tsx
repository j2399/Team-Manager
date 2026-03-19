"use client"

import { type Preloaded, usePreloadedQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import { PersonalKanban } from "./PersonalKanban"

export function MyBoardPageClient({
    userName,
    preloadedPageData,
}: {
    userName: string
    preloadedPageData: Preloaded<typeof api.dashboard.getMyBoardPageData>
}) {
    const { columns, projects } = usePreloadedQuery(preloadedPageData)

    return (
        <div className="flex min-h-full flex-col bg-background md:bg-transparent">
            <PersonalKanban
                columns={columns}
                projects={projects}
                userName={userName}
            />
        </div>
    )
}
