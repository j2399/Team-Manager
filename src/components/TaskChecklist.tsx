"use client"

import { useState, useEffect, useRef } from "react"
import { useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import { Check, Plus, Trash2, Loader2 } from "lucide-react"
import { createChecklistItem, deleteChecklistItem, updateChecklistItem } from "@/app/actions/checklist"
import { cn } from "@/lib/utils"

type ChecklistItem = {
    id: string
    content: string
    completed: boolean
    completedBy: string | null
    order: number
}

type TaskChecklistProps = {
    taskId: string
    isEditable?: boolean
}

export function TaskChecklist({ taskId, isEditable = true }: TaskChecklistProps) {
    const liveItems = useQuery(api.tasks.getChecklistItems, taskId ? { taskId } : "skip")
    const [items, setItems] = useState<ChecklistItem[]>([])
    const [newItemContent, setNewItemContent] = useState("")
    const [isAdding, setIsAdding] = useState(false)
    const [updatingItems, setUpdatingItems] = useState<Set<string>>(new Set())
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (liveItems !== undefined) {
            setItems(liveItems as ChecklistItem[])
        }
    }, [liveItems])

    const addItem = async () => {
        if (!newItemContent.trim() || isAdding) return

        setIsAdding(true)
        try {
            const result = await createChecklistItem(taskId, newItemContent.trim())
            if (result?.success && result.item) {
                setItems(prev => [...prev, result.item as ChecklistItem])
                setNewItemContent("")
                inputRef.current?.focus()
            }
        } catch (error) {
            console.error('Failed to add checklist item:', error)
        } finally {
            setIsAdding(false)
        }
    }

    const toggleItem = async (item: ChecklistItem) => {
        if (updatingItems.has(item.id)) return

        setUpdatingItems(prev => new Set(prev).add(item.id))

        // Optimistic update
        setItems(prev => prev.map(i =>
            i.id === item.id ? { ...i, completed: !i.completed } : i
        ))

        try {
            const result = await updateChecklistItem(taskId, {
                itemId: item.id,
                completed: !item.completed,
            })

            if (result?.error) {
                // Revert on failure
                setItems(prev => prev.map(i =>
                    i.id === item.id ? { ...i, completed: item.completed } : i
                ))
            }
        } catch (error) {
            console.error('Failed to toggle checklist item:', error)
            // Revert on failure
            setItems(prev => prev.map(i =>
                i.id === item.id ? { ...i, completed: item.completed } : i
            ))
        } finally {
            setUpdatingItems(prev => {
                const next = new Set(prev)
                next.delete(item.id)
                return next
            })
        }
    }

    const deleteItem = async (itemId: string) => {
        if (updatingItems.has(itemId)) return

        setUpdatingItems(prev => new Set(prev).add(itemId))

        try {
            const result = await deleteChecklistItem(taskId, itemId)
            if (result?.success) {
                setItems(prev => prev.filter(i => i.id !== itemId))
            }
        } catch (error) {
            console.error('Failed to delete checklist item:', error)
        } finally {
            setUpdatingItems(prev => {
                const next = new Set(prev)
                next.delete(itemId)
                return next
            })
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            addItem()
        }
    }

    const completedCount = items.filter(i => i.completed).length
    const totalCount = items.length
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

    if (liveItems === undefined) {
        return (
            <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {/* Header + progress */}
            {totalCount > 0 && (
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-foreground">Checklist</span>
                    <div className="ml-auto flex items-center gap-2 min-w-0">
                        <div className="h-1.5 w-24 sm:w-28 bg-muted rounded-full overflow-hidden">
                            <div
                                className={cn(
                                    "h-full rounded-full transition-all duration-300",
                                    progress === 100 ? "bg-green-500" : "bg-primary"
                                )}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                            {completedCount}/{totalCount}
                        </span>
                    </div>
                </div>
            )}

            {/* Checklist items */}
            <div className="space-y-1">
                {items.map((item) => (
                    <div
                        key={item.id}
                        className={cn(
                            "group flex items-start gap-2 p-2 rounded-md transition-colors",
                            "hover:bg-muted/50",
                            item.completed && "opacity-60"
                        )}
                    >
                        <button
                            onClick={() => toggleItem(item)}
                            disabled={updatingItems.has(item.id)}
                            className={cn(
                                "shrink-0 w-4 h-4 mt-0.5 rounded border transition-colors flex items-center justify-center",
                                item.completed
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "border-border hover:border-primary"
                            )}
                        >
                            {updatingItems.has(item.id) ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            ) : item.completed ? (
                                <Check className="h-2.5 w-2.5" />
                            ) : null}
                        </button>

                        <span className={cn(
                            "flex-1 text-sm leading-tight",
                            item.completed && "line-through text-muted-foreground"
                        )}>
                            {item.content}
                        </span>

                        {isEditable && (
                            <button
                                onClick={() => deleteItem(item.id)}
                                disabled={updatingItems.has(item.id)}
                                className="shrink-0 opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded transition-opacity"
                            >
                                <Trash2 className="h-3 w-3 text-destructive" />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Add new item */}
            {isEditable && (
                <div className="flex items-center gap-2">
                    <div className="shrink-0 w-4 h-4 mt-0.5" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Add checklist item..."
                        value={newItemContent}
                        onChange={(e) => setNewItemContent(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 text-[11px] bg-transparent border-none outline-none placeholder:text-muted-foreground/50"
                    />
                    {newItemContent.trim() && (
                        <button
                            onClick={addItem}
                            disabled={isAdding}
                            className="shrink-0 p-1 hover:bg-primary/10 rounded transition-colors"
                        >
                            {isAdding ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            ) : (
                                <Plus className="h-3.5 w-3.5 text-primary" />
                            )}
                        </button>
                    )}
                </div>
            )}

            {/* Empty state */}
            {totalCount === 0 && !isEditable && (
                <p className="text-xs text-muted-foreground text-center py-2">
                    No checklist items
                </p>
            )}
        </div>
    )
}
