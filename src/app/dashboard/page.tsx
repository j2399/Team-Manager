import { DashboardPageClient } from "./DashboardPageClient"
import { readInviteNotice } from "@/lib/invite-status"

type SearchParams = Record<string, string | string[] | undefined>

export default async function DashboardPage({
    searchParams,
}: {
    searchParams?: Promise<SearchParams>
}) {
    const inviteNotice = readInviteNotice(searchParams ? await searchParams : null)
    return <DashboardPageClient inviteNotice={inviteNotice} />
}
