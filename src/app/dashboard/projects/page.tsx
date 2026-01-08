import { redirect } from 'next/navigation'
import prisma from "@/lib/prisma"

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
    // Get the first project and redirect to it
    const project = await prisma.project.findFirst({
        orderBy: { createdAt: 'desc' }
    })

    if (project) {
        redirect(`/dashboard/projects/${project.id}`)
    }

    // If no projects, show a message
    return (
        <div className="flex flex-col items-center justify-center h-full p-4 md:p-8 text-center animate-fade-in-up">
            <h2 className="text-base md:text-lg font-semibold mb-2">No Projects Yet</h2>
            <p className="text-xs md:text-sm text-muted-foreground">
                Create a new project using the + button in the sidebar.
            </p>
        </div>
    )
}
