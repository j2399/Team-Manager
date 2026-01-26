"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

interface PushInfoProps {
    push?: {
        name: string
        startDate: Date
        endDate: Date | null
        project: { name: string }
        tasks: { status: string }[]
    } | null
}

export function PushInfo({ push }: PushInfoProps) {
    if (!push) {
        return (
            <Card className="h-full">
                <CardHeader>
                    <CardTitle className="text-base">Current Project</CardTitle>
                    <CardDescription>No active project found.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">No projects are currently active.</p>
                </CardContent>
            </Card>
        )
    }

    const totalTasks = push.tasks.length
    const completedTasks = push.tasks.filter(t => t.status === 'Done').length
    const progress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100)

    let daysText = 'Ongoing'
    if (push.endDate) {
        const daysLeft = Math.ceil((new Date(push.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        daysText = daysLeft > 0 ? `${daysLeft}` : 'Ended'
    }

    return (
        <Card className="h-full">
            <CardHeader className="pb-2">
                <CardTitle className="text-base">{push.name}</CardTitle>
                <CardDescription>{push.project.name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span className="text-muted-foreground">Tasks</span>
                        <p className="font-medium">{completedTasks}/{totalTasks}</p>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Days Left</span>
                        <p className="font-medium">{daysText}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
