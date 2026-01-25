"use client"

import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

type Step = {
    id: string
    label: string
}

type WizardStepIndicatorProps = {
    steps: Step[]
    currentStep: number
    onStepClick?: (stepIndex: number) => void
}

export function WizardStepIndicator({ steps, currentStep, onStepClick }: WizardStepIndicatorProps) {
    return (
        <div className="flex items-center justify-center gap-2">
            {steps.map((step, index) => {
                const isCompleted = index < currentStep
                const isCurrent = index === currentStep
                const isClickable = onStepClick && index < currentStep

                return (
                    <div key={step.id} className="flex items-center">
                        {/* Step dot/circle */}
                        <button
                            type="button"
                            onClick={() => isClickable && onStepClick(index)}
                            disabled={!isClickable}
                            className={cn(
                                "relative flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300",
                                isCompleted && "bg-primary text-primary-foreground",
                                isCurrent && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                                !isCompleted && !isCurrent && "bg-muted text-muted-foreground",
                                isClickable && "cursor-pointer hover:ring-4 hover:ring-primary/20"
                            )}
                        >
                            {isCompleted ? (
                                <Check className="w-4 h-4" />
                            ) : (
                                <span className="text-sm font-medium">{index + 1}</span>
                            )}

                            {/* Animated pulse for current step */}
                            {isCurrent && (
                                <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
                            )}
                        </button>

                        {/* Step label */}
                        <span
                            className={cn(
                                "ml-2 text-sm font-medium transition-colors",
                                (isCompleted || isCurrent) ? "text-foreground" : "text-muted-foreground"
                            )}
                        >
                            {step.label}
                        </span>

                        {/* Connector line */}
                        {index < steps.length - 1 && (
                            <div className="mx-4 flex items-center">
                                <div
                                    className={cn(
                                        "h-0.5 w-12 transition-all duration-500",
                                        index < currentStep ? "bg-primary" : "bg-muted"
                                    )}
                                    style={{
                                        background: index < currentStep
                                            ? 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary)))'
                                            : undefined
                                    }}
                                />
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
