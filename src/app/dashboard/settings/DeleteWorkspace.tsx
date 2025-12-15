"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { deleteWorkspace } from "@/app/actions/workspace-settings"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { AlertTriangle, Trash2 } from "lucide-react"

export function DeleteWorkspace({ workspaceId, workspaceName }: { workspaceId: string, workspaceName: string }) {
    const [confirmName, setConfirmName] = useState("")
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [open, setOpen] = useState(false)

    const handleDelete = async () => {
        if (confirmName !== workspaceName) return;

        startTransition(async () => {
            const res = await deleteWorkspace(workspaceId, confirmName)
            if (res.error) setError(res.error)
            else {
                window.location.href = '/workspaces'
            }
        })
    }

    return (
        <Card className="border-red-200 bg-red-50/50">
            <CardHeader>
                <CardTitle className="text-base text-red-900 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> Delete Workspace
                </CardTitle>
                <CardDescription className="text-red-700">
                    Irreversible actions for this workspace.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button variant="destructive" className="w-full sm:w-auto gap-2">
                            <Trash2 className="h-4 w-4" /> Delete Workspace
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Delete Workspace</DialogTitle>
                            <DialogDescription>
                                This action cannot be undone. This will permanently delete the
                                <span className="font-bold text-foreground"> {workspaceName} </span>
                                workspace and remove all associated data (projects, tasks, members).
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">
                                    Type <span className="font-mono font-bold select-all">{workspaceName}</span> to confirm
                                </label>
                                <Input
                                    value={confirmName}
                                    onChange={(e) => setConfirmName(e.target.value)}
                                    onPaste={(e) => e.preventDefault()}
                                    onDrop={(e) => e.preventDefault()}
                                    autoComplete="off"
                                    placeholder={workspaceName}
                                    className="border-red-200 focus-visible:ring-red-500"
                                />
                            </div>
                            {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
                        </div>

                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button
                                variant="destructive"
                                disabled={confirmName !== workspaceName || isPending}
                                onClick={handleDelete}
                            >
                                {isPending ? 'Deleting...' : 'Delete Workspace'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    )
}
