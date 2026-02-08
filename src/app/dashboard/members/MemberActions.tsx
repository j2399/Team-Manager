"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { LogOut, Trash2 } from "lucide-react"
import { removeUserFromWorkspace } from "@/app/actions/users"
import { useToast } from "@/components/ui/use-toast"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type MemberActionsProps = {
    userId: string
    isCurrentUser: boolean
    canRemove: boolean
}

export function MemberActions({ userId, isCurrentUser, canRemove }: MemberActionsProps) {
    const { toast } = useToast()
    const [isLoading, setIsLoading] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)

    // Only show if:
    // 1. It's the current user (Leave button)
    // 2. OR the viewer has permission to remove others
    if (!isCurrentUser && !canRemove) {
        return null
    }

    const handleAction = async () => {
        setIsLoading(true)
        try {
            const result = await removeUserFromWorkspace(userId)
            if (result.error) {
                toast({
                    title: "Error",
                    description: result.error,
                    variant: "destructive",
                })
            } else {
                toast({
                    title: "Success",
                    description: isCurrentUser ? "You have left the workspace" : "Member removed from workspace",
                })
                if (isCurrentUser) {
                    window.location.href = '/' // Redirect to home/login if leaving
                }
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Something went wrong",
                variant: "destructive",
            })
        } finally {
            setIsLoading(false)
            setShowConfirm(false)
        }
    }

    const buttonProps = isCurrentUser
        ? {
            icon: LogOut,
            label: "Leave",
            variant: "outline" as const,
            title: "Leave Workspace",
            confirmTitle: "Leave Workspace?",
            confirmDesc: "You'll lose access to all divisions."
        }
        : {
            icon: Trash2,
            label: "Remove",
            variant: "destructive" as const,
            title: "Remove Member",
            confirmTitle: "Remove Member?",
            confirmDesc: "They'll lose workspace access immediately."
        }

    const Icon = buttonProps.icon

    return (
        <>
            <Button
                variant={buttonProps.variant}
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowConfirm(true)}
                title={buttonProps.title}
                disabled={isLoading}
            >
                <Icon className="h-4 w-4" />
            </Button>

            <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{buttonProps.confirmTitle}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {buttonProps.confirmDesc}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleAction}
                            className={isCurrentUser ? "" : "bg-destructive hover:bg-destructive/90 text-white"}
                        >
                            {isLoading ? "Processing..." : "Confirm"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
