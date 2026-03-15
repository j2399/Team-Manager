import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OnboardingForm } from "./OnboardingForm"

import { getCurrentUser } from "@/lib/auth"

export default async function OnboardingPage() {
    const cookieStore = await cookies()
    const discordUserCookie = cookieStore.get('discord_user')
    const user = await getCurrentUser()

    if (!user) {
        redirect('/')
    }

    if (user && user.hasOnboarded) {
        redirect('/workspaces')
    }

    if (!discordUserCookie) {
        redirect('/')
    }

    const discordUser = JSON.parse(discordUserCookie.value)

    const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator || '0') % 5}.png`

    return (
        <div className="relative min-h-screen flex items-center justify-center bg-zinc-50 overflow-hidden p-4">

            {/* Dither/Noise Overlay */}
            <div
                className="fixed inset-0 z-10 pointer-events-none opacity-[0.12] mix-blend-multiply"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                }}
            />

            <Card className="w-full max-w-md shadow-xl border-zinc-200 bg-white/80 backdrop-blur-xl relative z-20">
                <CardHeader className="text-center space-y-3 sm:space-y-4 pb-2 px-4 sm:px-6">
                    <div className="mx-auto relative">
                        <div className="absolute inset-0 bg-zinc-200 blur-xl rounded-full" />
                        <img
                            src={avatarUrl}
                            alt={discordUser.username}
                            className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-white relative shadow-sm"
                        />
                    </div>
                    <div className="space-y-1 sm:space-y-2">
                        <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">
                            Welcome, {discordUser.global_name || discordUser.username}!
                        </CardTitle>
                        <CardDescription className="text-sm sm:text-base text-zinc-500">
                            Let&apos;s get your profile set up on CuPI. <span className="text-zinc-400 text-xs sm:text-sm block mt-1">(You can change these later)</span>
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    <OnboardingForm
                        discordId={discordUser.id}
                        discordUsername={discordUser.username}
                        discordAvatar={avatarUrl}
                        suggestedName={discordUser.global_name || discordUser.username}
                    />
                </CardContent >
            </Card >
        </div >
    )
}
