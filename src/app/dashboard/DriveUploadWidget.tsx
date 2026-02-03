"use client"

import { useEffect, useMemo, useState, type DragEvent } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Check, FolderOpen, Loader2, Settings, XCircle } from "lucide-react"

type DriveConfig = {
    connected: boolean
    folderId: string | null
    folderName: string | null
    connectedByName: string | null
}

type DriveUploadWidgetProps = {
    initialConfig: DriveConfig
    canManage: boolean
    className?: string
}

type DriveFolderNode = {
    id: string
    name: string
    parents: string[]
    modifiedTime?: string | null
}

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

export function DriveUploadWidget({ initialConfig, canManage, className }: DriveUploadWidgetProps) {
    const [folderTree, setFolderTree] = useState<DriveFolderNode[]>([])
    const [loadingTree, setLoadingTree] = useState(false)
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(initialConfig.folderId)
    const [folderStack, setFolderStack] = useState<string[]>([])
    const [pendingFiles, setPendingFiles] = useState<File[] | null>(null)
    const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null)
    const [dragTarget, setDragTarget] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)

    const rootFolderId = initialConfig.folderId
    const rootFolderName = initialConfig.folderName || "Root"

    const folderMap = useMemo(() => {
        const map = new Map<string, DriveFolderNode>()
        folderTree.forEach((node) => map.set(node.id, node))
        return map
    }, [folderTree])

    const childrenMap = useMemo(() => {
        const map = new Map<string, DriveFolderNode[]>()
        folderTree.forEach((node) => {
            node.parents?.forEach((parentId) => {
                if (!map.has(parentId)) map.set(parentId, [])
                map.get(parentId)!.push(node)
            })
        })
        map.forEach((children) =>
            children.sort((a, b) => {
                const aTime = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0
                const bTime = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0
                return bTime - aTime
            })
        )
        return map
    }, [folderTree])

    const currentFolderName = currentFolderId
        ? folderMap.get(currentFolderId)?.name || (currentFolderId === rootFolderId ? rootFolderName : "Folder")
        : rootFolderName

    const currentChildren = currentFolderId ? childrenMap.get(currentFolderId) || [] : []

    const setMessage = (type: "success" | "error", message: string) => {
        setStatus({ type, message })
        setTimeout(() => setStatus(null), 4000)
    }

    const fetchTree = async () => {
        if (!rootFolderId) return
        setLoadingTree(true)
        try {
            const res = await fetch(`/api/google-drive/folders/tree?rootId=${rootFolderId}`)
            if (!res.ok) throw new Error("Failed to load folders")
            const data = await res.json()
            setFolderTree(Array.isArray(data.folders) ? data.folders : [])
            setCurrentFolderId(rootFolderId)
            setFolderStack([])
        } catch (error) {
            console.error(error)
            setMessage("error", "Failed to load folders.")
        } finally {
            setLoadingTree(false)
        }
    }

    useEffect(() => {
        if (initialConfig.connected && rootFolderId) {
            void fetchTree()
        }
    }, [initialConfig.connected, rootFolderId])

    const hasChildren = (folderId: string) => (childrenMap.get(folderId) || []).length > 0

    const navigateToFolder = (folderId: string) => {
        if (!folderId) return
        if (currentFolderId) {
            setFolderStack((prev) => [...prev, currentFolderId])
        }
        setCurrentFolderId(folderId)
    }

    const navigateBack = () => {
        if (folderStack.length === 0) {
            setCurrentFolderId(rootFolderId)
            return
        }
        const next = [...folderStack]
        const parent = next.pop()!
        setFolderStack(next)
        setCurrentFolderId(parent)
    }

    const uploadFiles = async (files: File[], folderId: string) => {
        if (!rootFolderId) {
            setMessage("error", "Select a destination folder in Settings first.")
            return
        }
        if (files.length === 0) return

        setUploading(true)
        setMessage("success", `Upload received. Processing ${files.length} file${files.length === 1 ? "" : "s"}.`)

        try {
            const formData = new FormData()
            files.forEach((file) => formData.append("files", file, file.name))
            formData.append("folderId", folderId)

            const res = await fetch("/api/google-drive/upload", {
                method: "POST",
                body: formData,
            })

            if (!res.ok) {
                const data = await res.json().catch(() => null)
                throw new Error(data?.error || "Upload failed")
            }

            setPendingFiles(null)
        } catch (error) {
            console.error(error)
            setMessage("error", "Upload failed. Try again.")
        } finally {
            setUploading(false)
        }
    }

    const handleDropToFolder = (event: DragEvent<HTMLDivElement>, folderId: string) => {
        event.preventDefault()
        setDragTarget(null)
        if (pendingFiles) return
        const files = Array.from(event.dataTransfer.files || [])
        if (files.length === 0) return

        if (hasChildren(folderId)) {
            setPendingFiles(files)
            navigateToFolder(folderId)
            setMessage("success", `Choose a subfolder for ${files.length} file${files.length === 1 ? "" : "s"}.`)
            return
        }

        void uploadFiles(files, folderId)
    }

    if (!initialConfig.connected) {
        return (
            <section className={cn("border border-border rounded-lg overflow-hidden flex flex-col h-full", className)}>
                <div className="bg-gradient-to-br from-blue-50 to-green-50 dark:from-blue-950/30 dark:to-green-950/30 p-6 flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center text-center space-y-4">
                        <div className="w-12 h-12 rounded-xl bg-white dark:bg-zinc-900 shadow-sm flex items-center justify-center">
                            <GoogleDriveLogo className="w-7 h-7" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="font-medium text-sm">Google Drive</h3>
                            <p className="text-xs text-muted-foreground max-w-[220px]">
                                {canManage
                                    ? "Set up Google Drive in Settings to upload files"
                                    : "Contact an admin to connect Google Drive"}
                            </p>
                        </div>
                        {canManage && (
                            <Link href="/dashboard/settings?tab=integrations">
                                <Button variant="outline" size="sm" className="gap-2">
                                    <Settings className="h-3.5 w-3.5" />
                                    Open Settings
                                </Button>
                            </Link>
                        )}
                    </div>
                </div>
            </section>
        )
    }

    return (
        <section className={cn("border border-border rounded-lg p-3 flex flex-col h-full", className)}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-md flex items-center justify-center bg-white dark:bg-zinc-800 border">
                        <GoogleDriveLogo className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs font-semibold">Google Drive</span>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <FolderOpen className="h-3 w-3" />
                            {rootFolderId ? `Root: ${rootFolderName}` : "No root folder"}
                        </span>
                    </div>
                </div>

                {canManage && (
                    <Link href="/dashboard/settings?tab=integrations">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]">
                            Settings
                        </Button>
                    </Link>
                )}
            </div>

            {!rootFolderId && (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                    Select a destination folder in Settings to enable uploads.
                </div>
            )}

            {rootFolderId && (
                <div className="flex-1 flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <button
                            onClick={() => {
                                if (!rootFolderId) return
                                setCurrentFolderId(rootFolderId)
                                setFolderStack([])
                            }}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            {rootFolderName}
                        </button>
                        {currentFolderId && currentFolderId !== rootFolderId && (
                            <span className="text-muted-foreground">/</span>
                        )}
                        {currentFolderId && currentFolderId !== rootFolderId && (
                            <span className="font-medium text-foreground truncate">{currentFolderName}</span>
                        )}
                        {pendingFiles && (
                            <span className="text-[11px] text-muted-foreground">Selecting for {pendingFiles.length} file(s)</span>
                        )}
                    </div>

                    {pendingFiles && (
                        <div className="text-[11px] text-muted-foreground">
                            Click folders to select the final destination.
                        </div>
                    )}

                    {loadingTree ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 auto-rows-fr flex-1">
                            {currentChildren.length === 0 && (
                                <div className="col-span-2 text-xs text-muted-foreground text-center py-6">
                                    No subfolders found.
                                </div>
                            )}

                            {currentChildren.map((folder) => (
                                <div
                                    key={folder.id}
                                    className={cn(
                                        "border rounded-lg p-3 text-xs flex flex-col gap-2 transition-all",
                                        !pendingFiles && dragTarget === folder.id && "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
                                    )}
                                    onDragOver={(event) => {
                                        if (pendingFiles) return
                                        event.preventDefault()
                                        setDragTarget(folder.id)
                                    }}
                                    onDragLeave={() => setDragTarget(null)}
                                    onDrop={(event) => handleDropToFolder(event, folder.id)}
                                >
                                    <button
                                        onClick={() => {
                                            if (pendingFiles) {
                                                if (hasChildren(folder.id)) {
                                                    navigateToFolder(folder.id)
                                                } else {
                                                    uploadFiles(pendingFiles, folder.id)
                                                }
                                                return
                                            }
                                            navigateToFolder(folder.id)
                                        }}
                                        className="flex items-center gap-2 text-left"
                                    >
                                        <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                                        <span className="font-medium text-foreground truncate">{folder.name}</span>
                                    </button>
                                    <span className="text-[10px] text-muted-foreground">
                                        {pendingFiles ? "Click to select" : "Drop to start"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

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

            {uploading && (
                <div className="mt-2 text-[11px] text-muted-foreground">Uploading in background…</div>
            )}
        </section>
    )
}
