"use client"

import { useEffect } from "react"

export type ThemePreference = "system" | "light" | "dark"

function applyThemePreference(pref: ThemePreference) {
    const root = document.documentElement
    root.dataset.theme = pref

    const shouldBeDark =
        pref === "dark" ||
        (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)

    root.classList.toggle("dark", shouldBeDark)
    root.style.colorScheme = shouldBeDark ? "dark" : "light"
}

export function ThemeClient({ userId }: { userId?: string | null }) {
    useEffect(() => {
        const rootKey = "cupi_theme"
        const userKey = userId ? `cupi_theme:${userId}` : null

        const readPref = (): ThemePreference => {
            try {
                const userPref = userKey ? window.localStorage.getItem(userKey) : null
                const pref = (userPref || window.localStorage.getItem(rootKey) || "system") as ThemePreference
                if (pref === "system" || pref === "light" || pref === "dark") return pref
                return "system"
            } catch {
                return "system"
            }
        }

        const pref = readPref()
        applyThemePreference(pref)

        if (pref === "system" && window.matchMedia) {
            const mql = window.matchMedia("(prefers-color-scheme: dark)")
            const handler = () => applyThemePreference("system")
            try {
                mql.addEventListener("change", handler)
                return () => mql.removeEventListener("change", handler)
            } catch {
                // Safari fallback (ignored)
            }
        }
    }, [userId])

    return null
}

