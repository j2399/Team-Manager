"use client"

import { useEffect, useRef, useState, type DragEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { FolderOpen, Loader2, Plug, RefreshCw, UploadCloud, XCircle } from "lucide-react"

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

export function DriveUploadWidget({ initialConfig, canManage }: DriveUploadWidgetProps) {
    const [config, setConfig] = useState<DriveConfig>(initialConfig)
    const [folders, setFolders] = useState<FolderOption[]>([])
    const [loadingFolders, setLoadingFolders] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [folderQuery, setFolderQuery] = useState("")
    const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null)
    const [dragging, setDragging] = useState(false)
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

    return (
        <section className="border border-border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-medium">Drive Uploads</h2>
                </div>
                {config.connected && (
                    <div className="flex items-center gap-2">
                        {canManage && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={handleConnect}
                            >
                                Reconnect
                            </Button>
                        )}
                        {canManage && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                                onClick={handleDisconnect}
                            >
                                Disconnect
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {!config.connected ? (
                <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                        Connect a workspace Google Drive so leadership can drop files into a shared folder.
                    </p>
                    <Button
                        size="sm"
                        className="gap-2"
                        onClick={handleConnect}
                        disabled={!canManage}
                    >
                        <Plug className="h-4 w-4" />
                        Connect Google Drive
                    </Button>
                    {!canManage && (
                        <p className="text-[11px] text-muted-foreground">
                            Ask an admin to connect Google Drive for this workspace.
                        </p>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">Destination folder</p>
                            {canManage && (
                                <Input
                                    value={folderQuery}
                                    onChange={(event) => setFolderQuery(event.target.value)}
                                    placeholder="Search folders"
                                    className="h-8 text-xs"
                                />
                            )}
                            {canManage ? (
                                <Select
                                    value={config.folderId || undefined}
                                    onValueChange={handleFolderSelect}
                                    disabled={loadingFolders}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Select a folder" />
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
                            ) : (
                                <p className="text-sm">
                                    {config.folderName || "Not set"}
                                </p>
                            )}
                        </div>
                        {canManage && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={loadFolders}
                                disabled={loadingFolders}
                            >
                                {loadingFolders ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <RefreshCw className="h-4 w-4" />
                                )}
                            </Button>
                        )}
                    </div>

                    {config.connectedByName && (
                        <p className="text-[11px] text-muted-foreground">
                            Connected by {config.connectedByName}
                        </p>
                    )}

                    <div
                        className={cn(
                            "border border-dashed rounded-lg p-4 text-center transition-colors",
                            canUpload ? "border-border" : "border-muted-foreground/40 opacity-60",
                            dragging && "border-foreground bg-muted/40"
                        )}
                        onDragOver={(event) => {
                            event.preventDefault()
                            if (!canUpload) return
                            setDragging(true)
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={handleDrop}
                    >
                        <div className="flex flex-col items-center gap-2">
                            <UploadCloud className="h-5 w-5 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">
                                {canUpload ? "Drag files here or browse to upload." : "Select a folder to enable uploads."}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={!canUpload || uploading}
                                >
                                    {uploading ? (
                                        <span className="inline-flex items-center gap-2">
                                            <Loader2 className="h-3 w-3 animate-spin" /> Uploading
                                        </span>
                                    ) : (
                                        "Browse files"
                                    )}
                                </Button>
                                {!canManage && !config.folderId && (
                                    <span className="text-[10px] text-muted-foreground">
                                        Admins set the folder.
                                    </span>
                                )}
                            </div>
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
                </div>
            )}

            {status && (
                <p
                    className={cn(
                        "text-xs flex items-center gap-2",
                        status.type === "error" ? "text-red-500" : "text-green-600"
                    )}
                >
                    {status.type === "error" ? <XCircle className="h-3 w-3" /> : null}
                    {status.message}
                </p>
            )}
        </section>
    )
}
