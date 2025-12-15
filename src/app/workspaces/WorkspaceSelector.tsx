"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Plus, Users, Building2, Loader2, ArrowRight, FolderKanban, CheckCircle, Info, LogOut, Settings, User as UserIcon, X } from "lucide-react"
import { createWorkspace, joinWorkspace, switchWorkspace } from "@/app/actions/setup"
import { updateDisplayName, deleteAccount, updateUserDeepDetails } from "@/app/actions/user-settings"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Textarea } from "@/components/ui/textarea"

export function WorkspaceSelector({ user }: { user: any }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [createError, setCreateError] = useState<string | null>(null)
    const [joinError, setJoinError] = useState<string | null>(null)
    const [createOpen, setCreateOpen] = useState(false)
    const [joinOpen, setJoinOpen] = useState(false)

    // Profile Edit State
    const [profileOpen, setProfileOpen] = useState(false)
    const [displayName, setDisplayName] = useState(user.name || '')
    const [editName, setEditName] = useState(user.name || '')
    const [editSkills, setEditSkills] = useState<string[]>(user.skills || [])
    const [editInterests, setEditInterests] = useState(user.interests || '')
    const [currentSkill, setCurrentSkill] = useState("")
    const [profileError, setProfileError] = useState<string | null>(null)

    // Delete Account State
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [deleteConfirmation, setDeleteConfirmation] = useState("")

    // Custom notification state
    const [notification, setNotification] = useState<{
        title: string
        message: string
        type: 'success' | 'info'
        onDismiss?: () => void
    } | null>(null)


    const handleNotificationDismiss = () => {
        const callback = notification?.onDismiss
        setNotification(null)
        if (callback) callback()
    }

    const handleSwitch = async (workspaceId: string) => {
        startTransition(async () => {
            const res = await switchWorkspace(workspaceId)
            if (res.success) {
                window.location.href = '/dashboard'
            }
        })
    }

    const handleCreate = async (formData: FormData) => {
        setCreateError(null)
        startTransition(async () => {
            const res = await createWorkspace(formData)
            if (res.error) {
                setCreateError(res.error)
            } else if (res.success) {
                setCreateOpen(false)
                setNotification({
                    title: "Workspace Created",
                    message: "Your new workspace is ready! Click below to continue.",
                    type: "success",
                    onDismiss: () => {
                        window.location.href = '/dashboard'
                    }
                })
            }
        })
    }

    const handleJoin = async (formData: FormData) => {
        setJoinError(null)
        startTransition(async () => {
            const res = await joinWorkspace(formData)
            if (res.error) {
                setJoinError(res.error)
            } else if (res.success) {
                setJoinOpen(false)
                const isAlreadyMember = !!res.message
                setNotification({
                    title: isAlreadyMember ? "Already a Member" : "Joined Successfully",
                    message: res.message || "You're now part of the workspace! Click below to continue.",
                    type: isAlreadyMember ? "info" : "success",
                    onDismiss: () => {
                        window.location.href = '/dashboard'
                    }
                })
            }
        })
    }

    const handleSaveProfile = async () => {
        if (!editName.trim()) {
            setProfileError("Name cannot be empty")
            return
        }
        if (!editName.trim().includes(' ')) {
            setProfileError("Please enter your full name (First and Last name)")
            return
        }

        setProfileError(null)
        startTransition(async () => {
            // Update Name
            const nameRes = await updateDisplayName(editName.trim())
            if (nameRes.error) {
                setProfileError(nameRes.error)
                return
            }

            // Update Details
            const detailsRes = await updateUserDeepDetails(editSkills, editInterests)
            if (detailsRes.error) {
                setProfileError(detailsRes.error)
                return
            }

            setDisplayName(editName.trim())
            router.refresh()
            setProfileOpen(false)
            setNotification({
                title: "Profile Updated",
                message: "Your profile details have been saved.",
                type: "success"
            })
        })
    }

    const handleAddSkill = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            const trimmed = currentSkill.trim()
            if (trimmed && !editSkills.includes(trimmed)) {
                setEditSkills([...editSkills, trimmed])
                setCurrentSkill("")
            }
        }
    }

    const removeSkill = (skillToRemove: string) => {
        setEditSkills(editSkills.filter(s => s !== skillToRemove))
    }

    return (
        <div className="w-full max-w-5xl space-y-6 md:space-y-8 animate-in fade-in zoom-in-95 duration-500 px-4 md:px-0">
            {/* Header */}
            <div className="flex flex-col gap-4 md:gap-6 pb-4 md:pb-6 border-b border-zinc-200">
                <div className="flex items-center gap-3 md:gap-4">
                    <Avatar className="h-12 w-12 md:h-16 md:w-16 border-2 border-white shadow-lg">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>{displayName?.[0]}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-0.5 md:space-y-1 flex-1">
                        <h2 className="text-xl md:text-3xl font-bold tracking-tight text-zinc-900">Your Workspaces</h2>
                        <div className="flex items-center gap-2">
                            <p className="text-sm md:text-base text-zinc-500 font-medium">Welcome back, {displayName}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-zinc-500 hover:text-zinc-900">
                                    <Settings className="w-5 h-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                                    <UserIcon className="w-4 h-4 mr-2" /> Edit Profile
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                    fetch('/api/auth/logout', { method: 'POST' })
                                        .then(() => window.location.href = '/')
                                }}>
                                    <LogOut className="w-4 h-4 mr-2" /> Log Out
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600"
                                    onClick={() => {
                                        setDeleteConfirmation("")
                                        setDeleteConfirmOpen(true)
                                    }}
                                >
                                    Delete Account
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 md:gap-3">
                    <Button onClick={() => setCreateOpen(true)} variant="outline" className="gap-2 shadow-sm flex-1 md:flex-none text-sm">
                        <Plus className="w-4 h-4" /> Create
                    </Button>
                    <Button onClick={() => setJoinOpen(true)} variant="outline" className="gap-2 shadow-sm flex-1 md:flex-none text-sm">
                        <Users className="w-4 h-4" /> Join
                    </Button>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {user.memberships?.map((m: any) => (
                    <Card
                        key={m.workspaceId}
                        className={`group cursor-pointer transition-all hover:shadow-xl border-2 border-transparent hover:border-zinc-200 bg-white relative overflow-hidden`}
                        onClick={() => handleSwitch(m.workspaceId)}
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-transparent to-zinc-50/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <CardContent className="p-6 relative">
                            <div className="flex items-start justify-between mb-4">
                                <div className={`p-3 rounded-xl bg-zinc-100 text-zinc-600 transition-transform group-hover:scale-110`}>
                                    {m.role === 'Admin' ? <Building2 className="w-6 h-6" /> : <Users className="w-6 h-6" />}
                                </div>
                                <ArrowRight className="w-5 h-5 text-zinc-300 group-hover:text-zinc-900 -translate-x-2 group-hover:translate-x-0 opacity-0 group-hover:opacity-100 transition-all" />
                            </div>

                            <CardTitle className="text-xl font-bold text-zinc-900 mb-1">{m.workspace.name}</CardTitle>
                            <p className="text-sm text-zinc-500 mb-6 font-medium">{m.role}</p>

                            <div className="flex items-center gap-4 text-xs font-medium text-zinc-400 border-t pt-4">
                                <span className="flex items-center gap-1.5 hover:text-zinc-600 transition-colors">
                                    <Users className="w-3.5 h-3.5" />
                                    {m.workspace._count?.members || 1} Members
                                </span>
                                <span className="flex items-center gap-1.5 hover:text-zinc-600 transition-colors">
                                    <FolderKanban className="w-3.5 h-3.5" />
                                    {m.workspace._count?.projects || 0} Projects
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {(!user.memberships || user.memberships.length === 0) && (
                    <div className="col-span-full py-12 text-center text-zinc-400 border-2 border-dashed border-zinc-200 rounded-xl">
                        <p>No workspaces found. Create or join one to get started.</p>
                    </div>
                )}
            </div>

            {/* Create Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Workspace</DialogTitle>
                        <DialogDescription>Start a new team workspace. You will be the Admin.</DialogDescription>
                    </DialogHeader>
                    <form action={handleCreate} className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Workspace Name</Label>
                            <Input id="name" name="name" placeholder="Acme Corp" required />
                        </div>
                        {createError && <p className="text-sm text-red-500">{createError}</p>}
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={isPending}>
                                {isPending ? 'Creating...' : 'Create'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Join Dialog */}
            <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Join Workspace</DialogTitle>
                        <DialogDescription>Enter the invite code shared with you.</DialogDescription>
                    </DialogHeader>
                    <form action={handleJoin} className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="code">Invite Code</Label>
                            <Input id="code" name="code" placeholder="XYZ123" required />
                        </div>
                        {joinError && <p className="text-sm text-red-500">{joinError}</p>}
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" onClick={() => setJoinOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={isPending}>
                                {isPending ? 'Joining...' : 'Join'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Profile Edit Dialog */}
            <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Edit Profile</DialogTitle>
                        <DialogDescription>Make changes to your profile here. Click save when you're done.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-name">Display Name</Label>
                            <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Skills</Label>
                            <div className="bg-zinc-50 border rounded-md p-2 flex flex-wrap gap-2 min-h-[40px]">
                                {editSkills.map(skill => (
                                    <span key={skill} className="bg-white border text-zinc-800 text-xs px-2 py-1 rounded flex items-center gap-1">
                                        {skill}
                                        <button onClick={() => removeSkill(skill)} className="hover:text-red-500">×</button>
                                    </span>
                                ))}
                                <input
                                    className="bg-transparent border-none outline-none text-sm flex-1 min-w-[80px]"
                                    placeholder="Add skill..."
                                    value={currentSkill}
                                    onChange={(e) => setCurrentSkill(e.target.value)}
                                    onKeyDown={handleAddSkill}
                                />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-interests">Bio / Interests</Label>
                            <Textarea
                                id="edit-interests"
                                value={editInterests}
                                onChange={(e) => setEditInterests(e.target.value)}
                                className="h-24 resize-none"
                            />
                        </div>
                        {profileError && <p className="text-sm text-red-500">{profileError}</p>}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setProfileOpen(false)}>Cancel</Button>
                        <Button type="button" onClick={handleSaveProfile} disabled={isPending}>
                            {isPending ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Confirm Delete Dialog */}
            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-red-600">Delete Account</DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. This will permanently delete your account and remove your data from our servers.
                            Your messages and activity logs will be anonymized.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <Label>Type <span className="font-bold text-red-600">DELETE</span> to confirm</Label>
                        <Input
                            value={deleteConfirmation}
                            onChange={(e) => setDeleteConfirmation(e.target.value)}
                            placeholder="DELETE"
                            className="border-red-200 focus:border-red-500"
                        />
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
                            <Button
                                variant="destructive"
                                disabled={deleteConfirmation !== 'DELETE' || isPending}
                                onClick={() => {
                                    startTransition(async () => {
                                        const res = await deleteAccount()
                                        if (res && res.success) {
                                            window.location.href = '/'
                                        }
                                    })
                                }}
                            >
                                {isPending ? 'Deleting...' : 'Delete Account'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Custom Notification Dialog */}
            <Dialog open={!!notification} onOpenChange={(open) => { if (!open) handleNotificationDismiss() }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <div className="flex items-center gap-3">
                            {notification?.type === 'success' ? (
                                <div className="p-2 rounded-full bg-green-100">
                                    <CheckCircle className="w-6 h-6 text-green-600" />
                                </div>
                            ) : (
                                <div className="p-2 rounded-full bg-blue-100">
                                    <Info className="w-6 h-6 text-blue-600" />
                                </div>
                            )}
                            <DialogTitle>{notification?.title}</DialogTitle>
                        </div>
                        <DialogDescription className="pt-2">
                            {notification?.message}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button onClick={handleNotificationDismiss} className="w-full">
                            Continue
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {isPending && (
                <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none">
                    <Loader2 className="w-10 h-10 animate-spin text-zinc-900" />
                </div>
            )}
        </div>
    )
}
