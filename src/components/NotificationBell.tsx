"use client"

import { useState, useEffect, useRef } from "react"
import { Bell, Check, User, Clock, FileText, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

type Notification = {
    id: string
    type: string
    title: string
    message: string
    link: string | null
    read: boolean
    createdAt: string
}

export function NotificationBell() {
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [open, setOpen] = useState(false)
    const [bellRingNonce, setBellRingNonce] = useState(0)
    const [unreadCount, setUnreadCount] = useState(0)
    const lastCheckTime = useRef<string>(new Date().toISOString())
    const isTabVisible = useRef(true)
    const hasFetchedFull = useRef(false)

    // Full fetch - get all notifications
    const fetchAllNotifications = async () => {
        try {
            const res = await fetch('/api/notifications')
            if (res.ok) {
                const data = await res.json()
                setNotifications(data.notifications || [])
                setUnreadCount((data.notifications || []).filter((n: Notification) => !n.read).length)
                lastCheckTime.current = data.lastCheck || new Date().toISOString()
                hasFetchedFull.current = true
            }
        } catch (e) {
            console.error('Failed to fetch notifications', e)
        }
    }

    // Lightweight poll - just check count
    const checkForNew = async () => {
        if (!isTabVisible.current) return

        try {
            const res = await fetch('/api/notifications?countOnly=true')
            if (res.ok) {
                const data = await res.json()
                const newCount = data.unreadCount || 0
                if (newCount !== unreadCount) {
                    setUnreadCount(newCount)
                    // If count increased, ring the bell
                    if (newCount > unreadCount) {
                        setBellRingNonce(n => n + 1)
                    }
                }
            }
        } catch (e) {
            // Silent fail
        }
    }

    // Track tab visibility
    useEffect(() => {
        const handleVisibility = () => {
            isTabVisible.current = document.visibilityState === 'visible'
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [])

    // Initial fetch
    useEffect(() => {
        fetchAllNotifications()
    }, [])

    // Smart polling - lightweight check every 5 seconds
    useEffect(() => {
        const interval = setInterval(checkForNew, 5000)
        return () => clearInterval(interval)
    }, [unreadCount])

    // Fetch full data when popover opens
    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen)
        if (isOpen) {
            // Refresh notifications when opening
            fetchAllNotifications()
            if (unreadCount > 0) {
                markAllAsRead()
            }
        }
    }

    const markAsRead = async (notificationId: string) => {
        try {
            await fetch('/api/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationId })
            })
            setNotifications(prev =>
                prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
            )
        } catch (e) {
            console.error('Failed to mark as read', e)
        }
    }

    const markAllAsRead = async () => {
        try {
            await fetch('/api/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markAllRead: true })
            })
            setNotifications(prev => prev.map(n => ({ ...n, read: true })))
            setUnreadCount(0)
        } catch (e) {
            console.error('Failed to mark all as read', e)
        }
    }

    const getIcon = (type: string) => {
        switch (type) {
            case 'member_joined': return <User className="h-4 w-4 text-muted-foreground" />
            case 'task_due': return <Clock className="h-4 w-4 text-muted-foreground" />
            case 'task_assigned': return <FileText className="h-4 w-4 text-muted-foreground" />
            default: return <Bell className="h-4 w-4 text-muted-foreground" />
        }
    }

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr)
        const now = new Date()
        const diff = now.getTime() - date.getTime()
        const minutes = Math.floor(diff / 60000)
        const hours = Math.floor(minutes / 60)
        const days = Math.floor(hours / 24)

        if (days > 0) return `${days}d ago`
        if (hours > 0) return `${hours}h ago`
        if (minutes > 0) return `${minutes}m ago`
        return 'Just now'
    }

    const handleNotificationClick = (notification: Notification) => {
        if (!notification.read) {
            markAsRead(notification.id)
        }
        if (notification.link) {
            window.location.href = notification.link
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
                    onClick={() => setBellRingNonce((n) => n + 1)}
                >
                    <Bell
                        key={bellRingNonce}
                        className={cn(
                            "h-4 w-4 origin-top",
                            bellRingNonce > 0 && "motion-safe:animate-[cupi-bell-ring_900ms_cubic-bezier(0.16,1,0.3,1)_both]"
                        )}
                    />
                    {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[10px] font-medium text-white flex items-center justify-center animate-pop">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h4 className="font-semibold text-sm">Notifications</h4>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={markAllAsRead}
                        >
                            <Check className="h-3 w-3 mr-1" />
                            Mark all read
                        </Button>
                    )}
                </div>
                <ScrollArea className="h-[300px]">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                            <Bell className="h-8 w-8 mb-2 opacity-50" />
                            <p className="text-sm">No notifications</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {notifications.map(notification => (
                                <div
                                    key={notification.id}
                                    onClick={() => handleNotificationClick(notification)}
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
