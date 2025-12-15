"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"

type TransitionDetail = {
    color: string
}

const EVENT_NAME = "cupi:project-transition"

function safeHexToRgba(hex: string, alpha: number) {
    const clampedAlpha = Math.max(0, Math.min(1, alpha))
    const normalized = hex.trim().replace(/^#/, "")
    const expanded = normalized.length === 3
        ? normalized.split("").map((c) => c + c).join("")
        : normalized

    if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return `rgba(59, 130, 246, ${clampedAlpha})`

    const r = parseInt(expanded.slice(0, 2), 16)
    const g = parseInt(expanded.slice(2, 4), 16)
    const b = parseInt(expanded.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`
}

export function ProjectNavTransition() {
    const [active, setActive] = useState(false)
    const [fromColor, setFromColor] = useState<string>("#3b82f6")
    const [toColor, setToColor] = useState<string>("#3b82f6")
    const hideTimer = useRef<number | null>(null)

    useEffect(() => {
        const handler = (evt: Event) => {
            const detail = (evt as CustomEvent<TransitionDetail>).detail
            const nextColor = detail?.color || "#3b82f6"

            setFromColor((prev) => prev || "#3b82f6")
            setToColor(nextColor)
            setActive(true)

            try {
                document.documentElement.style.setProperty("--cupi-project-color", nextColor)
            } catch {
                // ignore
            }

            if (hideTimer.current) window.clearTimeout(hideTimer.current)
            hideTimer.current = window.setTimeout(() => {
                setActive(false)
                setFromColor(nextColor)
            }, 520)
        }

        window.addEventListener(EVENT_NAME, handler as EventListener)
        return () => {
            window.removeEventListener(EVENT_NAME, handler as EventListener)
            if (hideTimer.current) window.clearTimeout(hideTimer.current)
        }
    }, [])

    return (
        <AnimatePresence>
            {active && (
                <motion.div
                    key={`${fromColor}->${toColor}`}
                    className="fixed inset-0 z-[100] pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                >
                    <motion.div
                        className="absolute inset-0"
                        style={{
                            background: `radial-gradient(1200px circle at 22% 18%, ${safeHexToRgba(fromColor, 0.22)}, transparent 60%)`,
                        }}
                        initial={{ opacity: 0.0 }}
                        animate={{ opacity: [0.0, 0.75, 0.0] }}
                        transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
                    />
                    <motion.div
                        className="absolute inset-0"
                        style={{
                            background: `radial-gradient(1200px circle at 22% 18%, ${safeHexToRgba(toColor, 0.24)}, transparent 60%)`,
                        }}
                        initial={{ opacity: 0.0, scaleX: 0.985, scaleY: 0.97, filter: "blur(0px)" }}
                        animate={{
                            opacity: [0.0, 0.92, 0.0],
                            scaleX: [0.985, 1.01, 1],
                            scaleY: [0.97, 1.03, 1],
                            filter: ["blur(0px)", "blur(0.5px)", "blur(0px)"],
                        }}
                        transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    )
}

export function triggerProjectNavTransition(color: string) {
    try {
        window.dispatchEvent(new CustomEvent<TransitionDetail>(EVENT_NAME, { detail: { color } }))
    } catch {
        // ignore
    }
}

