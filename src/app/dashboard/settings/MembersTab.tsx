"use client"

import { useState, useTransition } from "react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BarChart3, Check, ChevronDown, ChevronRight, Loader2, Pencil, X } from "lucide-react"
import { RoleSelect } from "../members/RoleSelect"
import { ProjectSelect } from "../members/ProjectSelect"
import { MemberActions } from "../members/MemberActions"
import { updateMemberName } from "@/app/actions/user-settings"
import { useRouter } from "next/navigation"
import { WorkloadSettings } from "./WorkloadSettings"

type Project = {
    id: string
    name: string
    color?: string | null
}

type Member = {
    id: string
    name: string
    email: string
    role: string
    projectMemberships: { project: { id: string; name: string } }[]
}

type MembersTabProps = {
    members: Member[]
    allProjects: Project[]
    currentUserEmail: string
    canManage: boolean
    showWorkload: boolean
}

function EditableName({
    userId,
    name,
    canEdit,
}: {
    userId: string
    name: string
    canEdit: boolean
}) {
    const router = useRouter()
    const [editing, setEditing] = useState(false)
    const [value, setValue] = useState(name)
    const [isPending, startTransition] = useTransition()

    const handleSave = () => {
        const trimmed = value.trim()
        if (!trimmed) {
            setValue(name)
            setEditing(false)
            return
        }
        startTransition(async () => {
            const res = await updateMemberName(userId, trimmed)
            if (res.error) {
                setValue(name)
            }
            setEditing(false)
            router.refresh()
        })
    }

    if (editing) {
        return (
            <div className="flex items-center gap-1">
                <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="h-7 text-sm w-[140px]"
                    autoFocus
                    onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave()
                        if (e.key === "Escape") {
                            setValue(name)
                            setEditing(false)
                        }
                    }}
                />
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-green-600"
                    onClick={handleSave}
                    disabled={isPending}
                >
                    {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </Button>
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => {
                        setValue(name)
                        setEditing(false)
                    }}
                >
                    <X className="h-3 w-3" />
                </Button>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-1.5 group">
            <span className="text-sm font-medium">{name}</span>
            {canEdit && (
                <button
                    onClick={() => setEditing(true)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted transition-all"
                >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                </button>
            )}
        </div>
    )
}

export function MembersTab({ members, allProjects, currentUserEmail, canManage, showWorkload }: MembersTabProps) {
    const [workloadOpen, setWorkloadOpen] = useState(false)

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold">Members</h2>
                <p className="text-xs text-muted-foreground mt-1">Manage roles, names, and project assignments.</p>
            </div>

            <div className="border rounded-lg overflow-hidden">
                {/* Mobile view */}
                <div className="md:hidden divide-y">
                    {members.map((m) => {
                        const isSelf = m.email === currentUserEmail
                        const assignedIds = m.projectMemberships.map((pm) => pm.project.id)
                        return (
                            <div key={m.id} className={`p-3 space-y-2 ${isSelf ? "bg-muted/30" : ""}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <EditableName userId={m.id} name={m.name} canEdit={canManage && !isSelf} />
                                        {isSelf && <Badge variant="outline" className="text-[10px] h-5">You</Badge>}
                                    </div>
                                    <RoleSelect userId={m.id} currentRole={m.role} disabled={!canManage} />
                                </div>
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span className="truncate max-w-[140px]">{m.email}</span>
                                    <ProjectSelect
                                        userId={m.id}
                                        currentProjectIds={assignedIds}
                                        allProjects={allProjects}
                                        disabled={!canManage}
                                    />
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Desktop view */}
                <div className="hidden md:block">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                                <th className="text-left font-medium px-4 py-2.5 w-[200px]">Member</th>
                                <th className="text-left font-medium px-4 py-2.5">Email</th>
                                <th className="text-right font-medium px-4 py-2.5">Role</th>
                                <th className="text-right font-medium px-4 py-2.5">Projects</th>
                                {canManage && <th className="w-[50px]"></th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {members.map((m) => {
                                const isSelf = m.email === currentUserEmail
                                const assignedIds = m.projectMemberships.map((pm) => pm.project.id)
                                return (
                                    <tr key={m.id} className={isSelf ? "bg-muted/20" : ""}>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-2">
                                                <EditableName userId={m.id} name={m.name} canEdit={canManage && !isSelf} />
                                                {isSelf && <Badge variant="secondary" className="text-[10px] h-5">You</Badge>}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{m.email}</td>
                                        <td className="px-4 py-2.5 text-right">
                                            <RoleSelect userId={m.id} currentRole={m.role} disabled={!canManage} />
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            <div className="flex justify-end">
                                                <ProjectSelect
                                                    userId={m.id}
                                                    currentProjectIds={assignedIds}
                                                    allProjects={allProjects}
                                                    disabled={!canManage}
                                                />
                                            </div>
                                        </td>
                                        {canManage && (
                                            <td className="px-4 py-2.5">
                                                <MemberActions
                                                    userId={m.id}
                                                    isCurrentUser={isSelf}
                                                    canRemove={canManage}
                                                />
                                            </td>
                                        )}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {showWorkload && (
                <div className="space-y-3">
                    <div>
                        <h3 className="text-sm font-semibold">Workload Scoring</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                            Configure how team member status is computed on the heatmap.
                        </p>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                        <button
                            onClick={() => setWorkloadOpen(!workloadOpen)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                        >
                            <BarChart3 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">Advanced Scoring Configuration</p>
                                <p className="text-xs text-muted-foreground">Thresholds, weights, capacity, and baseline settings</p>
                            </div>
                            {workloadOpen ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                        </button>
                        {workloadOpen && (
                            <div className="border-t px-4 py-4">
                                <WorkloadSettings />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
