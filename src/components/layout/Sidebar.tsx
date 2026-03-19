"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import {
    LayoutDashboard, Users, LogOut, Settings, ChevronDown,
    Plus, MoreHorizontal, FolderKanban, Pencil, Trash2, User, GripVertical,
    Kanban, Loader2, Smile, Archive, ArchiveRestore
} from "lucide-react"
import { DiscordIcon } from "@/components/icons/DiscordIcon"
import { SpinningDots } from "@/components/ui/spinning-dots"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core"
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RemoveScroll } from "react-remove-scroll"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { GeneralChat } from "@/components/layout/GeneralChat"
import { CreateProjectWizard } from "@/features/projects/CreateProjectWizard"
import { preloadBoardModule } from "@/lib/board-module"
import { deleteProject, updateProjectDetails } from "@/app/actions/projects"

type Project = {
    id: string
    name: string
    description: string | null
    color?: string | null
    archivedAt: string | null
    leadId: string | null
    lead: { id: string; name: string } | null
    leadIds: string[]
    leads: { id: string; name: string }[]
    members: { userId: string }[]
}

type UserCandidate = {
    id: string
    name: string
    role: string
}

type LeadCandidate = {
    id: string
    name: string
    role: string
}

type UserData = {
    name: string
    role: string
    id: string | null
    workspaceId?: string | null
    workspaceName?: string
    avatar?: string | null
}

