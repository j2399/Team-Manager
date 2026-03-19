import { notFound } from "next/navigation"
import { ProjectPageClient } from "@/features/projects/ProjectPageClient"
import { getCurrentUser } from "@/lib/auth"
import { api, preloadQuery, preloadedQueryResult } from "@/lib/convex/server"

interface ProjectPageProps {
    params: Promise<{ id: string }>
}

export default async function ProjectPage({ params }: ProjectPageProps) {
    const currentUser = await getCurrentUser()
    if (!currentUser?.workspaceId) {
        notFound()
    }

    const { id } = await params

    const preloadedPageData = await preloadQuery(api.projects.getPageData, {
        projectId: id,
        workspaceId: currentUser.workspaceId,
    })
    const pageData = preloadedQueryResult(preloadedPageData)

    if (!pageData) {
        notFound()
    }

    return <ProjectPageClient preloadedPageData={preloadedPageData} />
}
