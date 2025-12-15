"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

type OnboardingFormProps = {
    discordId: string
    discordUsername: string
    discordAvatar: string
    suggestedName: string
    inviteCode?: string
}

export function OnboardingForm({ discordId, discordUsername, discordAvatar, suggestedName }: OnboardingFormProps) {
    const router = useRouter()
    const [step, setStep] = useState(1)
    const [name, setName] = useState(suggestedName)
    const [skills, setSkills] = useState<string[]>([])
    const [currentSkill, setCurrentSkill] = useState("")
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
        } else if (step === 2) {
            if (skills.length === 0) {
                setError("Please add at least one skill")
                return
            }
            setError("")
            setStep(3)
        }
    }

    const handleAddSkill = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            const trimmed = currentSkill.trim()
            if (trimmed && !skills.includes(trimmed)) {
                setSkills([...skills, trimmed])
                setCurrentSkill("")
                setError("")
            }
        }
    }

    const removeSkill = (skillToRemove: string) => {
        setSkills(skills.filter(s => s !== skillToRemove))
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && step === 1) {
            e.preventDefault()
            handleNext()
        }
    }

    const handleSubmit = async () => {
        if (step !== 3) return

        if (!interests.trim()) {
            setError("Please tell us a bit about your interests")
            return
        }

        setIsSubmitting(true)
        setError("")

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    discordId,
                    discordUsername,
                    avatar: discordAvatar,
                    skills,
                    interests: interests.trim()
                })
            })

            if (res.ok) {
                router.push('/dashboard')
                router.refresh()
            } else {
                const data = await res.json()
                setError(data.error || 'Failed to create account')
                setIsSubmitting(false)
            }
        } catch (err) {
            setError('Something went wrong. Please try again.')
            setIsSubmitting(false)
        }
    }

    return (
        <div className="space-y-6">

            {/* Progress Indicator */}
            <div className="flex gap-2 mb-6 justify-center">
                {[1, 2, 3].map(i => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full bg-muted overflow-hidden`}>
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
                        <Label>Your Skills</Label>
                        <div className="bg-background border rounded-md p-2 focus-within:ring-2 focus-within:ring-ring ring-offset-background flex flex-wrap gap-2 min-h-[42px] transition-all">
                            {skills.map(skill => (
                                <span key={skill} className="bg-primary/10 text-primary border border-primary/20 text-xs px-2 py-1 rounded-md flex items-center gap-1 font-medium animate-in zoom-in duration-200">
                                    {skill}
                                    <button type="button" onClick={() => removeSkill(skill)} className="hover:text-primary/70 transition-colors">×</button>
                                </span>
                            ))}
                            <input
                                className="bg-transparent border-none outline-none text-sm flex-1 min-w-[120px] placeholder:text-muted-foreground"
                                placeholder={skills.length === 0 ? "Type a skill and press Enter" : ""}
                                value={currentSkill}
                                onChange={(e) => setCurrentSkill(e.target.value)}
                                onKeyDown={handleAddSkill}
                                autoFocus
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            E.g. React, Design, Marketing, 3D Modeling...
                        </p>
                    </div>
                </div>
            )}

            {step === 3 && (
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
                onClick={step === 3 ? handleSubmit : handleNext}
                className="w-full h-11 text-base font-medium shadow-sm transition-all hover:translate-y-[-1px]"
                disabled={isSubmitting}
            >
                {isSubmitting ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Setting up...
                    </>
                ) : (
                    step === 3 ? "Finish & Go to Workspace" : "Next"
                )}
            </Button>
        </div>
    )
}




