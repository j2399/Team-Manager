import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { WorkspaceSelector } from "./WorkspaceSelector"
import { ThemeClient } from "@/components/ThemeClient"
import { InviteNoticeCard } from "@/components/InviteNoticeCard"
import { readInviteNotice } from "@/lib/invite-status"

export const dynamic = "force-dynamic"

type SearchParams = Record<string, string | string[] | undefined>

export default async function WorkspacesPage({
    searchParams,
}: {
    searchParams?: Promise<SearchParams>
}) {
    const user = await getCurrentUser()
    const inviteNotice = readInviteNotice(searchParams ? await searchParams : null)
    if (!user) {
        redirect("/")
    }

    if (user.id === 'pending') {
        redirect("/onboarding")
    }

    return (
        <div className="relative min-h-screen bg-background flex flex-col items-center justify-center p-4 overflow-hidden">
            <ThemeClient userId={user.id} />
            <div className="relative z-30 w-full max-w-5xl space-y-4">
                {inviteNotice && (
                    <InviteNoticeCard notice={inviteNotice} />
                )}
                <div className="flex justify-center">
                    <WorkspaceSelector user={user} />
                </div>
            </div>

            {/* Dither Overlay */}
            <div
                className="fixed inset-0 z-20 pointer-events-none opacity-[0.15] mix-blend-multiply"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                }}
            />
        </div>
    )
}
