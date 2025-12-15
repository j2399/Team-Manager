"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateProjectLead } from "@/app/actions/projects"
import { useState, useTransition } from "react"
import { User, ExternalLink } from "lucide-react"
import Link from "next/link"

type Project = {
    id: string
    name: string
    description: string | null
    leadId: string | null
    lead: { id: string; name: string } | null
    _count: { pushes: number }
}

type Props = {
    project: Project
    users: { id: string; name: string; role: string }[]
    isAdmin: boolean
}

export function ProjectCard({ project, users, isAdmin }: Props) {
    const [isPending, startTransition] = useTransition()
    const [leadId, setLeadId] = useState(project.leadId || "none")

    const handleLeadChange = (value: string, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setLeadId(value)
        startTransition(async () => {
            await updateProjectLead(project.id, value === "none" ? null : value)
        })
    }

    return (
        <Card className="hover:bg-muted/50 transition-colors h-full group relative">
            <Link href={`/dashboard/projects/${project.id}`} className="absolute inset-0 z-0" />
            <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-medium line-clamp-1">{project.name}</CardTitle>
                </div>
                <CardDescription className="text-xs line-clamp-1">
                    {project.description || "No description"}
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{project._count.pushes} push{project._count.pushes !== 1 ? 'es' : ''}</span>
                    {isAdmin ? (
                        <div
                            className="relative z-10"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Select
                                value={leadId}
                                onValueChange={(v) => handleLeadChange(v, { preventDefault: () => { }, stopPropagation: () => { } } as React.MouseEvent)}
                                disabled={isPending}
                            >
                                <SelectTrigger className="h-6 w-[100px] text-xs border-0 bg-transparent hover:bg-muted">
                                    <User className="h-3 w-3 mr-1" />
                                    <SelectValue placeholder="Lead" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No Lead</SelectItem>
                                    {users.map(u => (
                                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : project.lead ? (
                        <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span>{project.lead.name}</span>
                        </div>
                    ) : null}
                </div>
            </CardContent>
            <Link
                href={`/dashboard/projects/${project.id}`}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
            >
                <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </Link>
        </Card>
    )
}




