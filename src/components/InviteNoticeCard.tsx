import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { InviteNotice } from "@/lib/invite-status"
import { AlertTriangle, CheckCircle2, Info } from "lucide-react"

const inviteNoticeStyles = {
    joined: {
        badge: "bg-emerald-500/12 text-emerald-700 border-emerald-500/20 dark:text-emerald-300 dark:bg-emerald-400/10 dark:border-emerald-400/20",
        card: "border-emerald-500/20 bg-emerald-500/[0.04] dark:bg-emerald-400/[0.06]",
        iconClass: "text-emerald-700 dark:text-emerald-300",
        icon: CheckCircle2,
        title: "Invite accepted",
        description: (workspaceName?: string | null) =>
            workspaceName
                ? `You're in ${workspaceName}.`
                : "Your invite link worked and you can keep going.",
    },
    "already-member": {
        badge: "bg-sky-500/12 text-sky-700 border-sky-500/20 dark:text-sky-300 dark:bg-sky-400/10 dark:border-sky-400/20",
        card: "border-sky-500/20 bg-sky-500/[0.04] dark:bg-sky-400/[0.06]",
        iconClass: "text-sky-700 dark:text-sky-300",
        icon: Info,
        title: "Already in this workspace",
        description: (workspaceName?: string | null) =>
            workspaceName
                ? `You're already a member of ${workspaceName}. We opened it for you.`
                : "You're already a member here. We opened it for you.",
    },
    invalid: {
        badge: "bg-amber-500/12 text-amber-800 border-amber-500/20 dark:text-amber-200 dark:bg-amber-400/10 dark:border-amber-400/20",
        card: "border-amber-500/20 bg-amber-500/[0.05] dark:bg-amber-400/[0.06]",
        iconClass: "text-amber-800 dark:text-amber-200",
        icon: AlertTriangle,
        title: "Invite link unavailable",
        description: () => "This invite link is invalid or expired. Ask a workspace admin for a fresh one.",
    },
} as const

export function InviteNoticeCard({
    notice,
    className,
}: {
    notice: InviteNotice
    className?: string
}) {
    const variant = inviteNoticeStyles[notice.status]
    const Icon = variant.icon

    return (
        <Card className={cn("overflow-hidden shadow-sm backdrop-blur-xl", variant.card, className)}>
            <CardContent className="flex items-start gap-4 px-5 py-4">
                <div className={cn("mt-0.5 rounded-full border border-current/10 bg-background/80 p-2 shadow-sm", variant.iconClass)}>
                    <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={cn("rounded-full px-2.5 py-0.5", variant.badge)}>
                            Invite
                        </Badge>
                        <p className="text-sm font-semibold tracking-tight">{variant.title}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {variant.description(notice.workspaceName)}
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}
