"use client"

import { useRef, useState, type DragEvent } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { ArrowLeft, Check, ChevronRight, FolderOpen, Loader2, MoreVertical, Settings2, UploadCloud, X, XCircle } from "lucide-react"

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

type BreadcrumbEntry = { id: string; name: string }

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
    const [uploading, setUploading] = useState(false)
    const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null)
    const [dragging, setDragging] = useState(false)
    const [connecting, setConnecting] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)

    // Root folder setting (starting point for browse)
    const [rootFolder, setRootFolder] = useState<BreadcrumbEntry | null>(
        initialConfig.folderId && initialConfig.folderName
            ? { id: initialConfig.folderId, name: initialConfig.folderName }
            : null
    )
    const [pickingRoot, setPickingRoot] = useState(false)
    const [rootPickerFolder, setRootPickerFolder] = useState<BreadcrumbEntry | null>(null)
    const [rootPickerStack, setRootPickerStack] = useState<BreadcrumbEntry[]>([])
    const [rootPickerFolders, setRootPickerFolders] = useState<FolderOption[]>([])
    const [loadingRootPicker, setLoadingRootPicker] = useState(false)

    // Folder browser state
    const [browsing, setBrowsing] = useState(false)
    const [pendingFiles, setPendingFiles] = useState<File[]>([])
    const [currentFolder, setCurrentFolder] = useState<BreadcrumbEntry | null>(null)
    const [folderStack, setFolderStack] = useState<BreadcrumbEntry[]>([])
    const [subfolders, setSubfolders] = useState<FolderOption[]>([])
    const [loadingSubfolders, setLoadingSubfolders] = useState(false)

    const fileInputRef = useRef<HTMLInputElement | null>(null)

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
            setConfig({ connected: false, folderId: null, folderName: null, connectedByName: null })
            setMenuOpen(false)
            setMessage("success", "Disconnected from Google Drive.")
        } catch (error) {
            console.error(error)
            setMessage("error", "Could not disconnect. Try again.")
        }
    }

    // ---------- Root folder picker helpers ----------

    const loadRootPickerFolders = async (parentId: string | null) => {
        setLoadingRootPicker(true)
        try {
            const param = parentId || "root"
            const res = await fetch(`/api/google-drive/folders?parentId=${param}`)
            if (!res.ok) throw new Error("Failed to load folders")
            const data = await res.json()
            setRootPickerFolders(cleanFolders(Array.isArray(data.folders) ? data.folders : []))
        } catch (error) {
            console.error(error)
            setMessage("error", "Failed to load folders.")
        } finally {
            setLoadingRootPicker(false)
        }
    }

    const openRootPicker = () => {
        setPickingRoot(true)
        setRootPickerFolder(null)
        setRootPickerStack([])
        void loadRootPickerFolders(null)
    }

    const rootPickerNavigate = (folder: BreadcrumbEntry) => {
        if (rootPickerFolder) {
            setRootPickerStack((prev) => [...prev, rootPickerFolder])
        }
        setRootPickerFolder(folder)
        void loadRootPickerFolders(folder.id)
    }

    const rootPickerBack = () => {
        if (rootPickerStack.length > 0) {
            const newStack = [...rootPickerStack]
            const parent = newStack.pop()!
            setRootPickerStack(newStack)
            setRootPickerFolder(parent)
            void loadRootPickerFolders(parent.id)
        } else {
            setRootPickerFolder(null)
            void loadRootPickerFolders(null)
        }
    }

    const confirmRootFolder = async () => {
        if (!rootPickerFolder) return
        try {
            const res = await fetch("/api/google-drive/folder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ folderId: rootPickerFolder.id }),
            })
            if (!res.ok) throw new Error("Failed to set folder")
            const data = await res.json()
            const saved = { id: data.folder?.id || rootPickerFolder.id, name: data.folder?.name || rootPickerFolder.name }
            setRootFolder(saved)
            setConfig((prev) => ({ ...prev, folderId: saved.id, folderName: saved.name }))
            setPickingRoot(false)
            setMessage("success", `Root set to ${saved.name}`)
        } catch (error) {
            console.error(error)
            setMessage("error", "Could not set root folder.")
        }
    }

    const clearRootFolder = async () => {
        setRootFolder(null)
        setConfig((prev) => ({ ...prev, folderId: null, folderName: null }))
        setPickingRoot(false)
        setMessage("success", "Root folder cleared.")
    }

    // ---------- Folder browser helpers ----------

    const cleanFolders = (folders: FolderOption[]) =>
        folders.filter((f) => {
            const t = f.name.trim()
            return t && !t.startsWith(".") && !/^\d+$/.test(t)
        })

    const loadSubfolders = async (parentId: string | null) => {
        setLoadingSubfolders(true)
        try {
            const param = parentId || "root"
            const res = await fetch(`/api/google-drive/folders?parentId=${param}`)
            if (!res.ok) throw new Error("Failed to load folders")
            const data = await res.json()
            setSubfolders(cleanFolders(Array.isArray(data.folders) ? data.folders : []))
        } catch (error) {
            console.error(error)
            setMessage("error", "Failed to load folders.")
        } finally {
            setLoadingSubfolders(false)
        }
    }

    const enterBrowseMode = (files: File[]) => {
        setPendingFiles(files)
        setBrowsing(true)
        if (rootFolder) {
            setCurrentFolder(rootFolder)
            setFolderStack([])
            void loadSubfolders(rootFolder.id)
        } else {
            setCurrentFolder(null)
            setFolderStack([])
            void loadSubfolders(null)
        }
    }

    const navigateToFolder = (folder: BreadcrumbEntry) => {
        if (currentFolder) {
            setFolderStack((prev) => [...prev, currentFolder])
        }
        setCurrentFolder(folder)
        void loadSubfolders(folder.id)
    }

    const navigateBack = () => {
        if (folderStack.length > 0) {
            const newStack = [...folderStack]
            const parent = newStack.pop()!
            setFolderStack(newStack)
            setCurrentFolder(parent)
            void loadSubfolders(parent.id)
        } else if (rootFolder && currentFolder?.id !== rootFolder.id) {
            // Already at a level above root somehow, go to root
            setCurrentFolder(rootFolder)
            void loadSubfolders(rootFolder.id)
        } else if (!rootFolder) {
            setCurrentFolder(null)
            void loadSubfolders(null)
        }
    }

    const navigateToBreadcrumb = (index: number) => {
        if (index === -1) {
            if (rootFolder) {
                setCurrentFolder(rootFolder)
                setFolderStack([])
                void loadSubfolders(rootFolder.id)
            } else {
                setCurrentFolder(null)
                setFolderStack([])
                void loadSubfolders(null)
            }
        } else {
            const target = folderStack[index]
            setCurrentFolder(target)
            setFolderStack(folderStack.slice(0, index))
            void loadSubfolders(target.id)
        }
    }

    const cancelBrowsing = () => {
        setBrowsing(false)
        setPendingFiles([])
        setFolderStack([])
        setCurrentFolder(null)
        setSubfolders([])
    }

    const uploadToFolder = async (folderId: string) => {
        if (pendingFiles.length === 0) return
        setUploading(true)
        try {
            const formData = new FormData()
            pendingFiles.forEach((file) => formData.append("files", file, file.name))
            formData.append("folderId", folderId)

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
            cancelBrowsing()
        }
    }

    // ---------- Event handlers ----------

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        setDragging(false)
        if (!config.connected) return
        if (event.dataTransfer.files?.length) {
            enterBrowseMode(Array.from(event.dataTransfer.files))
        }
    }

    const handleFileInput = (files: FileList | null) => {
        if (!files || files.length === 0) return
        enterBrowseMode(Array.from(files))
    }

    // ---------- Disconnected state ----------

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
                                <Button disabled variant="secondary" size="sm">
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
                        <p className={cn("text-xs flex items-center gap-2", status.type === "error" ? "text-red-500" : "text-green-600")}>
                            {status.type === "error" ? <XCircle className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                            {status.message}
                        </p>
                    </div>
                )}
            </section>
        )
    }

    // ---------- Connected state ----------

    return (
        <section className="border border-border rounded-lg p-3">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md flex items-center justify-center bg-white dark:bg-zinc-800 border">
                        <GoogleDriveLogo className="w-4 h-4" />
                    </div>
                    <span className="w-2 h-2 rounded-full bg-green-500" title="Connected" />
                </div>

                {canManage && (
                    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-64 p-0">
                            {pickingRoot ? (
                                <div>
                                    {/* Root picker header */}
                                    <div className="flex items-center gap-1 px-3 py-2 border-b text-xs">
                                        <button
                                            onClick={rootPickerBack}
                                            disabled={!rootPickerFolder}
                                            className="p-0.5 rounded hover:bg-muted disabled:opacity-30 shrink-0"
                                        >
                                            <ArrowLeft className="h-3 w-3" />
                                        </button>
                                        <span className="font-medium truncate flex-1">
                                            {rootPickerFolder?.name || "My Drive"}
                                        </span>
                                        <button onClick={() => setPickingRoot(false)} className="p-0.5 rounded hover:bg-muted shrink-0">
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>

                                    {/* Root picker folder list */}
                                    <div className="max-h-40 overflow-y-auto">
                                        {loadingRootPicker ? (
                                            <div className="flex items-center justify-center py-4">
                                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                            </div>
                                        ) : rootPickerFolders.length === 0 ? (
                                            <div className="py-3 text-xs text-muted-foreground text-center">No folders</div>
                                        ) : (
                                            rootPickerFolders.map((folder) => (
                                                <button
                                                    key={folder.id}
                                                    onClick={() => rootPickerNavigate(folder)}
                                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-muted transition-colors"
                                                >
                                                    <FolderOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                                                    <span className="truncate flex-1">{folder.name}</span>
                                                    <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                                </button>
                                            ))
                                        )}
                                    </div>

                                    {/* Root picker actions */}
                                    <div className="border-t p-2 flex items-center gap-1.5">
                                        <Button
                                            onClick={confirmRootFolder}
                                            disabled={!rootPickerFolder}
                                            className="bg-[#1a73e8] hover:bg-[#1557b0] text-white flex-1"
                                            size="sm"
                                        >
                                            Set as root
                                        </Button>
                                        {rootFolder && (
                                            <Button variant="ghost" size="sm" onClick={clearRootFolder} className="text-xs">
                                                Clear
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-1">
                                    <button
                                        onClick={openRootPicker}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors"
                                    >
                                        <Settings2 className="h-3 w-3 text-muted-foreground" />
                                        <span className="flex-1 text-left">Root Folder</span>
                                        <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                                            {rootFolder?.name || "My Drive"}
                                        </span>
                                    </button>
                                    <button
                                        onClick={handleConnect}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors"
                                    >
                                        <GoogleDriveLogo className="h-3 w-3" />
                                        Switch Google Account
                                    </button>
                                    <button
                                        onClick={handleDisconnect}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors text-red-600"
                                    >
                                        <XCircle className="h-3 w-3" />
                                        Disconnect
                                    </button>
                                </div>
                            )}
                        </PopoverContent>
                    </Popover>
                )}
            </div>

            {/* Drop zone / Folder browser */}
            {browsing ? (
                <div className="border-2 border-blue-500 rounded-lg overflow-hidden min-h-[200px] flex flex-col">
                    {/* Breadcrumb header */}
                    <div className="flex items-center gap-1 px-3 py-2 bg-muted/50 border-b text-xs">
                        <button
                            onClick={navigateBack}
                            disabled={rootFolder ? currentFolder?.id === rootFolder.id : !currentFolder}
                            className="p-0.5 rounded hover:bg-muted disabled:opacity-30 shrink-0"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                        </button>

                        <div className="flex items-center gap-1 overflow-x-auto min-w-0 flex-1">
                            <button
                                onClick={() => navigateToBreadcrumb(-1)}
                                className="text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
                            >
                                {rootFolder?.name || "My Drive"}
                            </button>
                            {folderStack.map((entry, i) => (
                                <span key={entry.id} className="flex items-center gap-1 shrink-0">
                                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                    <button
                                        onClick={() => navigateToBreadcrumb(i)}
                                        className="text-muted-foreground hover:text-foreground whitespace-nowrap"
                                    >
                                        {entry.name}
                                    </button>
                                </span>
                            ))}
                            {currentFolder && currentFolder.id !== rootFolder?.id && (
                                <span className="flex items-center gap-1 shrink-0">
                                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                    <span className="font-medium whitespace-nowrap">{currentFolder.name}</span>
                                </span>
                            )}
                        </div>

                        <button
                            onClick={cancelBrowsing}
                            className="p-0.5 rounded hover:bg-muted shrink-0"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>

                    {/* Folder list */}
                    <ScrollArea className="flex-1">
                        <div className="min-h-[120px]">
                            {loadingSubfolders ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                </div>
                            ) : subfolders.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-xs text-muted-foreground">
                                    <FolderOpen className="h-5 w-5 mb-1" />
                                    No subfolders
                                </div>
                            ) : (
                                subfolders.map((folder) => (
                                    <button
                                        key={folder.id}
                                        onClick={() => navigateToFolder(folder)}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-muted transition-colors"
                                    >
                                        <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                                        <span className="truncate flex-1">{folder.name}</span>
                                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    </button>
                                ))
                            )}
                        </div>
                    </ScrollArea>

                    {/* Footer with upload action */}
                    <div className="border-t px-3 py-2 bg-muted/30 space-y-1.5">
                        <div className="flex items-center gap-2">
                            <Button
                                onClick={() => uploadToFolder(currentFolder?.id || "root")}
                                disabled={uploading}
                                className="bg-[#1a73e8] hover:bg-[#1557b0] text-white flex-1"
                                size="sm"
                            >
                                {uploading ? (
                                    <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                        Uploading...
                                    </>
                                ) : (
                                    `Upload ${pendingFiles.length} file${pendingFiles.length === 1 ? "" : "s"} here`
                                )}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={cancelBrowsing}
                                disabled={uploading}
                            >
                                Cancel
                            </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                            {pendingFiles.map((f) => f.name).join(", ")}
                        </p>
                    </div>
                </div>
            ) : (
                <div
                    className={cn(
                        "border-2 border-dashed rounded-lg transition-all cursor-pointer",
                        "border-border hover:border-muted-foreground/60",
                        dragging && "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
                    )}
                    onDragOver={(event) => {
                        event.preventDefault()
                        setDragging(true)
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div className="flex flex-col items-center justify-center py-10 px-4">
                        {uploading ? (
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-2" />
                        ) : (
                            <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />
                        )}
                        <span className="text-sm text-muted-foreground">
                            {uploading ? "Uploading..." : "Drop files or click to upload"}
                        </span>
                    </div>
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                    handleFileInput(event.target.files)
                    event.target.value = ""
                }}
            />

            {/* Status messages */}
            {status && (
                <div className="mt-3">
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
