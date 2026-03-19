"use client"

import { useEffect, useState } from "react"
import { Bell, Check, Clock, FileText, User } from "lucide-react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"

type Notification = {
    id: string
    type: string
    title: string
    message: string
    link?: string | null
    read: boolean
    createdAt: number
}

export function NotificationBell({
    userId,
    workspaceId,
}: {
    userId: string
    workspaceId: string
}) {
    const [open, setOpen] = useState(false)
    const [manualBellRingNonce, setManualBellRingNonce] = useState(0)
    const [clock, setClock] = useState(() => Date.now())

    const notifications = useQuery(api.notifications.listForUser, {
        workspaceId,
        userId,
        limit: 20,
    }) as Notification[] | undefined
    const unreadCount = useQuery(api.notifications.getUnreadCount, {
        workspaceId,
        userId,
    })

    const markRead = useMutation(api.notifications.markRead)
    const markAllRead = useMutation(api.notifications.markAllRead)

    useEffect(() => {
        const interval = window.setInterval(() => {
            setClock(Date.now())
        }, 60000)

        return () => window.clearInterval(interval)
    }, [])

    const resolvedUnreadCount = unreadCount ?? 0
    const resolvedNotifications = notifications ?? []
    const bellAnimationKey = `${resolvedUnreadCount}-${manualBellRingNonce}`
    const shouldAnimateBell = resolvedUnreadCount > 0 || manualBellRingNonce > 0

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen)

        if (isOpen && resolvedUnreadCount > 0) {
            void markAllRead({
                workspaceId,
                userId,
            })
        }
    }

    const handleMarkAllRead = () => {
        void markAllRead({
            workspaceId,
            userId,
        })
    }

    const markNotificationRead = async (notificationId: string) => {
        await markRead({
            workspaceId,
            userId,
            notificationId,
        })
    }

    const getIcon = (type: string) => {
        switch (type) {
            case "member_joined":
                return <User className="h-4 w-4 text-muted-foreground" />
            case "task_due":
                return <Clock className="h-4 w-4 text-muted-foreground" />
            case "task_assigned":
                return <FileText className="h-4 w-4 text-muted-foreground" />
            default:
                return <Bell className="h-4 w-4 text-muted-foreground" />
        }
    }

    const formatTime = (createdAt: number) => {
        const diff = clock - createdAt
        const minutes = Math.floor(diff / 60000)
        const hours = Math.floor(minutes / 60)
        const days = Math.floor(hours / 24)

        if (days > 0) return `${days}d ago`
        if (hours > 0) return `${hours}h ago`
        if (minutes > 0) return `${minutes}m ago`
        return "Just now"
    }

    const handleNotificationClick = async (notification: Notification) => {
        if (!notification.read) {
            try {
                await markNotificationRead(notification.id)
            } catch (error) {
                console.error("Failed to mark notification as read", error)
            }
        }

        if (notification.link) {
            window.location.assign(notification.link)
        }

        setOpen(false)
    }

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-8 w-8"
                    onClick={() => setManualBellRingNonce((nonce) => nonce + 1)}
                >
                    <Bell
                        key={bellAnimationKey}
                        className={cn(
                            "h-4 w-4 origin-top",
                            shouldAnimateBell && "motion-safe:animate-[cupi-bell-ring_900ms_cubic-bezier(0.16,1,0.3,1)_both]"
                        )}
                    />
                    {resolvedUnreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[10px] font-medium text-white flex items-center justify-center animate-pop">
                            {resolvedUnreadCount > 9 ? "9+" : resolvedUnreadCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h4 className="font-semibold text-sm">Notifications</h4>
                    {resolvedUnreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={handleMarkAllRead}
                        >
                            <Check className="h-3 w-3 mr-1" />
                            Mark all read
                        </Button>
                    )}
                </div>
                <ScrollArea className="h-[300px]">
                    {notifications === undefined ? (
                        <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                            <Bell className="h-8 w-8 mb-2 opacity-50 animate-pulse" />
                            <p className="text-sm">Loading notifications</p>
                        </div>
                    ) : resolvedNotifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                            <Bell className="h-8 w-8 mb-2 opacity-50" />
                            <p className="text-sm">No notifications</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {resolvedNotifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    onClick={() => void handleNotificationClick(notification)}
                                    className={`flex gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors ${!notification.read ? 'bg-muted/30 dark:bg-muted/20' : ''
                                        }`}
                                >
                                    <div className="shrink-0 mt-0.5">
                                        {getIcon(notification.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm ${!notification.read ? 'font-medium' : ''}`}>
                                            {notification.title}
                                        </p>
                                        <p className="text-xs text-muted-foreground line-clamp-2">
                                            {notification.message}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground mt-1">
                                            {formatTime(notification.createdAt)}
                                        </p>
                                    </div>
                                    {!notification.read && (
                                        <div className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0 mt-1.5" />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    )
}
