"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
    LayoutDashboard, Users, LogOut, Settings, ChevronDown,
    Plus, MoreHorizontal, FolderKanban, Pencil, Trash2, User
} from "lucide-react"
import { DiscordIcon } from "@/components/icons/DiscordIcon"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
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

    // Form state for editing
    const [newProjectLeadId, setNewProjectLeadId] = React.useState("none")
    const [editLeadId, setEditLeadId] = React.useState<string>("none")
    const [selectedMemberIds, setSelectedMemberIds] = React.useState<string[]>([])

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
	                    color: formData.get('color'),
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
                "flex items-center px-4 border-b transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden",
                isChatExpanded ? "max-h-0 opacity-0 border-b-0" : "max-h-14 opacity-100"
            )}>
                <h1 className="text-lg font-semibold">{userData.workspaceName ?? ""}</h1>
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
                                    projects.map(project => {
                                        const isActive = pathname === `/dashboard/projects/${project.id}`
                                        return (
	                                            <div key={project.id} className="group flex items-center gap-1">
	                                                <Link
	                                                    href={`/dashboard/projects/${project.id}`}
	                                                    className={cn(
	                                                        "flex-1 flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted truncate",
	                                                        isActive ? "bg-muted font-medium" : "text-muted-foreground"
	                                                    )}
	                                                >
	                                                    <span
	                                                        className="h-2 w-2 rounded-full shrink-0 ring-1 ring-border/50"
	                                                        style={{ backgroundColor: project.color || "#3b82f6" }}
	                                                    />
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
                                    })
                                )}
                            </CollapsibleContent>
                        </Collapsible>

                        {/* Other Nav Items */}
                        <div className="mt-2 space-y-1">
                            <Link
                                href="/dashboard/settings"
                                className={cn(
                                    "flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted text-sm",
                                    pathname.startsWith("/dashboard/settings") ? "bg-muted font-medium" : "text-muted-foreground"
                                )}
                            >
                                <Settings className="h-5 w-5" />
                                Settings
                            </Link>
                        </div>
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
                            <DialogDescription>Create a new project</DialogDescription>
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
                            <DialogTitle>Edit Project</DialogTitle>
                            <DialogDescription>Update project details</DialogDescription>
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
	                                <Input
	                                    id="edit-color"
	                                    name="color"
	                                    type="color"
	                                    defaultValue={editingProject?.color || "#3b82f6"}
	                                    className="h-8 w-16 p-1"
	                                />
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
