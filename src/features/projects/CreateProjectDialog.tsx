"use client"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createProject } from "@/app/actions/projects"
import { useState, useTransition } from "react"
import { Plus } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

type User = {
    id: string
    name: string
    role: string
}

type Props = {
    users: User[]
}

export function CreateProjectDialog({ users }: Props) {
    const [open, setOpen] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [leadId, setLeadId] = useState<string>("")
    const { toast } = useToast()

    async function handleSubmit(formData: FormData) {
        if (!leadId) {
            toast({ title: "Error", description: "Division Lead is required", variant: "destructive" })
            return
        }

        formData.set('leadId', leadId)

        startTransition(async () => {
            const result = await createProject(formData)

            if (result?.error) {
                toast({ title: "Error", description: result.error, variant: "destructive" })
            } else {
                toast({ title: "Division Created" })
                setOpen(false)
                setLeadId("")
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    New Division
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={(e) => {
                    e.preventDefault();
                    if (isPending) return;
                    const formData = new FormData(e.currentTarget);
                    handleSubmit(formData);
                }}>
                    <DialogHeader>
                        <DialogTitle>Create Division</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Name</Label>
                            <Input id="name" name="name" required autoComplete="off" />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea id="description" name="description" autoComplete="off" />
                        </div>
                        <div className="grid gap-2">
                            <Label className="flex items-center gap-1">
                                Division Lead <span className="text-red-500">*</span>
                            </Label>
                            <Select value={leadId} onValueChange={setLeadId} required>
                                <SelectTrigger className={!leadId ? "border-red-300" : ""}>
                                    <SelectValue placeholder="Select a lead" />
                                </SelectTrigger>
                                <SelectContent>
                                    {users.map(user => (
                                        <SelectItem key={user.id} value={user.id}>
                                            {user.name} ({user.role})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {!leadId && (
                                <p className="text-xs text-red-500">Division Lead is required</p>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? 'Creating...' : 'Create Division'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}


