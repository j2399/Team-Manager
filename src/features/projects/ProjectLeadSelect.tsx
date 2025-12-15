"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateProjectLead } from "@/app/actions/projects"
import { useState, useTransition } from "react"
import { User } from "lucide-react"

type Props = {
    projectId: string
    currentLeadId: string | null
    users: { id: string; name: string; role: string }[]
    isAdmin: boolean
}

export function ProjectLeadSelect({ projectId, currentLeadId, users, isAdmin }: Props) {
    const [isPending, startTransition] = useTransition()
    const [leadId, setLeadId] = useState(currentLeadId || "none")

    const currentLead = users.find(u => u.id === currentLeadId)

    const handleChange = (value: string) => {
        setLeadId(value)
        startTransition(async () => {
            await updateProjectLead(projectId, value === "none" ? null : value)
        })
    }

    if (!isAdmin) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>Lead: {currentLead?.name || 'None'}</span>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <Select value={leadId} onValueChange={handleChange} disabled={isPending}>
                <SelectTrigger className="h-8 w-[180px]">
                    <SelectValue placeholder="Select lead" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="none">No Lead</SelectItem>
                    {users.map(user => (
                        <SelectItem key={user.id} value={user.id}>
                            {user.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}




