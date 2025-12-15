"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
    LayoutDashboard, Users, LogOut, Settings, ChevronDown,
    Plus, MoreHorizontal, FolderKanban, Pencil, Trash2, User, GripVertical
} from "lucide-react"
import { DiscordIcon } from "@/components/icons/DiscordIcon"
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

export function Sidebar({ initialUserData }: { initialUserData?: Partial<UserData> } = {}) {
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
    const [isChatExpanded, setIsChatExpanded] = React.useState(false)
    const createProjectDialogContentRef = React.useRef<HTMLDivElement | null>(null)
    const editProjectDialogContentRef = React.useRef<HTMLDivElement | null>(null)
    const [settingsSpinNonce, setSettingsSpinNonce] = React.useState(0)

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
        // Poll for role changes
        const interval = setInterval(fetchUserData, 2000)
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

    function SortableProjectRow({ project }: { project: Project }) {
        const isActive = pathname === `/dashboard/projects/${project.id}`
        const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: project.id })
        const projectColor = project.color || "#3b82f6"
        const style: React.CSSProperties = {
            transform: CSS.Transform.toString(transform),
            transition,
            opacity: isDragging ? 0.6 : 1,
            ["--project-hover-bg" as any]: hexToRgba(projectColor, 0.08),
            ["--project-active-bg" as any]: hexToRgba(projectColor, 0.14),
        }

        return (
            <div
                ref={setNodeRef}
                style={style}
                className={cn(
                    "group flex items-center gap-1 rounded-md transition-colors",
                    isActive ? "bg-[var(--project-active-bg)]" : "hover:bg-[var(--project-hover-bg)]"
                )}
            >
                <button
                    type="button"
                    className="h-6 w-6 shrink-0 flex items-center justify-center rounded-md cursor-grab active:cursor-grabbing opacity-60 group-hover:opacity-100"
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
                    className={cn(
                        "flex-1 flex items-center rounded-md px-3 py-1.5 text-sm transition-colors truncate",
                        isActive ? "font-medium" : "text-muted-foreground group-hover:text-foreground"
                    )}
                >
                    <span className="truncate">{project.name}</span>
                </Link>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
                        >
                            <MoreHorizontal className="h-4 w-4" />
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
    }

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
        if (deleteConfirmName !== deleteConfirm.name) {
            return // Name doesn't match, don't delete
        }
        setIsSubmitting(true)

        try {
            const res = await fetch(`/api/projects/${deleteConfirm.id}`, {
                method: 'DELETE'
            })
            if (res.ok) {
                fetchProjects()
                setDeleteConfirm(null)
                setDeleteConfirmName("")
                router.push('/dashboard')
                router.refresh()
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
                isChatExpanded ? "max-h-0 opacity-0 border-b-0" : "max-h-10 opacity-100"
            )}>
                <h1 className="text-sm font-semibold truncate pl-4 pr-12 w-full min-w-0">
                    {userData.workspaceName ?? ""}
                </h1>
                <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-10 w-10 rounded-none"
                >
                    <Link
                        href="/dashboard/settings"
                        aria-label="Workspace settings"
                        title="Settings"
                        onClick={() => {
                            setSettingsSpinNonce((n) => n + 1)
                        }}
                    >
                        <Settings
                            key={settingsSpinNonce}
                            className={cn(
                                "h-4 w-4 text-muted-foreground",
                                settingsSpinNonce > 0 && "motion-safe:animate-[cupi-gear-impulse_1200ms_ease-out_both]"
                            )}
                        />
                    </Link>
                </Button>
            </div>

            <div className={cn(
                "transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden",
                isChatExpanded ? "flex-[0.001] opacity-0" : "flex-1 opacity-100"
            )}>
                <ScrollArea className="h-full">
                    <nav className="p-3">
                        {/* Dashboard Link */}
                        <Link
                            href="/dashboard"
                            className={cn(
                                "flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted text-sm",
                                pathname === "/dashboard" ? "bg-muted font-medium" : "text-muted-foreground"
                            )}
                        >
                            <LayoutDashboard className="h-5 w-5" />
                            Dashboard
                        </Link>

                        {/* Projects Section */}
                        <Collapsible open={projectsOpen} onOpenChange={setProjectsOpen} className="mt-2">
                            <div className="flex items-center">
                                <CollapsibleTrigger className="flex-1 flex items-center gap-3 rounded-md px-3 py-2 text-muted-foreground hover:bg-muted transition-colors text-sm">
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
	                            <CollapsibleContent className="pl-6 mt-1 space-y-1">
	                                {projects.length === 0 ? (
	                                    <p className="text-sm text-muted-foreground px-3 py-1">No projects yet</p>
	                                ) : (
	                                    <DndContext
	                                        sensors={sensors}
	                                        collisionDetection={closestCenter}
	                                        onDragEnd={handleProjectDragEnd}
	                                    >
	                                        <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
	                                            {projects.map((project) => (
	                                                <SortableProjectRow key={project.id} project={project} />
	                                            ))}
	                                        </SortableContext>
	                                    </DndContext>
	                                )}
	                            </CollapsibleContent>
	                        </Collapsible>

                        {/* Other Nav Items */}
                    </nav>
                </ScrollArea>
            </div>

            <div className={cn(
                "shrink-0 flex flex-col min-h-0 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
                isChatExpanded ? "grow basis-0" : "grow-0 basis-[320px] border-t"
            )}>
                <GeneralChat
                    isExpanded={isChatExpanded}
                    onToggleExpand={() => setIsChatExpanded(!isChatExpanded)}
                />
            </div>

            <div className={cn(
                "border-t transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden",
                isChatExpanded ? "max-h-0 opacity-0 border-t-0 p-0" : "max-h-40 opacity-100 p-4"
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
                    onClick={() => window.location.href = '/workspaces'}
                >
                    <FolderKanban className="h-4 w-4" />
                    Back to Workspaces
                </Button>
            </div>

            {/* Create Project Dialog */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogContent ref={createProjectDialogContentRef} className="sm:max-w-md">
                    <form onSubmit={handleCreate}>
                        <DialogHeader>
                            <DialogTitle>New Project</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-3 py-4">
                            <div className="grid gap-1.5">
                                <Label htmlFor="name" className="text-xs">Name</Label>
                                <Input id="name" name="name" required className="h-8 text-sm" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="description" className="text-xs">Description</Label>
                                <Textarea id="description" name="description" className="text-sm min-h-[60px]" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-xs flex items-center gap-1">
                                    Project Lead <span className="text-red-500">*</span>
                                </Label>
                                <Select
                                    value={newProjectLeadId}
                                    onValueChange={setNewProjectLeadId}
                                    required
                                >
                                    <SelectTrigger className="h-8 text-sm">
                                        <SelectValue placeholder="Select lead" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Select a User...</SelectItem>
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
                                        <RemoveScroll shards={[createProjectDialogContentRef]}>
                                            <div className="max-h-[200px] overflow-y-auto overscroll-contain p-1">
                                            {allUsers.map(user => {
                                                const isLead = user.id === newProjectLeadId
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
                                {isSubmitting ? 'Creating...' : 'Create'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

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
                    <DialogHeader>
                        <DialogTitle>Delete Project</DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. To confirm, please type the project name: <strong>{deleteConfirm?.name}</strong>
                        </DialogDescription>
                    </DialogHeader>
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
                            disabled={isSubmitting || deleteConfirmName !== deleteConfirm?.name}
                        >
                            {isSubmitting ? 'Deleting...' : 'Delete'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    )
}