function hexToRgba(hex: string, alpha: number) {
    const clampedAlpha = Math.max(0, Math.min(1, alpha))
    const normalized = hex.trim().replace(/^#/, "")
    const expanded = normalized.length === 3
        ? normalized.split("").map((c) => c + c).join("")
        : normalized

    if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return `rgba(59, 130, 246, ${clampedAlpha})`

    const r = parseInt(expanded.slice(0, 2), 16)
    const g = parseInt(expanded.slice(2, 4), 16)
    const b = parseInt(expanded.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`
}

const PROJECT_COLOR_OPTIONS = [
    "#ef4444", // red
    "#f97316", // orange
    "#f59e0b", // amber
    "#22c55e", // green
    "#14b8a6", // teal
    "#06b6d4", // cyan
    "#3b82f6", // blue
    "#6366f1", // indigo
    "#8b5cf6", // violet
    "#ec4899", // pink
] as const

type ProjectRowProps = {
    project: Project
    pathname: string
    navigatingTo: string | null
    isAdmin: boolean
    setNavigatingTo: (path: string) => void
    onPrefetchProject: (projectId: string) => void
    setEditingProject: (project: Project) => void
    setDeleteConfirm: (project: Project) => void
    onToggleArchive: (project: Project) => void
}

function ProjectRowInner({
    project,
    pathname,
    navigatingTo,
    isAdmin,
    setNavigatingTo,
    onPrefetchProject,
    setEditingProject,
    setDeleteConfirm,
    onToggleArchive,
    dragHandle,
    rowRef,
    style
}: ProjectRowProps & {
    dragHandle?: React.ReactNode
    rowRef?: React.Ref<HTMLDivElement>
    style?: React.CSSProperties & { '--project-active-bg'?: string }
}) {
    const isActive = pathname === `/dashboard/projects/${project.id}`

    return (
        <div
            ref={rowRef}
            style={style}
            className={cn(
                "group relative flex w-full min-w-0 items-center rounded-md transition-all duration-300",
                project.archivedAt && "opacity-60",
                !isActive && (project.archivedAt ? "hover:bg-muted/30" : "hover:bg-muted/50")
            )}
        >
            {/* Active gradient indicator - animates from right */}
            <div
                className={cn(
                    "absolute inset-0 rounded-md pointer-events-none transition-all duration-300",
                    isActive
                        ? (project.archivedAt ? "bg-muted/50" : "animate-sidebar-gradient")
                        : "scale-x-0 origin-right"
                )}
                style={project.archivedAt ? undefined : {
                    background: "linear-gradient(to left, var(--project-active-bg, rgba(59, 130, 246, 0.22)), transparent 60%)",
                }}
            />
            {dragHandle ?? <div className="h-6 w-6 shrink-0" />}
            <Link
                href={`/dashboard/projects/${project.id}`}
                prefetch={false}
                onClick={() => !isActive && setNavigatingTo(`/dashboard/projects/${project.id}`)}
                onMouseEnter={() => onPrefetchProject(project.id)}
                onFocus={() => onPrefetchProject(project.id)}
                onTouchStart={() => onPrefetchProject(project.id)}
                className={cn(
                    "relative z-10 rounded-md pl-2 py-1.5 text-sm transition-colors flex-1 min-w-0",
                    isActive
                        ? (project.archivedAt ? "font-normal text-foreground" : "font-medium")
                        : "text-muted-foreground group-hover:text-foreground",
                    project.archivedAt && !isActive && "text-muted-foreground/70 group-hover:text-muted-foreground"
                )}
                title={project.name}
            >
                <span className="block truncate">{project.name}</span>
            </Link>
            {isAdmin && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="relative z-20 h-6 w-6 shrink-0 ml-auto text-muted-foreground/50 hover:text-muted-foreground hover:bg-transparent focus:bg-transparent"
                        >
                            {navigatingTo === `/dashboard/projects/${project.id}` ? (
                                <div className="flex items-center gap-[3px]">
                                    {[0, 1, 2].map((i) => (
                                        <span
                                            key={i}
                                            className="w-[3px] h-[3px] rounded-full bg-current animate-bounce"
                                            style={{
                                                animationDuration: '0.6s',
                                                animationDelay: `${i * 0.1}s`,
                                            }}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <MoreHorizontal className="h-4 w-4" />
                            )}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="right" className="w-40 z-50">
                        <DropdownMenuItem onSelect={() => setEditingProject(project)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onToggleArchive(project)}>
                            {project.archivedAt ? (
                                <ArchiveRestore className="h-4 w-4 mr-2" />
                            ) : (
                                <Archive className="h-4 w-4 mr-2" />
                            )}
                            {project.archivedAt ? 'Restore' : 'Archive'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onSelect={() => setDeleteConfirm(project)}
                            className="text-red-600"
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    )
}

const SortableProjectRow = React.memo((props: ProjectRowProps) => {
    const { project } = props
    const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: project.id })
    const projectColor = project.color || "#3b82f6"
    const style: React.CSSProperties & { '--project-active-bg': string } = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        '--project-active-bg': hexToRgba(projectColor, 0.22),
    }

    return (
        <ProjectRowInner
            {...props}
            rowRef={setNodeRef}
            style={style}
            dragHandle={(
                <button
                    type="button"
                    className="relative z-10 h-6 w-6 shrink-0 flex items-center justify-center rounded-md cursor-grab active:cursor-grabbing opacity-60 group-hover:opacity-100"
                    style={{ color: projectColor }}
                    onClick={(e) => e.preventDefault()}
                    {...attributes}
                    {...listeners}
                    title="Reorder"
                >
                    <GripVertical className="h-4 w-4" />
                </button>
            )}
        />
    )
})
SortableProjectRow.displayName = "SortableProjectRow"

const StaticProjectRow = React.memo((props: ProjectRowProps) => {
    return <ProjectRowInner {...props} />
})
StaticProjectRow.displayName = "StaticProjectRow"

export function Sidebar({ initialUserData, isMobileSheet = false }: { initialUserData?: Partial<UserData>; isMobileSheet?: boolean } = {}) {
    const pathname = usePathname()
    const router = useRouter()
    const [projects, setProjects] = React.useState<Project[]>([])
    const [archivedProjects, setArchivedProjects] = React.useState<Project[]>([])
    const [projectsOpen, setProjectsOpen] = React.useState(true)
    const [archivedProjectsOpen, setArchivedProjectsOpen] = React.useState(false)
    const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
    const [editingProject, setEditingProject] = React.useState<Project | null>(null)
    const [deleteConfirm, setDeleteConfirm] = React.useState<Project | null>(null)
    const [deleteConfirmName, setDeleteConfirmName] = React.useState<string>("")
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const [navigatingTo, setNavigatingTo] = React.useState<string | null>(null)
    const [chatState, setChatState] = React.useState<'small' | 'large' | 'hidden'>('hidden')
    const editProjectDialogContentRef = React.useRef<HTMLDivElement | null>(null)
    const [settingsSpinNonce, setSettingsSpinNonce] = React.useState(0)
    const previousPathRef = React.useRef<string>('/dashboard')

    // Track previous path for settings toggle
    React.useEffect(() => {
        if (pathname !== '/dashboard/settings') {
            previousPathRef.current = pathname
        }
    }, [pathname])

    // Clear navigation loading state only when we've reached the destination
    React.useEffect(() => {
        if (navigatingTo && (pathname === navigatingTo || pathname.startsWith(navigatingTo.replace(/\/$/, '') + '/'))) {
            // Add a small delay to allow the actual page content to render
            const timer = setTimeout(() => setNavigatingTo(null), 300)
            return () => clearTimeout(timer)
        }
    }, [pathname, navigatingTo])

    React.useEffect(() => {
        if (archivedProjects.some((project) => pathname === `/dashboard/projects/${project.id}`)) {
            setArchivedProjectsOpen(true)
            setProjectsOpen(true)
        }
    }, [archivedProjects, pathname])

    // Form state for editing
    const [editLeadIds, setEditLeadIds] = React.useState<string[]>([])
    const [selectedMemberIds, setSelectedMemberIds] = React.useState<string[]>([])
    const [editColor, setEditColor] = React.useState<string>("#3b82f6")
    const [editName, setEditName] = React.useState<string>("")
    const [editDescription, setEditDescription] = React.useState<string>("")
    const [editError, setEditError] = React.useState<string | null>(null)

    const selectedEditMemberIds = React.useMemo(
        () => Array.from(new Set([...selectedMemberIds, ...editLeadIds])),
        [editLeadIds, selectedMemberIds]
    )

    const initialUserId = initialUserData?.id ?? null
    const initialWorkspaceId = initialUserData?.workspaceId ?? null
    const workspaceUsersResult = useQuery(
        api.admin.getWorkspaceUsers,
        initialWorkspaceId ? { workspaceId: initialWorkspaceId } : "skip"
    )
    const leadUsersResult = useQuery(
        api.admin.getWorkspaceUsers,
        initialWorkspaceId ? { workspaceId: initialWorkspaceId, role: "leads" } : "skip"
    )
    const projectListResult = useQuery(
        api.projectsAdmin.listProjects,
        initialUserId && initialWorkspaceId
            ? {
                workspaceId: initialWorkspaceId,
                userId: initialUserId,
                includeArchived: true,
                includeLead: true,
            }
            : "skip"
    )
    const reorderProjects = useMutation(api.projectsAdmin.reorderProjects)

    const currentUserRecord = workspaceUsersResult?.users.find((candidate) => candidate.id === initialUserId)
    const userData: UserData = {
        name: currentUserRecord?.name ?? initialUserData?.name ?? "User",
        role: currentUserRecord?.role ?? initialUserData?.role ?? "Member",
        id: initialUserId,
        workspaceId: initialWorkspaceId,
        workspaceName: initialUserData?.workspaceName,
        avatar: currentUserRecord?.avatar ?? initialUserData?.avatar ?? null,
    }
    const allUsers: UserCandidate[] = (workspaceUsersResult?.users ?? []).map((user) => ({
        id: user.id,
        name: user.name,
        role: user.role,
    }))
    const leadCandidates: UserCandidate[] = (leadUsersResult?.users ?? []).map((user) => ({
        id: user.id,
        name: user.name,
        role: user.role,
    }))

    const isAdmin = userData.role === 'Admin' || userData.role === 'Team Lead'
    const prefetchProject = React.useCallback((projectId: string) => {
        preloadBoardModule()
        router.prefetch(`/dashboard/projects/${projectId}`)
    }, [router])

    React.useEffect(() => {
        if (!projectListResult) return

        const serializedProjects = projectListResult.map((project) => ({
            ...project,
            archivedAt: typeof project.archivedAt === "number"
                ? new Date(project.archivedAt).toISOString()
                : null,
        }))

        setProjects(serializedProjects.filter((project) => !project.archivedAt))
        setArchivedProjects(serializedProjects.filter((project) => Boolean(project.archivedAt)))
    }, [projectListResult])

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
    )

    const persistProjectOrder = React.useCallback(async (projectIds: string[]) => {
        if (!userData.id || !userData.workspaceId) return

        try {
            await reorderProjects({
                userId: userData.id,
                workspaceId: userData.workspaceId,
                projectIds,
                now: Date.now(),
            })
        } catch {
            // best-effort; sidebar will refresh order on next fetch
        }
    }, [reorderProjects, userData.id, userData.workspaceId])

    const handleProjectDragEnd = React.useCallback((event: DragEndEvent) => {
        const { active, over } = event
        if (!active?.id || !over?.id || active.id === over.id) return
        setProjects((current) => {
            const oldIndex = current.findIndex((p) => p.id === active.id)
            const newIndex = current.findIndex((p) => p.id === over.id)
            if (oldIndex === -1 || newIndex === -1) return current
            const next = arrayMove(current, oldIndex, newIndex)
            void persistProjectOrder(next.map((p) => p.id))
            return next
        })
    }, [persistProjectOrder])

    const handleToggleArchive = React.useCallback(async (project: Project) => {
        setIsSubmitting(true)
        try {
            const nextArchived = !project.archivedAt
            const result = await updateProjectDetails({
                projectId: project.id,
                archived: nextArchived,
            })

            if (result?.error) {
                alert(result.error || `Failed to ${nextArchived ? 'archive' : 'restore'} division`)
                return
            }

            router.refresh()
        } catch (error) {
            console.error(error)
            alert(`Failed to ${project.archivedAt ? 'restore' : 'archive'} division`)
        } finally {
            setIsSubmitting(false)
        }
    }, [router])

    React.useEffect(() => {
        const timer = window.setTimeout(() => {
            preloadBoardModule()
        }, 250)

        return () => {
            window.clearTimeout(timer)
        }
    }, [])

    // When editing division changes, update the lead id state
    React.useEffect(() => {
        if (editingProject) {
            setEditLeadIds(editingProject.leadIds || [])
            setSelectedMemberIds(editingProject.members?.map(m => m.userId) || [])
            setEditColor(editingProject.color || "#3b82f6")
            setEditName(editingProject.name || "")
            setEditDescription(editingProject.description || "")
            setEditError(null)
        } else {
            setEditLeadIds([])
            setSelectedMemberIds([])
            setEditName("")
            setEditDescription("")
            setEditError(null)
        }
    }, [editingProject])

    React.useEffect(() => {
        if (!editingProject || allUsers.length === 0) return
        const allowedIds = new Set(allUsers.map((u) => u.id))
        setSelectedMemberIds((prev) => {
            const next = prev.filter((id) => allowedIds.has(id))
            return next.length === prev.length ? prev : next
        })
    }, [editingProject, allUsers])

    const toggleMember = (userId: string) => {
        setSelectedMemberIds(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        )
    }

    const toggleEditLead = React.useCallback((userId: string) => {
        setEditLeadIds((prev) =>
            prev.includes(userId)
                ? prev.filter((id) => id !== userId)
                : [...prev, userId]
        )
    }, [])

    // Update division
    const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!editingProject) return
        const trimmedName = editName.trim()
        if (!trimmedName) {
            setEditError("Division name is required")
            return
        }

        setIsSubmitting(true)
        setEditError(null)

        try {
            const allowedIds = new Set(allUsers.map((u) => u.id))
            const sanitizedMemberIds = selectedEditMemberIds.filter((id) => allowedIds.has(id))
            const result = await updateProjectDetails({
                projectId: editingProject.id,
                name: trimmedName,
                description: editDescription.trim(),
                color: editColor,
                leadIds: editLeadIds,
                memberIds: sanitizedMemberIds,
            })
            if (!result?.error) {
                setEditingProject(null)
                router.refresh()
            } else {
                setEditError(result.error || "Failed to rename division")
            }
        } catch (err) {
            console.error(err)
            setEditError("Failed to rename division")
        }
        setIsSubmitting(false)
    }

    // Delete division
    const handleDelete = async () => {
        if (!deleteConfirm) return
        if (deleteConfirmName.trim() !== deleteConfirm.name.trim()) {
            return // Name doesn't match, don't delete
        }
        setIsSubmitting(true)

        try {
            const result = await deleteProject(deleteConfirm.id, deleteConfirmName.trim())
            if (!result?.error) {
                setDeleteConfirm(null)
                setDeleteConfirmName("")
                router.push('/dashboard')
                router.refresh()
            } else {
                alert(result.error || 'Failed to delete division')
            }
        } catch (err) {
            console.error(err)
        }
        setIsSubmitting(false)
    }

    return (
        <div className="flex h-full w-64 min-w-64 shrink-0 flex-col overflow-hidden border-r bg-background">
            <div className={cn(
                "relative flex items-center px-0 h-10 border-b transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden",
                chatState === 'large' ? "max-h-0 opacity-0 border-b-0" : "max-h-10 opacity-100"
            )}>
                <h1 className="text-sm font-semibold truncate pl-4 pr-12 w-full min-w-0">
                    {userData.workspaceName ?? ""}
                </h1>
                {!isMobileSheet && (
                    <button
                        type="button"
                        className={cn(
                            "absolute right-1 top-1 h-8 w-8 flex items-center justify-center rounded-md focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none transition-colors",
                            pathname === '/dashboard/settings' ? "bg-muted" : "hover:bg-muted/50"
                        )}
                        aria-label="Workspace settings"
                        title="Settings"
                        onClick={(e) => {
                            e.preventDefault()
                            setSettingsSpinNonce((n) => n + 1)
                            if (pathname === '/dashboard/settings') {
                                // Toggle back to previous page
                                router.push(previousPathRef.current)
                            } else {
                                router.push('/dashboard/settings')
                            }
                        }}
                    >
                        <Settings
                            key={settingsSpinNonce}
                            className={cn(
                                "h-4 w-4 transition-colors",
                                pathname === '/dashboard/settings' ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                                settingsSpinNonce > 0 && "motion-safe:animate-[cupi-gear-impulse_1200ms_ease-out_both]"
                            )}
                        />
                    </button>
                )}
            </div>

            <div className={cn(
                "transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden",
                chatState === 'large' ? "flex-[0.001] opacity-0" : chatState === 'hidden' ? "flex-1 opacity-100" : "flex-1 opacity-100"
            )}>
                <div
                    className="h-full w-full min-w-0 overflow-x-hidden overflow-y-scroll overscroll-contain custom-scrollbar"
                    style={{ scrollbarGutter: "stable" }}
                >
                    <nav className="w-full min-w-0 p-3">
                        {/* Dashboard Link */}
                        <Link
                            href="/dashboard"
                            onClick={() => pathname !== "/dashboard" && setNavigatingTo("/dashboard")}
                            className={cn(
                                "flex items-center gap-3 rounded-md px-3 py-2 transition-all hover:translate-x-0.5 text-sm",
                                pathname === "/dashboard" ? "bg-muted font-medium" : "text-muted-foreground"
                            )}
                        >
                            <LayoutDashboard className="h-5 w-5" />
                            Dashboard
                            {navigatingTo === "/dashboard" && <Loader2 className="h-4 w-4 ml-auto animate-spin" />}
                        </Link>

                        {/* My Board Link */}
                        <Link
                            href="/dashboard/my-board"
                            onClick={() => pathname !== "/dashboard/my-board" && setNavigatingTo("/dashboard/my-board")}
                            className={cn(
                                "flex items-center gap-3 rounded-md px-3 py-2 transition-all hover:translate-x-0.5 text-sm",
                                pathname === "/dashboard/my-board" ? "bg-muted font-medium" : "text-muted-foreground"
                            )}
                        >
                            <Kanban className="h-5 w-5" />
                            My Board
                            {navigatingTo === "/dashboard/my-board" && <Loader2 className="h-4 w-4 ml-auto animate-spin" />}
                        </Link>

                        {/* Divisions Section */}
                        <Collapsible open={projectsOpen} onOpenChange={setProjectsOpen} className="mt-2 min-w-0">
                            <div className="flex items-center">
                                <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-all hover:translate-x-0.5">
                                    <ChevronDown className={cn("h-5 w-5 transition-transform", !projectsOpen && "-rotate-90")} />
                                    <FolderKanban className="h-5 w-5" />
                                    <span>Divisions</span>
                                </CollapsibleTrigger>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 mr-1"
                                    onClick={() => setCreateDialogOpen(true)}
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                            <CollapsibleContent className="mt-1 min-w-0 space-y-1 overflow-hidden pl-6 pr-1">
                                {projects.length === 0 ? (
                                    <p className="text-sm text-muted-foreground px-3 py-1">
                                        {archivedProjects.length > 0 ? 'No active divisions' : 'No divisions yet'}
                                    </p>
                                ) : (
                                    <DndContext
                                        sensors={sensors}
                                        collisionDetection={closestCenter}
                                        onDragEnd={handleProjectDragEnd}
                                    >
                                        <TooltipProvider delayDuration={1000}>
                                            <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                                                {projects.map((project) => (
                                                    <SortableProjectRow
                                                        key={project.id}
                                                        project={project}
                                                        pathname={pathname}
                                                        navigatingTo={navigatingTo}
                                                        isAdmin={isAdmin}
                                                        setNavigatingTo={setNavigatingTo}
                                                        onPrefetchProject={prefetchProject}
                                                        setEditingProject={setEditingProject}
                                                        setDeleteConfirm={setDeleteConfirm}
                                                        onToggleArchive={handleToggleArchive}
                                                    />
                                                ))}
                                            </SortableContext>
                                        </TooltipProvider>
                                    </DndContext>
                                )}

                                {archivedProjects.length > 0 && (
                                    <Collapsible open={archivedProjectsOpen} onOpenChange={setArchivedProjectsOpen} className="min-w-0 pt-1">
                                        <CollapsibleTrigger className="flex w-full min-w-0 items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground/75 transition-colors hover:bg-muted/30 hover:text-muted-foreground">
                                            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !archivedProjectsOpen && "-rotate-90")} />
                                            <span className="flex-1 text-left text-muted-foreground/80">Archived</span>
                                            <span className="text-muted-foreground/70">{archivedProjects.length}</span>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="mt-1 min-w-0 space-y-1">
                                            {archivedProjects.map((project) => (
                                                <StaticProjectRow
                                                    key={project.id}
                                                    project={project}
                                                    pathname={pathname}
                                                    navigatingTo={navigatingTo}
                                                    isAdmin={isAdmin}
                                                    setNavigatingTo={setNavigatingTo}
                                                    onPrefetchProject={prefetchProject}
                                                    setEditingProject={setEditingProject}
                                                    setDeleteConfirm={setDeleteConfirm}
                                                    onToggleArchive={handleToggleArchive}
                                                />
                                            ))}
                                        </CollapsibleContent>
                                    </Collapsible>
                                )}
                            </CollapsibleContent>
                        </Collapsible>

                        {/* Settings Link (Mobile only) */}
                        {isMobileSheet && (
                            <Link
                                href="/dashboard/settings"
                                onClick={() => pathname !== "/dashboard/settings" && setNavigatingTo("/dashboard/settings")}
                                className={cn(
                                    "flex items-center gap-3 rounded-md px-3 py-2 transition-all hover:translate-x-0.5 text-sm mt-2",
                                    pathname === "/dashboard/settings" ? "bg-muted font-medium" : "text-muted-foreground"
                                )}
                            >
                                <Settings className="h-5 w-5" />
                                Settings
                                {navigatingTo === "/dashboard/settings" && <Loader2 className="h-4 w-4 ml-auto animate-spin" />}
                            </Link>
                        )}
                    </nav>
                </div>
            </div>

            <div className={cn(
                "shrink-0 flex flex-col min-h-0 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden",
                chatState === 'large' ? "grow basis-0" : chatState === 'hidden' ? "grow-0 basis-14 border-t" : "grow-0 basis-[320px] border-t"
            )}>
                <GeneralChat
                    isExpanded={chatState === 'large'}
                    onToggleExpand={() => {
                        setChatState(current => {
                            if (current === 'small') return 'large'
                            if (current === 'large') return 'hidden'
                            return 'small'
                        })
                    }}
                />
            </div>

            <div className={cn(
                "border-t transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden",
                chatState === 'large' ? "max-h-0 opacity-0 border-t-0 p-0" : "max-h-40 opacity-100 p-4"
            )}>
                <div className="flex items-center gap-3 mb-3">
                    {userData.avatar ? (
                        <img
                            src={userData.avatar}
                            alt={userData.name}
                            className="h-9 w-9 rounded-full object-cover"
                        />
                    ) : (
                        <div className="h-9 w-9 rounded-full bg-[#5865F2] flex items-center justify-center">
                            <DiscordIcon className="h-5 w-5 text-white" />
                        </div>
                    )}
                    <p className="text-sm font-medium truncate">{userData.name}</p>
                </div>
                <Button
                    variant="ghost"
                    className="w-full justify-start gap-2 h-9 text-sm"
                    size="sm"
                    onClick={() => {
                        setNavigatingTo('/workspaces')
                        window.location.href = '/workspaces'
                    }}
                >
                    <FolderKanban className="h-4 w-4" />
                    Back to Workspaces
                    {navigatingTo === '/workspaces' && <Loader2 className="h-4 w-4 ml-auto animate-spin" />}
                </Button>
            </div>

            {/* Create Division Wizard */}
            <CreateProjectWizard
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                leadCandidates={leadCandidates}
                allUsers={allUsers}
                onProjectCreated={() => router.refresh()}
            />

            {/* Edit Dialog */}
            <Dialog open={!!editingProject} onOpenChange={(open) => !open && setEditingProject(null)}>
                <DialogContent ref={editProjectDialogContentRef} className="sm:max-w-md">
                    <form onSubmit={handleUpdate} autoComplete="off">
                        <DialogHeader>
                            <DialogTitle className="sr-only">Edit</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-3 py-4">
                            <div className="grid gap-1.5">
                                <Label htmlFor="edit-name" className="text-xs">Name</Label>
                                <Input
                                    id="edit-name"
                                    name="divisionName"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    required
                                    className="h-8 text-sm"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="edit-description" className="text-xs">Description</Label>
                                <Textarea
                                    id="edit-description"
                                    name="description"
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    className="text-sm min-h-[60px]"
                                    autoComplete="off"
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="edit-color" className="text-xs">Color</Label>
                                <input type="hidden" name="color" value={editColor} />
                                <div className="grid grid-cols-10 gap-1.5">
                                    {PROJECT_COLOR_OPTIONS.map((color) => (
                                        <button
                                            key={color}
                                            type="button"
                                            onClick={() => setEditColor(color)}
                                            className={cn(
                                                "h-6 w-6 rounded-md ring-1 ring-border/60 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                                editColor === color ? "ring-2 ring-foreground/70 scale-[1.02]" : "hover:scale-[1.02]"
                                            )}
                                            style={{ backgroundColor: color }}
                                            aria-label={`Set division color to ${color}`}
                                            title={color}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-xs">Division Leads</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between h-8 text-sm px-2 font-normal">
                                            <span className="truncate">
                                                {editLeadIds.length === 0
                                                    ? "Select leads..."
                                                    : editLeadIds.length <= 2
                                                        ? leadCandidates
                                                            .filter((user) => editLeadIds.includes(user.id))
                                                            .map((user) => user.name)
                                                            .join(', ')
                                                        : `${editLeadIds.length} selected`}
                                            </span>
                                            <ChevronDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[200px] p-0" align="start">
                                        <RemoveScroll shards={[editProjectDialogContentRef]}>
                                            <div className="max-h-[200px] overflow-y-auto overscroll-contain p-1">
                                                {leadCandidates.map((user) => (
                                                    <div
                                                        key={user.id}
                                                        className="flex items-center space-x-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer"
                                                        onClick={() => toggleEditLead(user.id)}
                                                    >
                                                        <Checkbox checked={editLeadIds.includes(user.id)} />
                                                        <div className="text-sm flex-1">{user.name}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </RemoveScroll>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-xs">Members</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between h-8 text-sm px-2 font-normal">
                                            <span className="truncate">
                                                {selectedEditMemberIds.length === 0
                                                    ? "Select members..."
                                                    : `${selectedEditMemberIds.length} selected`}
                                            </span>
                                            <ChevronDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[200px] p-0" align="start">
                                        <RemoveScroll shards={[editProjectDialogContentRef]}>
                                            <div className="max-h-[200px] overflow-y-auto overscroll-contain p-1">
                                                {allUsers.map(user => {
                                                    const isLead = editLeadIds.includes(user.id)
                                                    return (
                                                        <div
                                                            key={user.id}
                                                            className={cn(
                                                                "flex items-center space-x-2 px-2 py-1.5 rounded-sm",
                                                                isLead ? "opacity-50 pointer-events-none" : "hover:bg-accent cursor-pointer"
                                                            )}
                                                            onClick={() => !isLead && toggleMember(user.id)}
                                                        >
                                                            <Checkbox
                                                                checked={selectedEditMemberIds.includes(user.id)}
                                                                disabled={isLead}
                                                            />
                                                            <div className="text-sm flex-1">
                                                                {user.name} {isLead && <span className="text-xs text-muted-foreground ml-1">(Lead)</span>}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </RemoveScroll>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            {editError && (
                                <p className="text-xs text-destructive">{editError}</p>
                            )}
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={isSubmitting} size="sm">
                                {isSubmitting ? 'Saving...' : 'Save'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteConfirm} onOpenChange={(open) => {
                if (!open) {
                    setDeleteConfirm(null)
                    setDeleteConfirmName("")
                }
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogTitle>Delete</DialogTitle>
                    <DialogDescription>
                        Type <strong>{deleteConfirm?.name}</strong> to confirm.
                    </DialogDescription>
                    <div className="py-4">
                        <Input
                            placeholder=""
                            value={deleteConfirmName}
                            onChange={(e) => setDeleteConfirmName(e.target.value)}
                            onPaste={(e) => e.preventDefault()}
                            className="w-full"
                        />
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" size="sm" onClick={() => {
                            setDeleteConfirm(null)
                            setDeleteConfirmName("")
                        }}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleDelete}
                            disabled={isSubmitting || deleteConfirmName.trim() !== deleteConfirm?.name.trim()}
                        >
                            {isSubmitting ? 'Deleting...' : 'Delete'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    )
}
