"use client"

import { Button } from "@/components/ui/button"
import { User } from "lucide-react"

export function DemoLoginButton() {
    const handleDemoLogin = () => {
        window.location.href = '/api/auth/demo'
    }

    return (
        <Button 
            onClick={handleDemoLogin}
            variant="outline"
            className="w-full border-[#404249] text-[#b5bac1] hover:bg-[#404249] hover:text-white h-11 text-base"
            size="lg"
        >
            <User className="w-5 h-5 mr-2" />
            Demo Login (Admin)
        </Button>
    )
}



