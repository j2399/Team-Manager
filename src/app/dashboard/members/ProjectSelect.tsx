"use client"

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { updateUserProjects } from "@/app/actions/users"
import { ChevronDown } from "lucide-react"
import { useEffect, useState, useTransition } from "react"
import { useToast } from "@/components/ui/use-toast"

type Project = {
    id: string
    name: string
    color?: string | null
}

export function ProjectSelect({
    userId,
    currentProjectIds,
    allProjects,
    disabled,
    onProjectsUpdated
}: {
    userId: string
    currentProjectIds: string[]
    allProjects: Project[]
    disabled?: boolean
    onProjectsUpdated?: (projectIds: string[]) => void
}) {
    const [isPending, startTransition] = useTransition()
    const [open, setOpen] = useState(false)
    const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(currentProjectIds)
    const { toast } = useToast()

    useEffect(() => {
        setSelectedProjectIds(currentProjectIds)
    }, [currentProjectIds])

    function toggleProject(projectId: string) {
        const newIds = selectedProjectIds.includes(projectId)
            ? selectedProjectIds.filter(id => id !== projectId)
            : [...selectedProjectIds, projectId]
        setSelectedProjectIds(newIds)
    }

    function handleSave() {
        startTransition(async () => {
            try {
                const result = await updateUserProjects(userId, selectedProjectIds)

                if (result?.error) {
                    setSelectedProjectIds(currentProjectIds) // Revert on error
                    toast({
                        title: "Error",
                        description: typeof result?.error === "string" ? result.error : "Failed to update divisions",
                        variant: "destructive"
                    })
                    return
                }

                onProjectsUpdated?.(selectedProjectIds)
                toast({
                    title: "Divisions Updated",
                    description: `User is now assigned to ${selectedProjectIds.length} division(s)`,
                    variant: "success"
                })
                setOpen(false)
            } catch {
                setSelectedProjectIds(currentProjectIds) // Revert on error
                toast({
                    title: "Error",
                    description: "Failed to update divisions",
                    variant: "destructive"
                })
            }
        })
    }

    const selectedCount = selectedProjectIds.length

    // Get the name of the first selected division
    const firstProject = allProjects.find(p => selectedProjectIds.includes(p.id))

    const displayText = selectedCount === 0
        ? "No divisions"
        : selectedCount === 1
            ? (firstProject?.name || "1 division")
            : `${firstProject?.name || "Division"} +${selectedCount - 1}`

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className="w-[140px] justify-between"
                    disabled={isPending || disabled}
                >
                    <span className="truncate">{displayText}</span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[250px] p-0" align="end">
                <div className="max-h-[300px] overflow-y-auto overscroll-contain p-3 space-y-2">
                    {allProjects.map(project => (
                        <div
                            key={project.id}
                            className="flex items-center space-x-2 hover:bg-accent rounded p-2 cursor-pointer"
                            onClick={() => toggleProject(project.id)}
                        >
                            <Checkbox
                                checked={selectedProjectIds.includes(project.id)}
                            />
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span
                                    className="h-2 w-2 rounded-full shrink-0 ring-1 ring-border/50"
                                    style={{ backgroundColor: project.color || "#3b82f6" }}
                                />
                                <Label className="text-sm font-normal cursor-pointer flex-1 truncate">
                                    {project.name}
                                </Label>
                            </div>
                        </div>
                    ))}
                    {allProjects.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-2">
                            No divisions available
                        </p>
                    )}
                </div>
                <div className="border-t p-2">
                    <Button
                        onClick={handleSave}
                        className="w-full"
                        size="sm"
                        disabled={isPending}
                    >
                        {isPending ? 'Saving...' : 'Save'}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    )
}
