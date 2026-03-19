"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

type OnboardingFormProps = {
    userId: string
    suggestedName: string
}

export function OnboardingForm({ userId, suggestedName }: OnboardingFormProps) {
    const router = useRouter()
    const updateOnboardingProfile = useMutation(api.auth.updateOnboardingProfile)
    const [step, setStep] = useState(1)
    const [name, setName] = useState(suggestedName)
    const [interests, setInterests] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState("")

    const handleNext = () => {
        if (step === 1) {
            if (!name.trim()) {
                setError("Please enter your name")
                return
            }
            if (!name.trim().includes(' ')) {
                setError("Please enter your full name (First and Last name)")
                return
            }
            setError("")
            setStep(2)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && step === 1) {
            e.preventDefault()
            handleNext()
        }
    }

    const handleSubmit = async () => {
        if (step !== 2) return

        if (!interests.trim()) {
            setError("Please tell us a bit about your interests")
            return
        }

        setIsSubmitting(true)
        setError("")

        try {
            await updateOnboardingProfile({
                userId,
                name: name.trim(),
                skills: [],
                interests: interests.trim(),
                hasOnboarded: true,
                updatedAt: Date.now(),
            })

            router.push('/dashboard')
            router.refresh()
        } catch {
            setError('Something went wrong. Please try again.')
            setIsSubmitting(false)
        }
    }

    return (
        <div className="space-y-4 sm:space-y-6">

            {/* Progress Indicator */}
            <div className="flex gap-2 mb-4 sm:mb-6 justify-center">
                {[1, 2].map(i => (
                    <div key={i} className={`h-1 sm:h-1.5 flex-1 rounded-full bg-muted overflow-hidden`}>
                        <div className={`h-full bg-primary transition-all duration-500 ease-out ${i <= step ? 'w-full' : 'w-0'}`} />
                    </div>
                ))}
            </div>

            {step === 1 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-8 duration-500">
                    <div className="space-y-2">
                        <Label htmlFor="name">Full Name</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="First Last"
                            autoFocus
                        />
                        <p className="text-xs text-muted-foreground">
                            Please use your real full name so team members can identify you.
                        </p>
                    </div>
                </div>
            )}

            {step === 2 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-8 duration-500">
                    <div className="space-y-2">
                        <Label htmlFor="interests">What do you want to work on?</Label>
                        <textarea
                            id="interests"
                            value={interests}
                            onChange={(e) => setInterests(e.target.value)}
                            placeholder="Tell us about what you're excited to build or learn..."
                            className="w-full h-32 bg-background border rounded-md p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring ring-offset-background transition-all placeholder:text-muted-foreground"
                            autoFocus
                        />
                    </div>
                </div>
            )}

            {error && (
                <p className="text-sm text-destructive font-medium animate-in fade-in slide-in-from-bottom-2">{error}</p>
            )}

            <Button
                type="button"
                onClick={step === 2 ? handleSubmit : handleNext}
                className="w-full h-10 sm:h-11 text-sm sm:text-base font-medium shadow-sm transition-all hover:translate-y-[-1px]"
                disabled={isSubmitting}
            >
                {isSubmitting ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Setting up...
                    </>
                ) : (
                    step === 2 ? "Finish & Go to Workspace" : "Next"
                )}
            </Button>
        </div>
    )
}
