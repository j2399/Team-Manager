"use client"

import { useEffect, useState, useTransition, type ReactNode } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { updateThemePreference } from "@/app/actions/user-settings"

type ThemePreference = "system" | "light" | "dark"

function applyThemePreference(pref: ThemePreference) {
    const root = document.documentElement
    root.dataset.theme = pref

    const shouldBeDark =
        pref === "dark" ||
        (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)

    root.classList.toggle("dark", shouldBeDark)
    root.style.colorScheme = shouldBeDark ? "dark" : "light"
}

export function ThemeSettings({ initialPreference }: { initialPreference: ThemePreference }) {
    const [isPending, startTransition] = useTransition()
    const [preference, setPreference] = useState<ThemePreference>(initialPreference)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        applyThemePreference(preference)
    }, [preference])

    const setAndPersist = (next: ThemePreference) => {
        setPreference(next)
        setError(null)

        startTransition(async () => {
            const res = await updateThemePreference(next)
            if (res?.error) setError(res.error)
        })
    }

    const options: Array<{ key: ThemePreference; label: string; icon: ReactNode }> = [
        { key: "system", label: "System", icon: <Monitor className="h-4 w-4" /> },
        { key: "light", label: "Light", icon: <Sun className="h-4 w-4" /> },
        { key: "dark", label: "Dark", icon: <Moon className="h-4 w-4" /> },
    ]

    return (
        <div className="grid gap-2">
            <Label>Appearance</Label>
            <div className="flex items-center gap-2">
                {options.map((opt) => (
                    <Button
                        key={opt.key}
                        type="button"
                        variant={preference === opt.key ? "secondary" : "outline"}
                        size="sm"
                        className={cn("gap-2", preference === opt.key && "ring-1 ring-border")}
                        onClick={() => setAndPersist(opt.key)}
                        disabled={isPending}
                    >
                        {opt.icon}
                        {opt.label}
                    </Button>
                ))}
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
    )
}
