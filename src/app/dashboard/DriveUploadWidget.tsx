"use client"

import { useRef, useState, type DragEvent } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Check, FolderOpen, Loader2, Settings, UploadCloud, XCircle } from "lucide-react"

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
    const [uploading, setUploading] = useState(false)
    const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null)
    const [dragging, setDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const config = initialConfig
    const hasFolder = !!config.folderId

    const setMessage = (type: "success" | "error", message: string) => {
        setStatus({ type, message })
        setTimeout(() => setStatus(null), 4000)
    }

    const uploadFiles = async (files: File[]) => {
        if (!config.connected || !hasFolder) {
            setMessage("error", "Set a destination folder in Settings first.")
            return
        }
        if (files.length === 0) return

        setUploading(true)
        try {
            const formData = new FormData()
            files.forEach((file) => formData.append("files", file, file.name))

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
            uploadFiles(Array.from(event.dataTransfer.files))
        }
    }

    const handleFileInput = (files: FileList | null) => {
        if (!files || files.length === 0) return
        uploadFiles(Array.from(files))
    }

    if (!config.connected) {
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
                            <Link href="/dashboard/settings">
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
                            {config.folderName ? `Uploads to ${config.folderName}` : "No folder selected"}
                        </span>
                    </div>
                </div>

                {canManage && (
                    <Link href="/dashboard/settings">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]">
                            Settings
                        </Button>
                    </Link>
                )}
            </div>

            {!hasFolder && (
                <div className="mb-3 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                    Select a destination folder in Settings to enable uploads.
                </div>
            )}

            <div
                className={cn(
                    "border-2 border-dashed rounded-lg transition-all cursor-pointer flex-1 flex",
                    "border-border hover:border-muted-foreground/60",
                    dragging && "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20",
                    !hasFolder && "opacity-60 pointer-events-none"
                )}
                onDragOver={(event) => {
                    event.preventDefault()
                    setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => {
                    if (hasFolder) fileInputRef.current?.click()
                }}
            >
                <div className="flex flex-col items-center justify-center py-10 px-4 flex-1">
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
