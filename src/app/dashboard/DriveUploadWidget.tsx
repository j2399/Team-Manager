"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react"
import Link from "next/link"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
    ArrowLeft, ChevronDown, ChevronRight, ExternalLink, File, FileAudio,
    FileImage, FileSpreadsheet, FileText, FileVideo, Folder, Loader2,
    Plus, RotateCw, Settings, Upload, X
} from "lucide-react"

type DriveConfig = {
    connected: boolean
    folderId: string | null
    folderName: string | null
    connectedByName: string | null
}

type Props = {
    initialConfig: DriveConfig
    canManage: boolean
    className?: string
}

type FolderNode = {
    id: string
    name: string
    parents: string[]
    modifiedTime?: string | null
}

type FileItem = {
    id: string
    name: string
    mimeType: string
    modifiedTime: string | null
    size: string | null
    iconLink: string | null
    webViewLink: string | null
}

function fileIcon(mime: string) {
    if (mime.startsWith("image/")) return FileImage
    if (mime.startsWith("video/")) return FileVideo
    if (mime.startsWith("audio/")) return FileAudio
    if (mime.includes("spreadsheet") || mime.includes("excel")) return FileSpreadsheet
    if (mime.includes("document") || mime.includes("text") || mime.includes("pdf")) return FileText
    return File
}

