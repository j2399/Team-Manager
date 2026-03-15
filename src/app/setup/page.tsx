import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { SetupContent } from "./SetupContent"

export const dynamic = "force-dynamic"

export default async function SetupPage() {
    const user = await getCurrentUser()
    if (!user) {
        redirect('/')
    }

    // If user already has a workspace, go to workspace hub
    if (user.workspaceId) {
        redirect('/workspaces')
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
            <div className="mb-8 text-center">
                <h1 className="text-3xl font-bold mb-2">Welcome</h1>
                <p className="text-muted-foreground">Let&apos;s get you set up.</p>
            </div>
            <SetupContent />
        </div>
    )
}
