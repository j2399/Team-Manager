"use client"

import { Button } from "@/components/ui/button"
import { LogIn } from "lucide-react"

export function DiscordLoginButton() {
    const handleLogin = () => {
        window.location.href = '/api/discord/login'
    }

    return (
        <Button 
            onClick={handleLogin}
            className="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white h-11 text-base"
            size="lg"
        >
            <LogIn className="w-5 h-5 mr-2" />
            Continue with Discord
        </Button>
    )
}



