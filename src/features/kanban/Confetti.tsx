"use client"

import { useCallback, useRef, useEffect, useState } from "react"

type ConfettiType = 'review' | 'done'

interface Particle {
    x: number
    y: number
    vx: number
    vy: number
    color: string
    size: number
    rotation: number
    rotationSpeed: number
    life: number
}

const REVIEW_COLORS = ['#8B5CF6', '#6366F1', '#3B82F6', '#06B6D4', '#A855F7']
const DONE_COLORS = ['#FFFFFF', '#22C55E', '#86EFAC'] // default done colors (white + green)

// Generate colors based on project color: white, project color, and complementary
function generateColors(projectColor?: string): string[] {
    const white = '#FFFFFF'

    if (!projectColor) {
        return [white, '#22C55E', '#86EFAC'] // default green palette
    }

    // Parse hex color to RGB
    const hex = projectColor.replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)

    // Create a lighter tint of the project color
    const tintR = Math.min(255, r + Math.round((255 - r) * 0.4))
    const tintG = Math.min(255, g + Math.round((255 - g) * 0.4))
    const tintB = Math.min(255, b + Math.round((255 - b) * 0.4))
    const tint = `#${tintR.toString(16).padStart(2, '0')}${tintG.toString(16).padStart(2, '0')}${tintB.toString(16).padStart(2, '0')}`

    return [white, projectColor, tint]
}

function buildBurstPieces(type: ConfettiType) {
    const colors = type === 'review' ? REVIEW_COLORS : DONE_COLORS
    const count = type === 'done' ? 40 : 25

    return Array.from({ length: count }, (_, index) => ({
        key: index,
        color: colors[index % colors.length],
        left: 40 + Math.random() * 20,
        delay: Math.random() * 0.3,
        duration: 1.2 + Math.random() * 0.8,
        xOffset: (Math.random() - 0.5) * 300,
        rotation: Math.random() * 720 - 360,
    }))
}

export function useConfetti() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const particles = useRef<Particle[]>([])
    const animationFrame = useRef<number | null>(null)

    useEffect(() => {
        // Create canvas on mount
        const canvas = document.createElement('canvas')
        canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
            z-index: 1;
        `
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
        document.body.appendChild(canvas)
        canvasRef.current = canvas

        const handleResize = () => {
            if (canvasRef.current) {
                canvasRef.current.width = window.innerWidth
                canvasRef.current.height = window.innerHeight
            }
        }
        window.addEventListener('resize', handleResize)

        return () => {
            window.removeEventListener('resize', handleResize)
            if (canvasRef.current) {
                document.body.removeChild(canvasRef.current)
            }
            if (animationFrame.current) {
                cancelAnimationFrame(animationFrame.current)
            }
        }
    }, [])

    const animate = useCallback(function animateFrame() {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.clearRect(0, 0, canvas.width, canvas.height)

        particles.current = particles.current.filter(p => {
            p.life -= 0.01
            if (p.life <= 0) return false

            p.x += p.vx
            p.y += p.vy
            p.vy += 0.15 // gravity
            p.vx *= 0.99 // air resistance
            p.rotation += p.rotationSpeed

            ctx.save()
            ctx.translate(p.x, p.y)
            ctx.rotate(p.rotation)
            ctx.globalAlpha = Math.min(1, p.life * 2)
            ctx.fillStyle = p.color

            // Draw confetti piece (rectangle with slight variation)
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)

            ctx.restore()
            return true
        })

        if (particles.current.length > 0) {
            animationFrame.current = requestAnimationFrame(animateFrame)
        }
    }, [])

    const triggerConfetti = useCallback((type: ConfettiType, position?: { x: number, y: number }, projectColor?: string) => {
        // Always use project colors for both review and done
        const colors = generateColors(projectColor)
        const particleCount = type === 'done' ? 60 : 40
        const canvas = canvasRef.current
        if (!canvas) return

        // Spawn from the card center position
        const originX = position?.x ?? window.innerWidth / 2
        const originY = position?.y ?? window.innerHeight * 0.4

        for (let i = 0; i < particleCount; i++) {
            // Burst in all directions from center (like exploding from behind)
            const angle = Math.random() * Math.PI * 2 // full 360 degrees
            const velocity = 3 + Math.random() * 4 // gentler burst

            // Add slight offset so particles start slightly outside center
            const offsetDistance = 8 + Math.random() * 15
            const startX = originX + Math.cos(angle) * offsetDistance
            const startY = originY + Math.sin(angle) * offsetDistance

            particles.current.push({
                x: startX,
                y: startY,
                vx: Math.cos(angle) * velocity,
                vy: Math.sin(angle) * velocity - 1, // slight upward bias
                color: colors[Math.floor(Math.random() * colors.length)],
                size: 14 + Math.random() * 10, // larger particles for visibility
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.3,
                life: 0.9 + Math.random() * 0.5
            })
        }

        if (!animationFrame.current) {
            animate()
        }
    }, [animate])

    return { triggerConfetti }
}

// Alternative: Simple CSS-based confetti burst (no canvas)
export function ConfettiBurst({ type, onComplete }: { type: ConfettiType; onComplete: () => void }) {
    const [pieces] = useState(() => buildBurstPieces(type))

    useEffect(() => {
        const timer = setTimeout(onComplete, 2000)
        return () => clearTimeout(timer)
    }, [onComplete])

    return (
        <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
            {pieces.map((piece) => (
                <div
                    key={piece.key}
                    className="absolute w-3 h-2 rounded-sm"
                    style={{
                        backgroundColor: piece.color,
                        left: `${piece.left}%`,
                        top: '30%',
                        animation: `confetti-fall ${piece.duration}s ease-out ${piece.delay}s forwards`,
                        transform: `translateX(${piece.xOffset}px) rotate(${piece.rotation}deg)`,
                        opacity: 0,
                    }}
                />
            ))}
            <style jsx>{`
                @keyframes confetti-fall {
                    0% {
                        opacity: 1;
                        transform: translateY(0) translateX(var(--x, 0)) rotate(0deg);
                    }
                    100% {
                        opacity: 0;
                        transform: translateY(400px) translateX(calc(var(--x, 0) * 1.5)) rotate(720deg);
                    }
                }
            `}</style>
        </div>
    )
}
