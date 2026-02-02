import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { DeleteWorkspace } from "./DeleteWorkspace"
import { CopyButton } from "./CopyButton"
import { DiscordChannelSettings } from "./DiscordChannelSettings"
import { DisplayNameSettings } from "./DisplayNameSettings"
import { AppearanceSettings } from "./AppearanceSettings"
import { WorkloadSettings } from "./WorkloadSettings"
import prisma from "@/lib/prisma"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { RoleSelect } from "../members/RoleSelect"
import { ProjectSelect } from "../members/ProjectSelect"
import { MemberActions } from "../members/MemberActions"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
    const user = await getCurrentUser()
    if (!user) {
        redirect('/')
    }

    // Fetch workspace with Discord channel ID
    let workspace = null
    if (user.workspaceId) {
        workspace = await prisma.workspace.findUnique({
            where: { id: user.workspaceId },
            select: {
                id: true,
                name: true,
                inviteCode: true,
                discordChannelId: true
            }
        })
    }

    // Fetch Members Data
    const usersRaw = await prisma.user.findMany({
        where: {
            memberships: {
                some: {
                    workspaceId: user.workspaceId || 'non-existent-id'
                }
            }
        },
        include: {
            memberships: {
                where: {
                    workspaceId: user.workspaceId || 'non-existent-id'
                },
                select: { role: true, name: true }
            },
            projectMemberships: {
                include: {
                    project: { select: { id: true, name: true } }
                }
            }
        },
        orderBy: { name: 'asc' }
    })

    const users = usersRaw.map((member) => {
        const membership = member.memberships[0]
        return {
            ...member,
            name: membership?.name || member.name,
            role: membership?.role || 'Member'
        }
    })

    const allProjects = await prisma.project.findMany({
        where: { workspaceId: user.workspaceId || 'non-existent-id' },
        select: { id: true, name: true, color: true },
        orderBy: { createdAt: 'desc' }
    })

    const isAdmin = user.role === 'Admin' || user.role === 'Team Lead'
    const canChangeRoles = isAdmin

    return (
        <div className="flex flex-col gap-10 p-6 max-w-4xl mx-auto w-full pb-20 animate-fade-in-up">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground mt-2 text-sm">Manage your account, team, and workspace preferences.</p>
            </div>

            <Separator />

            {/* Profile Section */}
            <section className="space-y-6">
                <div className="space-y-4 max-w-xl">
                    <DisplayNameSettings initialName={user.name || ''} />
                    <AppearanceSettings userId={user.id} />
                    <div className="grid gap-2">
                        <Label>Role</Label>
                        <Input defaultValue={user.role} disabled className="bg-muted" />
                    </div>
                </div>
            </section>

            <Separator />

            {/* Members Section */}
            <section className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold mb-1">Team Members</h2>
                        <p className="text-sm text-muted-foreground">Manage roles and project assignments.</p>
                    </div>
                </div>

                <div className="border rounded-md overflow-hidden">
                    {/* Mobile View */}
                    <div className="md:hidden divide-y">
                        {users.map((u) => {
                            const isCurrentUser = u.email === user.email
                            const assignedProjectIds = u.projectMemberships.map(pm => pm.project.id)
                            return (
                                <div key={u.id} className={`p-4 space-y-3 ${isCurrentUser ? 'bg-muted/30' : ''}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm">{u.name}</span>
                                            {isCurrentUser && <Badge variant="outline" className="text-[10px] h-5">You</Badge>}
                                        </div>
                                        <RoleSelect userId={u.id} currentRole={u.role} disabled={!canChangeRoles} />
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span className="truncate max-w-[120px]">{u.email}</span>
                                        <ProjectSelect
                                            userId={u.id}
                                            currentProjectIds={assignedProjectIds}
                                            allProjects={allProjects}
                                            disabled={!canChangeRoles}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Desktop View */}
                    <div className="hidden md:block">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead className="w-[200px]">Member</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead className="text-right">Role</TableHead>
                                    <TableHead className="text-right">Assigned Projects</TableHead>
                                    {canChangeRoles && <TableHead className="w-[50px]"></TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map((u) => {
                                    const isCurrentUser = u.email === user.email
                                    const assignedProjectIds = u.projectMemberships.map(pm => pm.project.id)

                                    return (
                                        <TableRow key={u.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    {u.name}
                                                    {isCurrentUser && <Badge variant="secondary" className="text-[10px] h-5">You</Badge>}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-xs">{u.email}</TableCell>
                                            <TableCell className="text-right">
                                                <RoleSelect userId={u.id} currentRole={u.role} disabled={!canChangeRoles} />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end">
                                                    <ProjectSelect
                                                        userId={u.id}
                                                        currentProjectIds={assignedProjectIds}
                                                        allProjects={allProjects}
                                                        disabled={!canChangeRoles}
                                                    />
                                                </div>
                                            </TableCell>
                                            {canChangeRoles && (
                                                <TableCell>
                                                    <MemberActions
                                                        userId={u.id}
                                                        isCurrentUser={isCurrentUser}
                                                        canRemove={canChangeRoles}
                                                    />
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </section>

            {/* Workload Scoring - Admin Only */}
            {user.role === 'Admin' && (
                <>
                    <Separator />
                    <section>
                        <WorkloadSettings />
                    </section>
                </>
            )}

            <Separator />

            {/* Workspace Settings */}
            {workspace && (
                <section className="space-y-6">
                    <div className="space-y-6 max-w-2xl">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Invite Code</Label>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 px-4 py-2.5 bg-muted/50 border rounded-md font-mono text-base tracking-widest text-center select-all">
                                    {workspace.inviteCode}
                                </code>
                                <CopyButton text={workspace.inviteCode} />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Share this code to allow others to join your workspace.
                            </p>
                        </div>

                        <Separator className="my-4 border-dashed opacity-50" />

                        <div className="space-y-2">
                            <DiscordChannelSettings
                                initialChannelId={workspace.discordChannelId}
                                isAdmin={isAdmin}
                            />
                        </div>
                    </div>

                    {/* Danger Zone */}
                    {isAdmin && (
                        <div className="mt-8 pt-6 border-t border-red-100 dark:border-red-900/30">
                            <DeleteWorkspace workspaceId={user.workspaceId!} workspaceName={workspace.name} />
                        </div>
                    )}
                </section>
            )}
        </div>
    )
}
