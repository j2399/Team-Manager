"use client"

import { useEffect, useRef, useState, type DragEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { Check, ChevronDown, FolderOpen, Loader2, MoreVertical, RefreshCw, Search, UploadCloud, XCircle } from "lucide-react"

type DriveConfig = {
    connected: boolean
    folderId: string | null
    folderName: string | null
    connectedByName: string | null
}

type DriveUploadWidgetProps = {
    initialConfig: DriveConfig
    canManage: boolean
}

type FolderOption = {
    id: string
    name: string
    modifiedTime?: string | null
}

// Google Drive logo SVG component
function GoogleDriveLogo({ className }: { className?: string }) {
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

export function DriveUploadWidget({ initialConfig, canManage }: DriveUploadWidgetProps) {
    const [config, setConfig] = useState<DriveConfig>(initialConfig)
    const [folders, setFolders] = useState<FolderOption[]>([])
    const [loadingFolders, setLoadingFolders] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [folderQuery, setFolderQuery] = useState("")
    const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null)
    const [dragging, setDragging] = useState(false)
    const [connecting, setConnecting] = useState(false)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const canUpload = config.connected && !!config.folderId

    const cleanedFolders = folders.filter((folder) => {
        const trimmed = folder.name.trim()
        if (!trimmed) return false
        if (trimmed.startsWith(".")) return false
        if (/^\d+$/.test(trimmed)) return false
        return true
    })
    const normalizedQuery = folderQuery.trim().toLowerCase()
    const filteredFolders = normalizedQuery
        ? cleanedFolders.filter((folder) => folder.name.toLowerCase().includes(normalizedQuery))
        : cleanedFolders

    useEffect(() => {
        if (config.connected && canManage) {
            void loadFolders()
        }
    }, [config.connected, canManage])

    const setMessage = (type: "success" | "error", message: string) => {
        setStatus({ type, message })
        setTimeout(() => setStatus(null), 4000)
    }

    const handleConnect = () => {
        setConnecting(true)
        window.location.href = "/api/google-drive/login"
    }

    const handleDisconnect = async () => {
        try {
            const res = await fetch("/api/google-drive/disconnect", { method: "POST" })
            if (!res.ok) {
                const data = await res.json().catch(() => null)
                throw new Error(data?.error || "Failed to disconnect")
            }
            setConfig({
                connected: false,
                folderId: null,
                folderName: null,
                connectedByName: null,
            })
            setFolders([])
            setMessage("success", "Disconnected from Google Drive.")
        } catch (error) {
            console.error(error)
            setMessage("error", "Could not disconnect. Try again.")
        }
    }

    const loadFolders = async () => {
        setLoadingFolders(true)
        try {
            const res = await fetch("/api/google-drive/folders")
            if (!res.ok) {
                const data = await res.json().catch(() => null)
                throw new Error(data?.error || "Failed to load folders")
            }
            const data: { folders?: FolderOption[] } = await res.json()
            const nextFolders: FolderOption[] = Array.isArray(data.folders) ? data.folders : []
            if (config.folderId && config.folderName && !nextFolders.some((folder: FolderOption) => folder.id === config.folderId)) {
                nextFolders.unshift({ id: config.folderId, name: `${config.folderName} (Current)` })
            }
            setFolders(nextFolders)
        } catch (error) {
            console.error(error)
            setMessage("error", "Failed to load folders.")
        } finally {
            setLoadingFolders(false)
        }
    }

    const handleFolderSelect = async (folderId: string) => {
        try {
            const res = await fetch("/api/google-drive/folder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ folderId }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => null)
                throw new Error(data?.error || "Failed to set folder")
            }
            const data = await res.json()
            setConfig((prev) => ({
                ...prev,
                folderId: data.folder?.id || folderId,
                folderName: data.folder?.name || prev.folderName,
            }))
            setMessage("success", "Folder updated.")
        } catch (error) {
            console.error(error)
            setMessage("error", "Could not set folder.")
        }
    }

    const uploadFiles = async (files: FileList | File[]) => {
        if (!files || files.length === 0) return
        if (!canUpload) {
            setMessage("error", "Connect Google Drive and select a folder first.")
            return
        }

        setUploading(true)
        try {
            const formData = new FormData()
            Array.from(files).forEach((file) => {
                formData.append("files", file, file.name)
            })

            const res = await fetch("/api/google-drive/upload", {
                method: "POST",
                body: formData,
            })

            if (!res.ok) {
                const data = await res.json().catch(() => null)
                throw new Error(data?.error || "Upload failed")
            }

            const data = await res.json()
            const count = Array.isArray(data.uploaded) ? data.uploaded.length : 0
            setMessage("success", `Uploaded ${count} file${count === 1 ? "" : "s"}.`)
        } catch (error) {
            console.error(error)
            setMessage("error", "Upload failed. Try again.")
        } finally {
            setUploading(false)
        }
    }

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        setDragging(false)
        if (event.dataTransfer.files?.length) {
            void uploadFiles(event.dataTransfer.files)
        }
    }

    // Disconnected state - intuitive connection UI
    if (!config.connected) {
        return (
            <section className="border border-border rounded-lg overflow-hidden">
                <div className="bg-gradient-to-br from-blue-50 to-green-50 dark:from-blue-950/30 dark:to-green-950/30 p-6">
                    <div className="flex flex-col items-center text-center space-y-4">
                        <div className="w-12 h-12 rounded-xl bg-white dark:bg-zinc-900 shadow-sm flex items-center justify-center">
                            <GoogleDriveLogo className="w-7 h-7" />
                        </div>

                        <div className="space-y-1">
                            <h3 className="font-medium text-sm">Connect Google Drive</h3>
                            <p className="text-xs text-muted-foreground max-w-[220px]">
                                Upload files directly to a shared Drive folder
                            </p>
                        </div>

                        {canManage ? (
                            <Button
                                onClick={handleConnect}
                                disabled={connecting}
                                className="bg-[#1a73e8] hover:bg-[#1557b0] text-white"
                                size="sm"
                            >
                                {connecting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Connecting...
                                    </>
                                ) : (
                                    "Sign in"
                                )}
                            </Button>
                        ) : (
                            <div className="space-y-2">
                                <Button
                                    disabled
                                    variant="secondary"
                                    size="sm"
                                >
                                    Sign in
                                </Button>
                                <p className="text-[10px] text-muted-foreground">
                                    Contact an admin to connect Drive
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {status && (
                    <div className="px-4 py-2 border-t">
                        <p className={cn(
                            "text-xs flex items-center gap-2",
                            status.type === "error" ? "text-red-500" : "text-green-600"
                        )}>
                            {status.type === "error" ? <XCircle className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                            {status.message}
                        </p>
                    </div>
                )}
            </section>
        )
    }

    // Connected state - streamlined folder dropdown + upload
    return (
        <section className="border border-border rounded-lg">
            {/* Compact header with folder dropdown */}
            <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
                            <GoogleDriveLogo className="w-3 h-3" />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground">Drive Upload</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" title="Connected" />
                    </div>

                    {canManage && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                    <MoreVertical className="h-3.5 w-3.5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={loadFolders} disabled={loadingFolders}>
                                    <RefreshCw className={cn("h-3.5 w-3.5 mr-2", loadingFolders && "animate-spin")} />
                                    Refresh folders
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleConnect}>
                                    <GoogleDriveLogo className="h-3.5 w-3.5 mr-2" />
                                    Reconnect
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={handleDisconnect}
                                    className="text-red-600 focus:text-red-600"
                                >
                                    <XCircle className="h-3.5 w-3.5 mr-2" />
                                    Disconnect
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>

                {/* Folder selector - main focus */}
                {canManage ? (
                    <div className="space-y-1.5">
                        {folders.length > 10 && (
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input
                                    value={folderQuery}
                                    onChange={(event) => setFolderQuery(event.target.value)}
                                    placeholder="Search folders..."
                                    className="h-8 text-xs pl-8"
                                />
                            </div>
                        )}
                        <Select
                            value={config.folderId || undefined}
                            onValueChange={handleFolderSelect}
                            disabled={loadingFolders}
                        >
                            <SelectTrigger className="h-9 text-xs">
                                <div className="flex items-center gap-2">
                                    <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <SelectValue placeholder={loadingFolders ? "Loading folders..." : "Select destination folder"} />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                {filteredFolders.length === 0 && (
                                    <SelectItem value="__none" disabled>
                                        {loadingFolders ? "Loading..." : normalizedQuery ? "No matches" : "No folders found"}
                                    </SelectItem>
                                )}
                                {filteredFolders.map((folder) => (
                                    <SelectItem key={folder.id} value={folder.id}>
                                        {folder.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 py-1">
                        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs">{config.folderName || "No folder selected"}</span>
                    </div>
                )}
            </div>

            {/* Compact drop zone */}
            <div
                className={cn(
                    "border-t border-dashed mx-3 mb-3 rounded-md transition-all",
                    canUpload
                        ? "border-border hover:border-muted-foreground/50 cursor-pointer"
                        : "border-muted-foreground/20 opacity-50",
                    dragging && "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
                )}
                onDragOver={(event) => {
                    event.preventDefault()
                    if (!canUpload) return
                    setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => canUpload && fileInputRef.current?.click()}
            >
                <div className="flex items-center justify-center gap-2 py-3 px-4">
                    {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                        <UploadCloud className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-xs text-muted-foreground">
                        {uploading
                            ? "Uploading..."
                            : canUpload
                                ? "Drop files or click to upload"
                                : "Select a folder first"
                        }
                    </span>
                </div>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                    if (event.target.files) {
                        void uploadFiles(event.target.files)
                        event.target.value = ""
                    }
                }}
            />

            {/* Status messages */}
            {status && (
                <div className="px-3 pb-3">
                    <p className={cn(
                        "text-xs flex items-center gap-2 p-2 rounded-md",
                        status.type === "error"
                            ? "text-red-600 bg-red-50 dark:bg-red-950/30"
                            : "text-green-600 bg-green-50 dark:bg-green-950/30"
                    )}>
                        {status.type === "error" ? <XCircle className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                        {status.message}
                    </p>
                </div>
            )}
        </section>
    )
}
