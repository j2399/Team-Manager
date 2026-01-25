"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
    LayoutDashboard, Users, LogOut, Settings, ChevronDown,
    Plus, MoreHorizontal, FolderKanban, Pencil, Trash2, User, GripVertical,
    Kanban, Loader2, Smile
} from "lucide-react"
import { DiscordIcon } from "@/components/icons/DiscordIcon"
import { SpinningDots } from "@/components/ui/spinning-dots"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { GeneralChat } from "@/components/layout/GeneralChat"
import { CreateProjectWizard } from "@/features/projects/CreateProjectWizard"

type Project = {
    id: string
    name: string
    description: string | null
    color?: string | null
    leadId: string | null
    lead: { id: string; name: string } | null
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

const SortableProjectRow = React.memo(({
    project,
    pathname,
    navigatingTo,
    isAdmin,
    setNavigatingTo,
    setEditingProject,
    setDeleteConfirm
}: {
    project: Project
    pathname: string
    navigatingTo: string | null
    isAdmin: boolean
    setNavigatingTo: (path: string) => void
    setEditingProject: (project: Project) => void
    setDeleteConfirm: (project: Project) => void
}) => {
    const isActive = pathname === `/dashboard/projects/${project.id}`
    const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: project.id })
    const projectColor = project.color || "#3b82f6"
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        ["--project-active-bg" as any]: hexToRgba(projectColor, 0.22),
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "group relative flex items-center rounded-md transition-all duration-300",
                !isActive && "hover:bg-muted/50"
            )}
        >
            {/* Active gradient indicator - animates from right */}
            <div
                className={cn(
                    "absolute inset-0 rounded-md pointer-events-none",
                    isActive ? "animate-sidebar-gradient" : "scale-x-0 origin-right"
                )}
                style={{
                    background: `linear-gradient(to left, var(--project-active-bg), transparent 60%)`,
                }}
            />
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
            <Link
                href={`/dashboard/projects/${project.id}`}
                onClick={() => !isActive && setNavigatingTo(`/dashboard/projects/${project.id}`)}
                className={cn(
                    "relative z-10 rounded-md pl-2 py-1.5 text-sm transition-colors flex-1 min-w-0",
                    isActive ? "font-medium" : "text-muted-foreground group-hover:text-foreground"
                )}
                title={project.name}
            >
                <span className="block truncate">{project.name}</span>
            </Link>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="relative z-20 h-6 w-6 shrink-0 ml-auto text-muted-foreground/50 hover:text-muted-foreground"
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
                <DropdownMenuContent align="start" side="right" className="w-32 z-50">
                    <DropdownMenuItem onSelect={() => setEditingProject(project)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                    </DropdownMenuItem>
                    {isAdmin && (
                        <DropdownMenuItem
                            onSelect={() => setDeleteConfirm(project)}
                            className="text-red-600"
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
})
SortableProjectRow.displayName = "SortableProjectRow"

export function Sidebar({ initialUserData, isMobileSheet = false }: { initialUserData?: Partial<UserData>; isMobileSheet?: boolean } = {}) {
    const pathname = usePathname()
    const router = useRouter()
    const [userData, setUserData] = React.useState<UserData>(() => ({
        name: initialUserData?.name ?? "User",
        role: initialUserData?.role ?? "Member",
        id: initialUserData?.id ?? null,
        workspaceName: initialUserData?.workspaceName,
        avatar: initialUserData?.avatar ?? null,
    }))
    const [projects, setProjects] = React.useState<Project[]>([])
    const [leadCandidates, setLeadCandidates] = React.useState<UserCandidate[]>([])
    const [allUsers, setAllUsers] = React.useState<UserCandidate[]>([])
    const [projectsOpen, setProjectsOpen] = React.useState(true)
    const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
    const [editingProject, setEditingProject] = React.useState<Project | null>(null)
    const [deleteConfirm, setDeleteConfirm] = React.useState<Project | null>(null)
    const [deleteConfirmName, setDeleteConfirmName] = React.useState<string>("")
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const [navigatingTo, setNavigatingTo] = React.useState<string | null>(null)
    const [chatState, setChatState] = React.useState<'small' | 'large' | 'hidden'>('small')
    const createProjectDialogContentRef = React.useRef<HTMLDivElement | null>(null)
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

    // Form state for editing
    const [newProjectLeadId, setNewProjectLeadId] = React.useState("none")
    const [editLeadId, setEditLeadId] = React.useState<string>("none")
    const [selectedMemberIds, setSelectedMemberIds] = React.useState<string[]>([])
    const [editColor, setEditColor] = React.useState<string>("#3b82f6")

    const isAdmin = userData.role === 'Admin' || userData.role === 'Team Lead'

    // Fetch user data
    const fetchUserData = React.useCallback(() => {
        fetch('/api/auth/role')
            .then(res => res.json())
            .then(data => {
                setUserData({
                    name: data.name || 'User',
                    role: data.role || 'Member',
                    id: data.id,
                    workspaceName: data.workspaceName,
                    avatar: data.avatar
                })
            })
            .catch(() => { })
    }, [])

    React.useEffect(() => {
        fetchUserData()
        // Poll for role changes (60 seconds - roles rarely change)
        const interval = setInterval(fetchUserData, 60000)
        return () => clearInterval(interval)
    }, [fetchUserData])

    // Fetch projects with lead info
    const fetchProjects = React.useCallback(() => {
        fetch('/api/projects?includeLead=true')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setProjects(data)
            })
            .catch(() => { })
    }, [])

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
    )

    const persistProjectOrder = React.useCallback(async (projectIds: string[]) => {
        try {
            await fetch('/api/projects/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectIds })
            })
        } catch {
            // best-effort; sidebar will refresh order on next fetch
        }
    }, [])

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

    // Fetch lead candidates & all users
    const fetchUsers = React.useCallback(() => {
        // Fetch potential leads
        fetch('/api/users?role=leads')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setLeadCandidates(data)
            })
            .catch(() => { })

        // Fetch all users for membership
        fetch('/api/users')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setAllUsers(data)
            })
            .catch(() => { })
    }, [])

    React.useEffect(() => {
        fetchProjects()
        fetchUsers()
    }, [fetchProjects, fetchUsers])

    // When editing project changes, update the lead id state
    React.useEffect(() => {
        if (editingProject) {
            setEditLeadId(editingProject.leadId || "none")
            setSelectedMemberIds(editingProject.members?.map(m => m.userId) || [])
            setEditColor(editingProject.color || "#3b82f6")
        } else {
            setSelectedMemberIds([])
        }
    }, [editingProject])

    // When Create Dialog opens, reset members
    React.useEffect(() => {
        if (createDialogOpen) {
            setSelectedMemberIds([])
            setNewProjectLeadId("none")
        }
    }, [createDialogOpen])

    const toggleMember = (userId: string) => {
        setSelectedMemberIds(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        )
    }

    // Create project
    const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setIsSubmitting(true)
        const formData = new FormData(e.currentTarget)

        const leadId = newProjectLeadId
        if (!leadId || leadId === 'none') {
            alert('Project Lead is required')
            setIsSubmitting(false)
            return
        }

        const payload = {
            name: formData.get('name'),
            description: formData.get('description'),
            leadId: leadId,
            memberIds: selectedMemberIds
        }

        try {
            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            if (res.ok) {
                fetchProjects()
                setCreateDialogOpen(false)
                router.refresh()
            } else {
                const text = await res.text()
                console.error("Project creation failed. Status:", res.status, res.statusText)
                console.error("Raw response body:", text)

                let errorData = {}
                try {
                    errorData = JSON.parse(text)
                } catch (e) {
                    errorData = { error: `Response not JSON: ${text.substring(0, 50)}...` }
                }

                alert(`Error (${res.status}): ${(errorData as any).error || text || 'Unknown error'}`)
            }
        } catch (err) {
            console.error(err)
            alert('Failed to create project')
        }
        setIsSubmitting(false)
    }

    // Update project
    const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!editingProject) return
        setIsSubmitting(true)
        const formData = new FormData(e.currentTarget)

        try {
            const res = await fetch(`/api/projects/${editingProject.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.get('name'),
                    description: formData.get('description'),
                    color: editColor,
                    leadId: editLeadId === 'none' ? null : editLeadId,
                    memberIds: selectedMemberIds
                })
            })
            if (res.ok) {
                fetchProjects()
                setEditingProject(null)
                router.refresh()
            }
        } catch (err) {
            console.error(err)
        }
        setIsSubmitting(false)
    }

    // Delete project
    const handleDelete = async () => {
        if (!deleteConfirm) return
        if (deleteConfirmName.trim() !== deleteConfirm.name.trim()) {
            return // Name doesn't match, don't delete
        }
        setIsSubmitting(true)

        try {
            const res = await fetch(`/api/projects/${deleteConfirm.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmName: deleteConfirmName.trim() })
            })
            if (res.ok) {
                fetchProjects()
                setDeleteConfirm(null)
                setDeleteConfirmName("")
                router.push('/dashboard')
                router.refresh()
            } else {
                const data = await res.json().catch(() => ({}))
                alert(data.error || 'Failed to delete project')
            }
        } catch (err) {
            console.error(err)
        }
        setIsSubmitting(false)
    }

    return (
        <div className="flex h-full flex-col bg-background w-64 border-r overflow-hidden">
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
                <ScrollArea className="h-full">
                    <nav className="p-3">
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

                        {/* Projects Section */}
                        <Collapsible open={projectsOpen} onOpenChange={setProjectsOpen} className="mt-2">
                            <div className="flex items-center">
                                <CollapsibleTrigger className="flex-1 flex items-center gap-3 rounded-md px-3 py-2 text-muted-foreground transition-all hover:translate-x-0.5 text-sm">
                                    <ChevronDown className={cn("h-5 w-5 transition-transform", !projectsOpen && "-rotate-90")} />
                                    <FolderKanban className="h-5 w-5" />
                                    <span>Projects</span>
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
                            <CollapsibleContent className="pl-6 pr-1 mt-1 space-y-1 overflow-hidden">
                                {projects.length === 0 ? (
                                    <p className="text-sm text-muted-foreground px-3 py-1">No projects yet</p>
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
                                                        setEditingProject={setEditingProject}
                                                        setDeleteConfirm={setDeleteConfirm}
                                                    />
                                                ))}
                                            </SortableContext>
                                        </TooltipProvider>
                                    </DndContext>
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
                </ScrollArea>
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

            {/* Create Project Wizard */}
            <CreateProjectWizard
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                leadCandidates={leadCandidates}
                allUsers={allUsers}
                onProjectCreated={fetchProjects}
            />

            {/* Edit Project Dialog */}
            <Dialog open={!!editingProject} onOpenChange={(open) => !open && setEditingProject(null)}>
                <DialogContent ref={editProjectDialogContentRef} className="sm:max-w-md">
                    <form onSubmit={handleUpdate}>
                        <DialogHeader>
                            <DialogTitle className="sr-only">Edit Project</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-3 py-4">
                            <div className="grid gap-1.5">
                                <Label htmlFor="edit-name" className="text-xs">Name</Label>
                                <Input
                                    id="edit-name"
                                    name="name"
                                    defaultValue={editingProject?.name}
                                    required
                                    className="h-8 text-sm"
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="edit-description" className="text-xs">Description</Label>
                                <Textarea
                                    id="edit-description"
                                    name="description"
                                    defaultValue={editingProject?.description || ''}
                                    className="text-sm min-h-[60px]"
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
                                            aria-label={`Set project color to ${color}`}
                                            title={color}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-xs">Project Lead</Label>
                                <Select value={editLeadId} onValueChange={setEditLeadId}>
                                    <SelectTrigger className="h-8 text-sm">
                                        <SelectValue placeholder="Select lead" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No Lead</SelectItem>
                                        {leadCandidates.map(user => (
                                            <SelectItem key={user.id} value={user.id}>
                                                {user.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-xs">Members</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between h-8 text-sm px-2 font-normal">
                                            <span className="truncate">
                                                {selectedMemberIds.length === 0
                                                    ? "Select members..."
                                                    : `${selectedMemberIds.length} selected`}
                                            </span>
                                            <ChevronDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[200px] p-0" align="start">
                                        <RemoveScroll shards={[editProjectDialogContentRef]}>
                                            <div className="max-h-[200px] overflow-y-auto overscroll-contain p-1">
                                                {allUsers.map(user => {
                                                    const isLead = user.id === editLeadId
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
                                                                checked={isLead || selectedMemberIds.includes(user.id)}
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
                    <DialogTitle>Delete Project</DialogTitle>
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
