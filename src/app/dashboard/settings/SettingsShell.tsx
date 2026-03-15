"use client"

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { User, Users, Plug, AlertTriangle } from "lucide-react"

type Tab = {
    id: string
    label: string
    icon: React.ReactNode
    danger?: boolean
}

const TABS: Tab[] = [
    { id: "general", label: "General", icon: <User className="h-4 w-4" /> },
    { id: "members", label: "Members", icon: <Users className="h-4 w-4" /> },
    { id: "integrations", label: "Integrations", icon: <Plug className="h-4 w-4" /> },
    { id: "danger", label: "Danger Zone", icon: <AlertTriangle className="h-4 w-4" />, danger: true },
]

type SettingsShellProps = {
    children: Record<string, React.ReactNode>
    visibleTabs?: string[]
}

export function SettingsShell({ children, visibleTabs }: SettingsShellProps) {
    const tabs = visibleTabs
        ? TABS.filter((t) => visibleTabs.includes(t.id))
        : TABS

    const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs])
    const searchParams = useSearchParams()
    const tabFromQuery = searchParams.get("tab")

    const initialTab = tabFromQuery && tabIds.includes(tabFromQuery)
        ? tabFromQuery
        : tabIds[0] || "general"

    const [selectedTab, setSelectedTab] = useState<string | null>(null)
    const activeTab = selectedTab && tabIds.includes(selectedTab) ? selectedTab : initialTab

    return (
        <div className="flex flex-col md:flex-row gap-6 w-full max-w-5xl mx-auto p-6 pb-20 animate-fade-in-up">
            {/* Mobile: horizontal scrollable pills */}
            <nav className="md:hidden flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setSelectedTab(tab.id)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                            activeTab === tab.id
                                ? tab.danger
                                    ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                                    : "bg-foreground text-background"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </nav>

            {/* Desktop: left sidebar */}
            <nav className="hidden md:flex flex-col gap-0.5 w-[180px] shrink-0 pt-1">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setSelectedTab(tab.id)}
                        className={cn(
                            "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors text-left",
                            activeTab === tab.id
                                ? tab.danger
                                    ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                                    : "bg-muted text-foreground"
                                : tab.danger
                                    ? "text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </nav>

            {/* Content area */}
            <div className="flex-1 min-w-0">
                {children[activeTab] || null}
            </div>
        </div>
    )
}
