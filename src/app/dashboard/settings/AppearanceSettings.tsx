"use client"

import { useEffect, useState } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { ThemePreference } from "@/components/ThemeClient"

function applyThemePreference(pref: ThemePreference) {
    const root = document.documentElement
    root.dataset.theme = pref

    const shouldBeDark =
        pref === "dark" ||
        (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)

    root.classList.toggle("dark", shouldBeDark)
    root.style.colorScheme = shouldBeDark ? "dark" : "light"
}

export function AppearanceSettings({ userId }: { userId: string }) {
    const rootKey = "cupi_theme"
    const userKey = `cupi_theme:${userId}`

    const [preference, setPreference] = useState<ThemePreference>("system")

    useEffect(() => {
        try {
            const pref = (window.localStorage.getItem(userKey) || window.localStorage.getItem(rootKey) || "system") as ThemePreference
            if (pref === "system" || pref === "light" || pref === "dark") {
                setPreference(pref)
                applyThemePreference(pref)
            }
        } catch {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId])

    const setAndPersist = (next: ThemePreference) => {
        setPreference(next)
        applyThemePreference(next)
        try {
            window.localStorage.setItem(userKey, next)
            window.localStorage.setItem(rootKey, next)
        } catch {
            // ignore
        }
    }

    return (
        <div className="grid gap-2">
            <Label>Appearance</Label>
            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    variant={preference === "system" ? "secondary" : "outline"}
                    size="sm"
                    className={cn("gap-2", preference === "system" && "ring-1 ring-border")}
                    onClick={() => setAndPersist("system")}
                >
                    <Monitor className="h-4 w-4" />
                    System
                </Button>
                <Button
                    type="button"
                    variant={preference === "light" ? "secondary" : "outline"}
                    size="sm"
                    className={cn("gap-2", preference === "light" && "ring-1 ring-border")}
                    onClick={() => setAndPersist("light")}
                >
                    <Sun className="h-4 w-4" />
                    Light
                </Button>
                <Button
                    type="button"
                    variant={preference === "dark" ? "secondary" : "outline"}
                    size="sm"
                    className={cn("gap-2", preference === "dark" && "ring-1 ring-border")}
                    onClick={() => setAndPersist("dark")}
                >
                    <Moon className="h-4 w-4" />
                    Dark
                </Button>
            </div>
        </div>
    )
}

