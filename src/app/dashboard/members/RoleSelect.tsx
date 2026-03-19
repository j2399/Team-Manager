"use client"

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useEffect, useState, useTransition } from "react"
import { updateUserRole } from "@/app/actions/users"
import { useToast } from "@/components/ui/use-toast"

export function RoleSelect({
    userId,
    currentRole,
    currentUserRole,
    disabled,
    onRoleUpdated,
}: {
    userId: string
    currentRole: string
    currentUserRole: string
    disabled?: boolean
    onRoleUpdated?: (newRole: string) => void
}) {
    const [isPending, startTransition] = useTransition()
    const [role, setRole] = useState(currentRole)
    const { toast } = useToast()
    const viewerIsAdmin = currentUserRole === "Admin"
    const isAdminTarget = currentRole === "Admin"
    const selectDisabled = isPending || disabled || (!viewerIsAdmin && isAdminTarget)

    useEffect(() => {
        setRole(currentRole)
    }, [currentRole])

    function handleValueChange(newRole: string) {
        if (newRole === role) return

        setRole(newRole) // Optimistic update

        startTransition(async () => {
            try {
                const result = await updateUserRole(userId, newRole)

                if (result?.error) {
                    setRole(currentRole) // Revert on error
                    toast({
                        title: "Error",
                        description: typeof result?.error === "string" ? result.error : "Failed to update role",
                        variant: "destructive"
                    })
                    return
                }

                onRoleUpdated?.(newRole)
                toast({
                    title: "Role Updated",
                    description: `User role changed to ${newRole}`,
                    variant: "success"
                })
            } catch {
                setRole(currentRole) // Revert on error
                toast({
                    title: "Error",
                    description: "Failed to update role",
                    variant: "destructive"
                })
            }
        })
    }

    return (
        <Select value={role} onValueChange={handleValueChange} disabled={selectDisabled}>
            <SelectTrigger className="w-[140px] ml-auto">
                <SelectValue placeholder="Select Role" />
            </SelectTrigger>
            <SelectContent align="end">
                <SelectItem value="Admin" disabled={!viewerIsAdmin}>Admin</SelectItem>
                <SelectItem value="Team Lead">Team Lead</SelectItem>
                <SelectItem value="Member">Member</SelectItem>
            </SelectContent>
        </Select>
    )
}
