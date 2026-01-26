"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { RemoveScroll } from "react-remove-scroll"
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react"
import { WizardStepIndicator } from "./WizardStepIndicator"
import { TimelineEditor, type PushDraft, formatDateISO } from "@/features/timeline-editor"

type User = {
    id: string
    name: string
}

type CreateProjectWizardProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    leadCandidates: User[]
    allUsers: User[]
    onProjectCreated?: () => void
}

type ProjectData = {
    name: string
    description: string
    leadId: string
    memberIds: string[]
}

const STEPS = [
    { id: 'basic', label: 'Division Info' },
    { id: 'timeline', label: 'Plan Timeline' },
]

export function CreateProjectWizard({
    open,
    onOpenChange,
    leadCandidates,
    allUsers,
    onProjectCreated
}: CreateProjectWizardProps) {
    const router = useRouter()
    const dialogRef = useRef<HTMLDivElement>(null)
    const [currentStep, setCurrentStep] = useState(0)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Step 1: Basic project info
    const [projectData, setProjectData] = useState<ProjectData>({
        name: '',
        description: '',
        leadId: '',
        memberIds: []
    })

    // Step 2: Timeline pushes
    const [pushes, setPushes] = useState<PushDraft[]>([])

    // Reset when dialog opens
    useEffect(() => {
        if (open) {
            setCurrentStep(0)
            setProjectData({ name: '', description: '', leadId: '', memberIds: [] })
            setPushes([])
            setError(null)
        }
    }, [open])

    const toggleMember = (userId: string) => {
        setProjectData(prev => ({
            ...prev,
            memberIds: prev.memberIds.includes(userId)
                ? prev.memberIds.filter(id => id !== userId)
                : [...prev.memberIds, userId]
        }))
    }

    const isStep1Valid = projectData.name.trim() && projectData.leadId && projectData.leadId !== 'none'

    const handleNext = () => {
        if (currentStep === 0 && isStep1Valid) {
            setCurrentStep(1)
        }
    }

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1)
        }
    }

    const handleSubmit = async () => {
        if (!isStep1Valid) return

        setIsSubmitting(true)
        setError(null)

        try {
            // Create project with pushes
            const response = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: projectData.name.trim(),
                    description: projectData.description.trim() || undefined,
                    leadId: projectData.leadId,
                    memberIds: projectData.memberIds,
                    pushes: pushes.map(p => ({
                        tempId: p.tempId,
                        name: p.name,
                        startDate: formatDateISO(p.startDate),
                        endDate: p.endDate ? formatDateISO(p.endDate) : undefined,
                        color: p.color,
                        dependsOn: p.dependsOn
                    }))
                })
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to create project')
            }

            const project = await response.json()

            onOpenChange(false)
            onProjectCreated?.()
            router.push(`/dashboard/projects/${project.id}`)
            router.refresh()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred')
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleSkipTimeline = async () => {
        // Create project without pushes
        setPushes([])
        await handleSubmit()
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                ref={dialogRef}
                className={cn(
                    "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    currentStep === 0 ? "sm:max-w-md" : "sm:max-w-3xl"
                )}
            >
                <DialogHeader className="pb-2">
                    <DialogTitle className="text-xl font-semibold">Create New Division</DialogTitle>
                    <DialogDescription className="sr-only">
                        Create a new division with optional timeline planning
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 border-b">
                    <WizardStepIndicator
                        steps={STEPS}
                        currentStep={currentStep}
                        onStepClick={(step) => step < currentStep && setCurrentStep(step)}
                        isSubmitting={isSubmitting}
                    />
                </div>

                {/* Error message */}
                {error && (
                    <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                        {error}
                    </div>
                )}

                {/* Step content */}
                <div className="py-4 min-h-[300px]">
                    {/* Step 1: Basic Info */}
                    <div
                        className={cn(
                            "transition-all duration-300",
                            currentStep === 0 ? "opacity-100" : "opacity-0 absolute pointer-events-none"
                        )}
                    >
                        <div className="grid gap-4">
                            <div className="grid gap-1.5">
                                <Label htmlFor="wizard-name" className="text-sm font-medium">
                                    Division Name <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="wizard-name"
                                    value={projectData.name}
                                    onChange={(e) => setProjectData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Enter division name"
                                    className="h-10"
                                    autoComplete="off"
                                />
                            </div>

                            <div className="grid gap-1.5">
                                <Label htmlFor="wizard-description" className="text-sm font-medium">
                                    Description
                                </Label>
                                <Textarea
                                    id="wizard-description"
                                    value={projectData.description}
                                    onChange={(e) => setProjectData(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Brief description of the division"
                                    className="min-h-[80px] resize-none"
                                />
                            </div>

                            <div className="grid gap-1.5">
                                <Label className="text-sm font-medium">
                                    Division Lead <span className="text-red-500">*</span>
                                </Label>
                                <Select
                                    value={projectData.leadId}
                                    onValueChange={(value) => setProjectData(prev => ({ ...prev, leadId: value }))}
                                >
                                    <SelectTrigger className="h-10">
                                        <SelectValue placeholder="Select a lead" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {leadCandidates.map(user => (
                                            <SelectItem key={user.id} value={user.id}>
                                                {user.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-1.5">
                                <Label className="text-sm font-medium">Team Members</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="w-full justify-between h-10 font-normal"
                                        >
                                            <span className="truncate">
                                                {projectData.memberIds.length === 0
                                                    ? "Select team members..."
                                                    : `${projectData.memberIds.length} member${projectData.memberIds.length !== 1 ? 's' : ''} selected`}
                                            </span>
                                            <ChevronDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[280px] p-0" align="start">
                                        <RemoveScroll shards={[dialogRef]}>
                                            <div className="max-h-[240px] overflow-y-auto overscroll-contain p-1">
                                                {allUsers.map(user => {
                                                    const isLead = user.id === projectData.leadId
                                                    return (
                                                        <div
                                                            key={user.id}
                                                            className={cn(
                                                                "flex items-center space-x-2 px-2 py-2 rounded-sm",
                                                                isLead ? "opacity-50" : "hover:bg-accent cursor-pointer"
                                                            )}
                                                            onClick={() => !isLead && toggleMember(user.id)}
                                                        >
                                                            <Checkbox
                                                                checked={isLead || projectData.memberIds.includes(user.id)}
                                                                disabled={isLead}
                                                            />
                                                            <div className="text-sm flex-1">
                                                                {user.name}
                                                                {isLead && (
                                                                    <span className="text-xs text-muted-foreground ml-1">(Lead)</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </RemoveScroll>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    </div>

                    {/* Step 2: Timeline Planner */}
                    <div
                        className={cn(
                            "transition-all duration-300",
                            currentStep === 1 ? "opacity-100" : "opacity-0 absolute pointer-events-none"
                        )}
                    >
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Sparkles className="h-4 w-4 text-primary" />
                                <span>
                                    Drag to create projects. Click to edit. Hover for + to chain.
                                </span>
                            </div>

                            <TimelineEditor
                                pushes={pushes}
                                onPushesChange={setPushes}
                                minHeight={250}
                            />

                            {pushes.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    {pushes.length} project{pushes.length !== 1 ? 's' : ''} planned
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer with navigation */}
                <DialogFooter className="flex-row justify-between sm:justify-between gap-2 pt-4 border-t min-h-[52px]">
                    <div>
                        {currentStep > 0 && (
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={handleBack}
                                disabled={isSubmitting}
                            >
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                Back
                            </Button>
                        )}
                    </div>

                    <div className="flex gap-2">
                        {currentStep === 0 ? (
                            <Button
                                type="button"
                                onClick={handleNext}
                                disabled={!isStep1Valid}
                            >
                                Next
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        ) : (
                            <>
                                {pushes.length === 0 && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleSkipTimeline}
                                        disabled={isSubmitting}
                                    >
                                        Skip & Create
                                    </Button>
                                )}
                                <Button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={isSubmitting}
                                    className="min-w-[120px]"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Creating
                                        </>
                                    ) : (
                                        <>
                                            Create Division
                                        </>
                                    )}
                                </Button>
                            </>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