function relDate(s: string | null) {
    if (!s) return ""
    const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
    if (d === 0) return "Today"
    if (d === 1) return "Yesterday"
    if (d < 7) return `${d}d ago`
    return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

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

export function DriveUploadWidget({ initialConfig, canManage, className }: Props) {
    const [tree, setTree] = useState<FolderNode[]>([])
    const [loading, setLoading] = useState(false)
    const [folderId, setFolderId] = useState<string | null>(initialConfig.folderId)
    const [stack, setStack] = useState<string[]>([])
    const [pending, setPending] = useState<File[] | null>(null)
    const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
    const [uploading, setUploading] = useState(false)
    const [files, setFiles] = useState<FileItem[]>([])
    const [loadingFiles, setLoadingFiles] = useState(false)
    const [dragOver, setDragOver] = useState(false)
    const [spinning, setSpinning] = useState(false)
    const [showAllFiles, setShowAllFiles] = useState(false)

    const inputRef = useRef<HTMLInputElement>(null)
    const dcRef = useRef(0)

    const root = initialConfig.folderId
    const rootName = initialConfig.folderName || "Drive"
    const cacheKey = root ? `driveFolderTree:${root}` : null
    const cacheTimeKey = cacheKey ? `${cacheKey}:ts` : null

    const folderMap = useMemo(() => {
        const m = new Map<string, FolderNode>()
        tree.forEach((n) => m.set(n.id, n))
        return m
    }, [tree])

    const childMap = useMemo(() => {
        const m = new Map<string, FolderNode[]>()
        tree.forEach((n) => {
            n.parents?.forEach((pid) => {
                if (!m.has(pid)) m.set(pid, [])
                m.get(pid)!.push(n)
            })
        })
        m.forEach((arr) =>
            arr.sort((a, b) => {
                const at = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0
                const bt = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0
                return bt - at
            })
        )
        return m
    }, [tree])

    const children = folderId ? childMap.get(folderId) || [] : []
    const atRoot = folderId === root
    const hasSub = (id: string) => (childMap.get(id) || []).length > 0

    const crumbs = useMemo(() => {
        if (!root) return []
        const c: { id: string; name: string }[] = [{ id: root, name: rootName }]
        for (const id of stack) {
            if (id === root) continue
            c.push({ id, name: folderMap.get(id)?.name || "..." })
        }
        if (folderId && folderId !== root)
            c.push({ id: folderId, name: folderMap.get(folderId)?.name || "..." })
        return c
    }, [stack, folderId, root, rootName, folderMap])

    const flash = (ok: boolean, msg: string, ms = 3500) => {
        setToast({ ok, msg })
        setTimeout(() => setToast(null), ms)
    }

    /* data */
    const loadTree = async (keep = false) => {
        if (!root) return
        setLoading(true)
        try {
            const r = await fetch(`/api/google-drive/folders/tree?rootId=${root}`)
            if (!r.ok) throw 0
            const d = await r.json()
            const nextTree = Array.isArray(d.folders) ? d.folders : []
            setTree(nextTree)
            if (cacheKey && cacheTimeKey && nextTree.length > 0) {
                try {
                    sessionStorage.setItem(cacheKey, JSON.stringify(nextTree))
                    sessionStorage.setItem(cacheTimeKey, String(Date.now()))
                } catch {
                    // Ignore cache write failures
                }
            }
            if (!keep) { setFolderId(root); setStack([]) }
        } catch { flash(false, "Failed to load") }
        finally { setLoading(false) }
    }

    const loadFiles = async (id: string) => {
        setLoadingFiles(true)
        try {
            const r = await fetch(`/api/google-drive/files?folderId=${id}`)
            if (!r.ok) throw 0
            const d = await r.json()
            setFiles(Array.isArray(d.files) ? d.files : [])
        } catch { setFiles([]) }
        finally { setLoadingFiles(false) }
    }

    useEffect(() => {
        if (initialConfig.connected && root) {
            void loadTree()
            void loadFiles(root)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialConfig.connected, root])

    /* nav */
    const go = (id: string) => {
        if (!id) return
        if (folderId) setStack((s) => [...s, folderId])
        setFolderId(id)
        setShowAllFiles(false)
        void loadFiles(id)
    }

    const back = () => {
        if (stack.length === 0) {
            setFolderId(root)
            if (root) void loadFiles(root)
            return
        }
        const s = [...stack]
        const p = s.pop()!
        setStack(s)
        setFolderId(p)
        void loadFiles(p)
    }

    const jumpTo = (i: number) => {
        const c = crumbs[i]
        if (!c) return
        if (i === 0) {
            setFolderId(root); setStack([]); setFiles([])
            if (root) void loadFiles(root)
        } else {
            setStack(crumbs.slice(1, i).map((x) => x.id))
            setFolderId(c.id)
            void loadFiles(c.id)
        }
    }

    /* upload */
    const upload = async (list: File[], targetId: string, targetName?: string) => {
        if (!root) return
        if (!list.length) return
        const n = targetName || "folder"
        setUploading(true)
        flash(true, `Uploading ${list.length} file${list.length > 1 ? "s" : ""} to ${n}...`)
        try {
            const fd = new FormData()
            list.forEach((f) => fd.append("files", f, f.name))
            fd.append("folderId", targetId)
            const r = await fetch("/api/google-drive/upload", { method: "POST", body: fd })
            if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.error || "fail") }
            setPending(null)
            flash(true, `Sent to ${n}`, 5000)
            setTimeout(() => { if (folderId) void loadFiles(folderId) }, 2000)
        } catch { flash(false, "Upload failed") }
        finally { setUploading(false) }
    }

    const pick = (list: File[]) => {
        if (!list.length) return
        const tid = folderId || root
        if (!tid) return
        if (hasSub(tid)) {
            setPending(list)
            return
        }
        void upload(list, tid, folderMap.get(tid)?.name || rootName)
    }

    const clickFolder = (f: FolderNode) => {
        if (pending) {
            if (hasSub(f.id)) { go(f.id) }
            else { void upload(pending, f.id, f.name) }
            return
        }
        go(f.id)
    }

    /* drag */
    const onEnter = (e: DragEvent) => { e.preventDefault(); dcRef.current++; if (dcRef.current === 1) setDragOver(true) }
    const onLeave = () => { dcRef.current--; if (dcRef.current === 0) setDragOver(false) }
    const onOver = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
        e.preventDefault(); dcRef.current = 0; setDragOver(false)
        if (pending) return
        const f = Array.from(e.dataTransfer.files || [])
        if (f.length) pick(f)
    }

    const refresh = async () => {
        setSpinning(true)
        await loadTree(true)
        if (folderId) await loadFiles(folderId)
        setSpinning(false)
    }

    const onInput = (e: ChangeEvent<HTMLInputElement>) => {
        const f = Array.from(e.target.files || [])
        if (f.length) pick(f)
        e.target.value = ""
    }

    /* ── not connected / no root ── */
    if (!initialConfig.connected || !root) {
        return (
            <section className={cn("border border-border rounded-lg flex flex-col h-full items-center justify-center p-6", className)}>
                <DriveLogo className="w-8 h-8 mb-3 opacity-60" />
                {canManage ? (
                    <Link
                        href="/dashboard/settings?tab=integrations"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {!initialConfig.connected ? "Connect Google Drive" : "Select a root folder"} &rarr;
                    </Link>
                ) : (
                    <span className="text-xs text-muted-foreground">
                        {!initialConfig.connected ? "Google Drive not connected" : "No folder configured"}
                    </span>
                )}
            </section>
        )
    }

    /* ── connected ── */
    return (
        <section
            className={cn(
                "border border-border rounded-lg flex flex-col h-full relative overflow-hidden",
                dragOver && "ring-2 ring-blue-400 ring-inset",
                className
            )}
            onDragEnter={onEnter}
            onDragLeave={onLeave}
            onDragOver={onOver}
            onDrop={onDrop}
        >
            <input ref={inputRef} type="file" multiple className="hidden" onChange={onInput} />

            {/* drop overlay */}
            {dragOver && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-[2px]">
                    <div className="flex flex-col items-center gap-1">
                        <Upload className="h-5 w-5 text-blue-500" />
                        <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">Drop to upload</span>
                    </div>
                </div>
            )}

            {/* toolbar */}
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-muted/30">
                {!atRoot && (
                    <button onClick={back} className="p-1 rounded hover:bg-muted transition-colors shrink-0" aria-label="Back">
                        <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                )}

                <div className="flex-1 flex items-center gap-0.5 text-[11px] overflow-x-auto whitespace-nowrap min-w-0 scrollbar-none">
                    {crumbs.map((c, i) => (
                        <span key={`${c.id}-${i}`} className="flex items-center gap-0.5 shrink-0">
                            {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
                            <button
                                onClick={() => jumpTo(i)}
                                className={cn(
                                    "px-1 py-0.5 rounded transition-colors truncate max-w-[90px]",
                                    i === crumbs.length - 1
                                        ? "font-medium text-foreground"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                )}
                            >
                                {c.name}
                            </button>
                        </span>
                    ))}
                </div>

                <button
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                    className="p-1 rounded hover:bg-muted transition-colors shrink-0 disabled:opacity-30"
                    aria-label="Upload"
                >
                    <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                    onClick={refresh}
                    disabled={spinning || loading}
                    className="p-1 rounded hover:bg-muted transition-colors shrink-0 disabled:opacity-30"
                    aria-label="Refresh"
                >
                    <RotateCw className={cn("h-3.5 w-3.5", spinning && "animate-spin")} />
                </button>
                {canManage && (
                    <Link
                        href="/dashboard/settings?tab=integrations"
                        className="p-1 rounded hover:bg-muted transition-colors shrink-0"
                        aria-label="Settings"
                    >
                        <Settings className="h-3.5 w-3.5" />
                    </Link>
                )}
            </div>

            {/* pending banner */}
            {pending && (
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 text-[11px] text-amber-700 dark:text-amber-400">
                    <span>{pending.length} file{pending.length > 1 ? "s" : ""} — select destination</span>
                    <button onClick={() => setPending(null)} className="hover:text-amber-900 dark:hover:text-amber-200">
                        <X className="h-3 w-3" />
                    </button>
                </div>
            )}

            {/* content */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <ScrollArea className="flex-1">
                    <div className="py-1">
                        {/* folders */}
                        {children.map((f) => (
                            <button
                                key={f.id}
                                onClick={() => clickFolder(f)}
                                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors group"
                            >
                                <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="flex-1 text-xs truncate">{f.name}</span>
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
                            </button>
                        ))}

                        {/* divider */}
                        {children.length > 0 && files.length > 0 && !loadingFiles && (
                            <div className="border-t border-border mx-3 my-1" />
                        )}

                        {/* files */}
                        {loadingFiles ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <>
                                {(showAllFiles ? files : files.slice(0, 3)).map((f) => {
                                    const Icon = fileIcon(f.mimeType)
                                    const url = f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`
                                    return (
                                        <a
                                            key={f.id}
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted/50 transition-colors group"
                                        >
                                            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                            <span className="flex-1 text-xs truncate">{f.name}</span>
                                            <span className="text-[10px] text-muted-foreground shrink-0">{relDate(f.modifiedTime)}</span>
                                            <ExternalLink className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground shrink-0 transition-colors" />
                                        </a>
                                    )
                                })}
                                {files.length > 3 && (
                                    <button
                                        onClick={() => setShowAllFiles((v) => !v)}
                                        className="w-full flex items-center justify-center gap-1 px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        {showAllFiles ? "Show less" : `${files.length - 3} more files`}
                                        <ChevronDown className={cn("h-3 w-3 transition-transform", showAllFiles && "rotate-180")} />
                                    </button>
                                )}
                            </>
                        )}

                        {/* empty */}
                        {children.length === 0 && files.length === 0 && !loadingFiles && (
                            <div className="flex flex-col items-center justify-center py-8 gap-2">
                                <Folder className="h-6 w-6 text-muted-foreground/30" />
                                <span className="text-[11px] text-muted-foreground">Empty folder</span>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            )}

            {/* toast */}
            {toast && (
                <div className={cn(
                    "absolute bottom-2 left-2 right-2 z-30 px-3 py-1.5 rounded-md text-[11px] flex items-center gap-2 shadow-sm transition-all",
                    toast.ok
                        ? "bg-foreground text-background"
                        : "bg-red-600 text-white"
                )}>
                    {toast.msg}
                </div>
            )}
        </section>
    )
}
