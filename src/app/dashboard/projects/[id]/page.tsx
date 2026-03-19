import { ProjectPageClient } from "@/features/projects/ProjectPageClient"

interface ProjectPageProps {
    params: Promise<{ id: string }>
}

export default async function ProjectPage({ params }: ProjectPageProps) {
    const { id } = await params
    return <ProjectPageClient projectId={id} />
}
