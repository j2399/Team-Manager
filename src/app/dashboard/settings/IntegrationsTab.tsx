"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { ArrowLeft, Check, ChevronRight, Folder, Loader2, XCircle } from "lucide-react"
import { DiscordChannelSettings } from "./DiscordChannelSettings"

type DriveConfig = {
    connected: boolean
    folderId: string | null
    folderName: string | null
    connectedByName: string | null
}

type FolderOption = { id: string; name: string; modifiedTime?: string | null }
type Crumb = { id: string; name: string }

function DriveLogo({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
            <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
            <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
            <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
            <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
            <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
            <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
        </svg>
    )
}

function DriveCard({ config, canManage }: { config: DriveConfig; canManage: boolean }) {
    const [connecting, setConnecting] = useState(false)
    const [disconnecting, setDisconnecting] = useState(false)
    const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null)
    const [pickerOpen, setPickerOpen] = useState(false)
    const [current, setCurrent] = useState<Crumb | null>(null)
    const [crumbStack, setCrumbStack] = useState<Crumb[]>([])
    const [folders, setFolders] = useState<FolderOption[]>([])
    const [loadingFolders, setLoadingFolders] = useState(false)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState<Crumb | null>(
        config.folderId && config.folderName ? { id: config.folderId, name: config.folderName } : null
    )

    const flash = (type: "success" | "error", msg: string) => {
        setStatus({ type, msg })
        setTimeout(() => setStatus(null), 4000)
    }

    const connect = () => { setConnecting(true); window.location.href = "/api/google-drive/login" }

    const disconnect = async () => {
        setDisconnecting(true)
        try {
            const r = await fetch("/api/google-drive/disconnect", { method: "POST" })
            if (!r.ok) throw 0
            window.location.reload()
        } catch { flash("error", "Could not disconnect"); setDisconnecting(false) }
    }

    const clean = (list: FolderOption[]) =>
        list.filter((f) => { const t = f.name.trim(); return t && !t.startsWith(".") && !/^\d+$/.test(t) })

    const load = async (parentId: string | null) => {
        setLoadingFolders(true)
        try {
            const r = await fetch(`/api/google-drive/folders?parentId=${parentId || "root"}`)
            if (!r.ok) throw 0
            const d = await r.json()
            setFolders(clean(Array.isArray(d.folders) ? d.folders : []))
        } catch { flash("error", "Failed to load folders") }
        finally { setLoadingFolders(false) }
    }

    const openPicker = () => {
        setPickerOpen(true)
        setCurrent(null)
        setCrumbStack([])
        void load(null)
    }

    const navTo = (f: Crumb) => {
        if (current) setCrumbStack((s) => [...s, current])
        setCurrent(f)
        void load(f.id)
    }

    const navBack = () => {
        if (crumbStack.length > 0) {
            const s = [...crumbStack]
            const p = s.pop()!
            setCrumbStack(s)
            setCurrent(p)
            void load(p.id)
        } else {
            setCurrent(null)
            void load(null)
        }
    }

    const confirm = async () => {
        if (!current) return
        setSaving(true)
        try {
            const r = await fetch("/api/google-drive/folder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ folderId: current.id }),
            })
            if (!r.ok) throw 0
            const d = await r.json()
            const s = { id: d.folder?.id || current.id, name: d.folder?.name || current.name }
            setSaved(s)
            setPickerOpen(false)
            flash("success", `Root set to ${s.name}`)
        } catch { flash("error", "Could not set folder") }
        finally { setSaving(false) }
    }

    return (
        <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white dark:bg-zinc-900 border flex items-center justify-center shrink-0">
                    <DriveLogo className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Google Drive</p>
                    <p className="text-xs text-muted-foreground">
                        {config.connected
                            ? `Connected${config.connectedByName ? ` by ${config.connectedByName}` : ""}`
                            : "Not connected"}
                    </p>
                </div>
                {config.connected ? (
                    <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                ) : (
                    <span className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-600 shrink-0" />
                )}
            </div>

            {config.connected ? (
                <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Root folder</span>
                        <span className="font-medium">{saved?.name || "Not set"}</span>
                    </div>

                    {canManage && (
                        <Button variant="outline" size="sm" onClick={openPicker} className="w-full">
                            {saved ? "Change Root Folder" : "Select Root Folder"}
                        </Button>
                    )}

                    {canManage && (
                        <div className="flex items-center gap-2 pt-1">
                            <Button variant="outline" size="sm" onClick={connect} disabled={connecting} className="flex-1">
                                {connecting ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Connecting...</> : "Switch Account"}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={disconnect}
                                disabled={disconnecting}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                            >
                                {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Disconnect"}
                            </Button>
                        </div>
                    )}

                    {/* Folder picker dialog */}
                    <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
                        <DialogContent className="sm:max-w-md p-0 gap-0">
                            <DialogHeader className="px-4 py-3 border-b">
                                <DialogTitle className="text-sm">Choose root folder</DialogTitle>
                            </DialogHeader>

                            {/* nav bar */}
                            <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/30">
                                <button
                                    onClick={navBack}
                                    disabled={!current}
                                    className="p-1 rounded hover:bg-muted disabled:opacity-30 shrink-0 transition-colors"
                                >
                                    <ArrowLeft className="h-3.5 w-3.5" />
                                </button>
                                <span className="text-xs font-medium truncate flex-1">
                                    {current?.name || "My Drive"}
                                </span>
                            </div>

                            {/* folder list */}
                            <ScrollArea className="h-64">
                                {loadingFolders ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    </div>
                                ) : folders.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-8 gap-1">
                                        <Folder className="h-5 w-5 text-muted-foreground/30" />
                                        <span className="text-xs text-muted-foreground">No folders here</span>
                                    </div>
                                ) : (
                                    <div className="py-1">
                                        {folders.map((f) => (
                                            <button
                                                key={f.id}
                                                onClick={() => navTo(f)}
                                                className="w-full flex items-center gap-2.5 px-4 py-2 text-left hover:bg-muted/50 transition-colors group"
                                            >
                                                <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <span className="flex-1 text-sm truncate">{f.name}</span>
                                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 transition-colors" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>

                            {/* actions */}
                            <div className="border-t px-4 py-3 flex items-center gap-2">
                                <Button onClick={confirm} disabled={!current || saving} size="sm" className="flex-1">
                                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                                    {current ? `Select "${current.name}"` : "Navigate into a folder"}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setPickerOpen(false)}>
                                    Cancel
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            ) : (
                canManage && (
                    <Button onClick={connect} disabled={connecting} size="sm" className="w-full">
                        {connecting ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Connecting...</> : "Connect Google Drive"}
                    </Button>
                )
            )}

            {status && (
                <p className={cn("text-xs flex items-center gap-2", status.type === "error" ? "text-red-500" : "text-green-600")}>
                    {status.type === "error" ? <XCircle className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                    {status.msg}
                </p>
            )}
        </div>
    )
}

type IntegrationsTabProps = {
    driveConfig: DriveConfig
    discordChannelId: string | null
    isAdmin: boolean
}

export function IntegrationsTab({ driveConfig, discordChannelId, isAdmin }: IntegrationsTabProps) {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold">Integrations</h2>
                <p className="text-xs text-muted-foreground mt-1">Connect external services to your workspace.</p>
            </div>

            <div className="space-y-4">
                <DriveCard config={driveConfig} canManage={isAdmin} />

                <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-[#5865F2] flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-white" viewBox="0 -28.5 256 256" xmlns="http://www.w3.org/2000/svg">
                                <path d="M216.856 16.597A208.502 208.502 0 0 0 164.042 0c-2.275 4.113-4.933 9.645-6.766 14.046-19.692-2.961-39.203-2.961-58.533 0-1.832-4.4-4.55-9.933-6.846-14.046a207.809 207.809 0 0 0-52.855 16.638C5.618 67.147-3.443 116.4 1.087 164.956c22.169 16.555 43.653 26.612 64.775 33.193A161.094 161.094 0 0 0 79.735 175.3a136.413 136.413 0 0 1-21.846-10.632 108.636 108.636 0 0 0 5.356-4.237c42.122 19.702 87.89 19.702 129.51 0a131.66 131.66 0 0 0 5.355 4.237 136.07 136.07 0 0 1-21.886 10.653c4.006 8.02 8.638 15.67 13.873 22.848 21.142-6.58 42.646-16.637 64.815-33.213 5.316-56.288-9.08-105.09-38.056-148.36ZM85.474 135.095c-12.645 0-23.015-11.805-23.015-26.18s10.149-26.2 23.015-26.2c12.867 0 23.236 11.804 23.015 26.2.02 14.375-10.148 26.18-23.015 26.18Zm85.051 0c-12.645 0-23.014-11.805-23.014-26.18s10.148-26.2 23.014-26.2c12.867 0 23.236 11.804 23.015 26.2 0 14.375-10.148 26.18-23.015 26.18Z" fill="currentColor"/>
                            </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Discord</p>
                            <p className="text-xs text-muted-foreground">Send notifications to a Discord channel</p>
                        </div>
                    </div>
                    <DiscordChannelSettings initialChannelId={discordChannelId} isAdmin={isAdmin} />
                </div>
            </div>
        </div>
    )
}
