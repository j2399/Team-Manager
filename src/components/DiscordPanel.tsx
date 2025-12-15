"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { MessageSquare, LogIn, LogOut } from "lucide-react"
import Image from "next/image"

type DiscordUser = {
    id: string
    username: string
    discriminator: string
    avatar: string | null
    global_name: string | null
}

export function DiscordPanel() {
    const [user, setUser] = useState<DiscordUser | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch('/api/discord/user')
            .then(res => res.json())
            .then(data => {
                setUser(data.user)
                setLoading(false)
            })
            .catch(() => setLoading(false))
    }, [])

    const handleLogin = () => {
        window.location.href = '/api/discord/login'
    }

    const handleLogout = async () => {
        await fetch('/api/discord/user', { method: 'DELETE' })
        setUser(null)
    }

    const getAvatarUrl = (user: DiscordUser) => {
        if (user.avatar) {
            return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
        }
        const defaultAvatar = parseInt(user.discriminator) % 5
        return `https://cdn.discordapp.com/embed/avatars/${defaultAvatar}.png`
    }

    if (loading) {
        return (
            <div className="h-full bg-[#313338] flex items-center justify-center">
                <div className="text-[#b5bac1] text-sm">Loading...</div>
            </div>
        )
    }

    if (!user) {
        return (
            <div className="h-full bg-[#313338] flex flex-col items-center justify-center gap-4 p-6">
                <div className="w-16 h-16 rounded-full bg-[#5865f2] flex items-center justify-center">
                    <MessageSquare className="w-8 h-8 text-white" />
                </div>
                <div className="text-center">
                    <h3 className="text-white font-semibold mb-1">Connect Discord</h3>
                    <p className="text-[#b5bac1] text-sm mb-4">Sign in to see your Discord and team chat</p>
                    <Button 
                        onClick={handleLogin}
                        className="bg-[#5865f2] hover:bg-[#4752c4] text-white"
                    >
                        <LogIn className="w-4 h-4 mr-2" />
                        Login with Discord
                    </Button>
                </div>
                <p className="text-[#72767d] text-xs mt-4">
                    Add DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET to .env
                </p>
            </div>
        )
    }

    return (
        <div className="h-full bg-[#313338] flex flex-col">
            {/* User Header */}
            <div className="p-3 border-b border-[#1e1f22] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <img
                            src={getAvatarUrl(user)}
                            alt={user.username}
                            className="w-8 h-8 rounded-full"
                        />
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#23a559] rounded-full border-2 border-[#313338]" />
                    </div>
                    <div>
                        <div className="text-white text-sm font-medium">{user.global_name || user.username}</div>
                        <div className="text-[#b5bac1] text-xs">@{user.username}</div>
                    </div>
                </div>
                <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={handleLogout}
                    className="text-[#b5bac1] hover:text-white hover:bg-[#404249] h-7"
                >
                    <LogOut className="w-3.5 h-3.5" />
                </Button>
            </div>

            {/* Discord Widget/Embed */}
            <div className="flex-1">
                <iframe
                    src="https://discord.com/widget?id=YOUR_SERVER_ID&theme=dark"
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
                ></iframe>
            </div>
        </div>
    )
}




