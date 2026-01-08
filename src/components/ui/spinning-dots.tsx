"use client"

import { cn } from "@/lib/utils"

interface SpinningDotsProps {
    className?: string
}

export function SpinningDots({ className }: SpinningDotsProps) {
    return (
        <div className={cn("relative w-3 h-3", className)}>
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    className="absolute w-1 h-1 rounded-full bg-current"
                    style={{
                        animation: `spinningDot 0.8s ease-in-out infinite`,
                        animationDelay: `${i * -0.266}s`,
                        top: '50%',
                        left: '50%',
                        transformOrigin: '0 0',
                    }}
                />
            ))}
            <style jsx>{`
                @keyframes spinningDot {
                    0%, 100% {
                        transform: rotate(0deg) translateX(4px) translateY(-50%);
                        opacity: 1;
                    }
                    33% {
                        transform: rotate(120deg) translateX(4px) translateY(-50%);
                        opacity: 0.7;
                    }
                    66% {
                        transform: rotate(240deg) translateX(4px) translateY(-50%);
                        opacity: 0.4;
                    }
                }
            `}</style>
        </div>
    )
}
