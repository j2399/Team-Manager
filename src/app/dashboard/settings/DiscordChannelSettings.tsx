"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateDiscordChannel } from "@/app/actions/user-settings"
import { Loader2, Check, Pencil, X } from "lucide-react"

type DiscordChannelSettingsProps = {
    initialChannelId: string | null
    isAdmin: boolean
}

export function DiscordChannelSettings({ initialChannelId, isAdmin }: DiscordChannelSettingsProps) {
    const [isPending, startTransition] = useTransition()
    const [isEditing, setIsEditing] = useState(false)
    const [channelId, setChannelId] = useState(initialChannelId || '')
    const [savedChannelId, setSavedChannelId] = useState(initialChannelId || '')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    const handleSave = () => {
        setError(null)
        setSuccess(false)
        startTransition(async () => {
            const res = await updateDiscordChannel(channelId)
            if (res.error) {
                setError(res.error)
            } else {
                setSavedChannelId(channelId)
                setIsEditing(false)
                setSuccess(true)
                setTimeout(() => setSuccess(false), 2000)
            }
        })
    }

    const handleCancel = () => {
        setChannelId(savedChannelId)
        setIsEditing(false)
        setError(null)
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label className="text-sm">Discord Webhook URL</Label>
                {success && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                        <Check className="h-3 w-3" /> Saved
                    </span>
                )}
            </div>

            {isEditing && isAdmin ? (
                <div className="flex items-center gap-2">
                    <Input
                        value={channelId}
                        onChange={(e) => setChannelId(e.target.value)}
                        placeholder="https://discord.com/api/webhooks/..."
                        className="flex-1 font-mono text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave()
                            if (e.key === 'Escape') handleCancel()
                        }}
                    />
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-green-600 hover:text-green-700"
                        onClick={handleSave}
                        disabled={isPending}
                    >
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={handleCancel}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            ) : (
                <div className="flex items-center gap-2 max-w-full">
                    <div className="flex-1 bg-zinc-100 rounded px-3 py-2 min-w-0">
                        <code className="block text-sm font-mono truncate">
                            {savedChannelId || "Not set"}
                        </code>
                    </div>
                    {isAdmin && (
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0"
                            onClick={() => setIsEditing(true)}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
    )
}
