"use client"

import * as React from "react"
import { Send, Smile, Loader2, ChevronDown, AtSign } from "lucide-react"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
// GIPHY SDK
import { GiphyFetch } from '@giphy/js-fetch-api'
import { Grid } from '@giphy/react-components'

const giphyFetch = new GiphyFetch(process.env.NEXT_PUBLIC_GIPHY_API_KEY || "dc6zaTOxFJmzC")

type Message = {
    id: string
    content: string
    type: string // "text" | "gif"
    authorId: string
    authorName: string
    authorAvatar: string | null
    createdAt: string
    author?: {
        name: string
        avatar: string | null
    }
}

type User = {
    id: string
    name: string
    avatar: string | null
}

export function GeneralChat({ isExpanded, onToggleExpand }: { isExpanded?: boolean; onToggleExpand?: () => void }) {
    const { toast } = useToast()
    const [messages, setMessages] = React.useState<Message[]>([])
    const [inputValue, setInputValue] = React.useState("")
    const [currentUser, setCurrentUser] = React.useState<{ id: string, name: string, avatar: string | null } | null>(null)
    const scrollRef = React.useRef<HTMLDivElement>(null)
    const [giphyOpen, setGiphyOpen] = React.useState(false)
    const [searchTerm, setSearchTerm] = React.useState("")
    const [members, setMembers] = React.useState<User[]>([])
    const hasInitialScrolled = React.useRef(false)

    // Scroll state
    const [showScrollButton, setShowScrollButton] = React.useState(false)
    const [isAtBottom, setIsAtBottom] = React.useState(true) // Track if user is at bottom

    // Mention state
    const [mentionQuery, setMentionQuery] = React.useState<string | null>(null)
    const [mentionIndex, setMentionIndex] = React.useState<number>(-1)
    const [mentionsOpen, setMentionsOpen] = React.useState(false)
    const [selectedMentionIndex, setSelectedMentionIndex] = React.useState(0)

    // Derived mentions list
    const mentions = React.useMemo(() => {
        if (!currentUser) return []
        return messages.filter(m =>
            m.content.includes(`@${currentUser.name}`) ||
            m.content.includes("@everyone")
        ).reverse() // Newest first
    }, [messages, currentUser])

    const scrollToMessage = (messageId: string) => {
        setMentionsOpen(false)
        // Wait for popover to close to avoid focus fighting
        setTimeout(() => {
            const element = document.getElementById(`msg-${messageId}`)
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' })
                element.classList.add('bg-primary/10')
                setTimeout(() => {
                    element.classList.remove('bg-primary/10')
                }, 2000)
            }
        }, 100)
    }

    // Retrieve user identity
    React.useEffect(() => {
        fetch('/api/auth/role')
            .then(res => res.json())
            .then(data => setCurrentUser(data))
            .catch(console.error)
    }, [])

    const fetchMembers = React.useCallback(async () => {
        try {
            // Fetch all users for mentions
            const res = await fetch('/api/users')
            if (res.ok) {
                const data = await res.json()
                if (Array.isArray(data)) {
                    setMembers(prev => {
                        if (JSON.stringify(prev) !== JSON.stringify(data)) {
                            return data
                        }
                        return prev
                    })
                }
            }
        } catch (error) {
            console.error(error)
        }
    }, [])

    // Initial fetch
    React.useEffect(() => {
        fetchMembers()
    }, [fetchMembers])

    // Poll for members (30 seconds - members rarely change)
    React.useEffect(() => {
        const interval = setInterval(fetchMembers, 30000)
        return () => clearInterval(interval)
    }, [fetchMembers])

    // Track last message timestamp for incremental updates
    const lastMessageTime = React.useRef<string | null>(null)
    const isTabVisible = React.useRef(true)

    // Initial full fetch
    const fetchAllMessages = React.useCallback(async () => {
        try {
            const res = await fetch('/api/chat?limit=50')
            if (res.ok) {
                const data = await res.json()
                if (Array.isArray(data) && data.length > 0) {
                    setMessages(data)
                    lastMessageTime.current = data[data.length - 1]?.createdAt || null
                }
            }
        } catch (error) {
            console.error(error)
        }
    }, [])

    // Incremental fetch - only get new messages since last check
    const fetchNewMessages = React.useCallback(async () => {
        // Skip if tab is hidden or no previous messages
        if (!isTabVisible.current || !lastMessageTime.current) return

        try {
            const since = encodeURIComponent(lastMessageTime.current)
            const res = await fetch(`/api/chat?limit=50&since=${since}`)
            if (res.ok) {
                const newMsgs = await res.json()
                if (Array.isArray(newMsgs) && newMsgs.length > 0) {
                    setMessages(prev => {
                        // Get existing message IDs for deduplication
                        const existingIds = new Set(prev.map(m => m.id))
                        // Filter out any messages we already have (prevents duplicates from race conditions)
                        const trulyNewMsgs = newMsgs.filter((m: Message) => !existingIds.has(m.id))

                        if (trulyNewMsgs.length === 0) return prev

                        // Append new messages
                        const updated = [...prev, ...trulyNewMsgs]
                        // Keep only last 50 to prevent memory bloat
                        const trimmed = updated.slice(-50)
                        lastMessageTime.current = trimmed[trimmed.length - 1]?.createdAt || null

                        // Show toast for mentions (only for truly new messages)
                        trulyNewMsgs.forEach((m: Message) => {
                            if (m.authorId !== currentUser?.id) {
                                if (m.content.includes("@everyone") || (currentUser?.name && m.content.includes(`@${currentUser.name}`))) {
                                    toast({
                                        title: `New mention from ${m.author?.name || m.authorName}`,
                                        description: m.content,
                                    })
                                }
                            }
                        })

                        return trimmed
                    })
                }
            }
        } catch (error) {
            console.error(error)
        }
    }, [currentUser, toast])

    // Track tab visibility to pause polling when hidden
    React.useEffect(() => {
        const handleVisibility = () => {
            isTabVisible.current = document.visibilityState === 'visible'
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [])

    // Initial fetch when component mounts
    React.useEffect(() => {
        fetchAllMessages()
    }, [fetchAllMessages])

    // Smart polling: 1 second when expanded + visible, stopped otherwise
    React.useEffect(() => {
        if (!isExpanded) return // Don't poll when collapsed

        const interval = setInterval(() => {
            if (isTabVisible.current) {
                fetchNewMessages()
            }
        }, 1000)

        return () => clearInterval(interval)
    }, [isExpanded, fetchNewMessages])

    const scrollToBottom = React.useCallback((smooth = true) => {
        const viewport = scrollRef.current
        if (viewport) {
            // Force scroll to huge number to ensure bottom
            viewport.scrollTo({ top: viewport.scrollHeight + 10000, behavior: smooth ? 'smooth' : 'auto' })
        }
    }, [])

    // Handle auto-scroll and initial scroll
    React.useEffect(() => {
        // If we have messages and haven't scrolled yet, force it.
        if (!hasInitialScrolled.current && messages.length > 0) {
            // Immediate scroll
            scrollToBottom(false)

            // Second attempt after short delay to account for layout shifts/rendering
            setTimeout(() => {
                scrollToBottom(false)
                hasInitialScrolled.current = true
            }, 100)
        } else if (isAtBottom && hasInitialScrolled.current) {
            // Normal auto-scroll for new messages
            setTimeout(() => scrollToBottom(true), 50)
        }
    }, [messages, isAtBottom, scrollToBottom])

    // Scroll listener
    React.useEffect(() => {
        const viewport = scrollRef.current
        if (!viewport) return
        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = viewport
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight
            const atBottom = distanceFromBottom < 100 // increased threshold
            setIsAtBottom(atBottom)
            setShowScrollButton(!atBottom)
        }
        viewport.addEventListener('scroll', handleScroll)
        return () => viewport.removeEventListener('scroll', handleScroll)
    }, [])

    const sendMessage = async (content: string, type: "text" | "gif" = "text") => {
        if (!content.trim()) return

        // Optimistic update
        const tempId = `temp-${Date.now()}`
        const optimisticMsg: Message = {
            id: tempId,
            content,
            type,
            authorId: currentUser?.id || "temp",
            authorName: currentUser?.name || "Me",
            authorAvatar: currentUser?.avatar || null,
            createdAt: new Date().toISOString(),
            author: {
                name: currentUser?.name || "Me",
                avatar: currentUser?.avatar || null
            }
        }

        setMessages(prev => [...prev, optimisticMsg])
        setInputValue("")
        setGiphyOpen(false)
        setIsAtBottom(true) // Force scroll on send
        // Reset mentions
        setMentionQuery(null)

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, type })
            })
            if (res.ok) {
                const newMsg = await res.json()
                // Replace optimistic message with real one from server
                setMessages(prev => prev.map(msg => msg.id === tempId ? newMsg : msg))
                // Update lastMessageTime so polling doesn't re-add this message
                lastMessageTime.current = newMsg.createdAt
            }
        } catch (error) {
            console.error(error)
            // Remove optimistic message on error
            setMessages(prev => prev.filter(msg => msg.id !== tempId))
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (mentionQuery !== null && suggestions.length > 0) {
            if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedMentionIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1))
                return
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedMentionIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0))
                return
            }
            if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault()
                insertMention(suggestions[selectedMentionIndex].name)
                return
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage(inputValue, "text")
        }
    }

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setInputValue(val)

        // Simple mention detection: checks if last word starts with @
        const lastWord = val.split(' ').pop()
        if (lastWord && lastWord.startsWith('@')) {
            setMentionQuery(lastWord.slice(1)) // Remove @
            setMentionIndex(val.lastIndexOf('@'))
            setSelectedMentionIndex(0) // Reset selection
        } else {
            setMentionQuery(null)
        }
    }

    const insertMention = (name: string) => {
        if (mentionIndex === -1) return
        const before = inputValue.substring(0, mentionIndex)
        const newValue = `${before}@${name} `
        setInputValue(newValue)
        setMentionQuery(null)
    }

    // Check if we should group the message
    const shouldGroupMessage = (current: Message, previous: Message | undefined) => {
        if (!previous) return false
        if (current.authorId !== previous.authorId) return false

        const currentTime = new Date(current.createdAt).getTime()
        const prevTime = new Date(previous.createdAt).getTime()

        return (currentTime - prevTime) < 60000 // 1 minute window for grouping
    }

    const fetchGifs = (offset: number) => {
        if (searchTerm) return giphyFetch.search(searchTerm, { offset, limit: 10 })
        return giphyFetch.trending({ offset, limit: 10 })
    }

    // Member suggestions - Exclude everyone from dropdown
    const filteredMembers = members.filter(m => m.name.toLowerCase().includes(mentionQuery?.toLowerCase() || ""))
    const suggestions = mentionQuery !== null ? filteredMembers : []

    return (
        <div className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden relative">
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #e2e8f0;
                    border-radius: 4px;
                }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #1e293b;
                }
            `}</style>

            {/* Chat Header with Mentions */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-background/60 backdrop-blur-md z-10 shrink-0 h-14 absolute top-0 left-0 right-0">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">General Chat</span>
                    {onToggleExpand && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 ml-2 text-muted-foreground hover:text-foreground"
                            onClick={onToggleExpand}
                        >
                            <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded ? "" : "rotate-180")} />
                        </Button>
                    )}
                </div>

                <Popover open={mentionsOpen} onOpenChange={setMentionsOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 relative hover:bg-muted">
                            <AtSign className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                            {mentions.length > 0 && (
                                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="end">
                        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50">
                            <span className="font-semibold text-xs">Recent Mentions</span>
                            <span className="text-[10px] text-muted-foreground">{mentions.length} found</span>
                        </div>
                        <ScrollArea className="h-[300px]">
                            {mentions.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                                    <AtSign className="h-8 w-8 mb-2 opacity-20" />
                                    <span className="text-xs">No mentions found</span>
                                </div>
                            ) : (
                                <div className="flex flex-col">
                                    {mentions.map(msg => (
                                        <button
                                            key={`mention-${msg.id}`}
                                            className="flex flex-col gap-1 p-3 text-left hover:bg-muted/50 border-b last:border-0 transition-colors"
                                            onClick={() => scrollToMessage(msg.id)}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Avatar className="w-5 h-5">
                                                    <AvatarImage src={msg.author?.avatar || msg.authorAvatar || undefined} />
                                                    <AvatarFallback className="text-[8px]">{msg.author?.name?.[0] || msg.authorName[0]}</AvatarFallback>
                                                </Avatar>
                                                <span className="font-medium text-xs truncate">{msg.author?.name || msg.authorName}</span>
                                                <span className="text-[10px] text-muted-foreground ml-auto">
                                                    {new Date(msg.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground line-clamp-2 pl-7">
                                                {msg.content}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </PopoverContent>
                </Popover>
            </div>

            {/* Messages Area */}
            <ScrollAreaPrimitive.Root className="flex-1 bg-background px-1 h-0 relative overflow-hidden pt-14">
                <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit] overscroll-contain" ref={scrollRef as any}>
                    <div className="flex flex-col justify-end min-h-full py-2 pl-3 pr-4">
                        {messages.map((msg, i) => {
                            const previousMsg = messages[i - 1]
                            const isGrouped = shouldGroupMessage(msg, previousMsg)
                            const timeString = new Date(msg.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()
                            const isMentioned = currentUser && (msg.content.includes(`@${currentUser.name}`) || msg.content.includes("@everyone"))

                            const displayName = msg.author?.name || msg.authorName
                            const displayAvatar = msg.author?.avatar || msg.authorAvatar

                            return (
                                <div
                                    key={msg.id}
                                    id={`msg-${msg.id}`}
                                    className={cn(
                                        "px-2 py-0.5 group flex items-start gap-2 relative",
                                        !isGrouped && "mt-2",
                                        isMentioned && "bg-yellow-500/10 hover:bg-yellow-500/20"
                                    )}
                                >
                                    {isMentioned && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-yellow-500" />}
                                    {!isGrouped ? (
                                        <Avatar className="w-8 h-8 shrink-0 mt-0.5">
                                            <AvatarImage src={displayAvatar || undefined} />
                                            <AvatarFallback className="text-[10px]">
                                                {displayName[0]}
                                            </AvatarFallback>
                                        </Avatar>
                                    ) : (
                                        <div className="w-8 shrink-0" />
                                    )}

                                    <div className="flex flex-col min-w-0 flex-1">
                                        {!isGrouped && (
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-xs truncate">
                                                    {displayName}
                                                </span>
                                            </div>
                                        )}

                                        <div className={cn("text-xs leading-5 text-foreground/80 whitespace-pre-wrap break-words flex justify-between items-end gap-2 group/msg")}>
                                            <div className="flex-1 min-w-0">
                                                {msg.type === 'text' ? (
                                                    msg.content.split(/(@[\w\s]+)/g).map((part, idx) => {
                                                        // Check if this part is a valid mention
                                                        if (part.startsWith('@')) {
                                                            const name = part.slice(1).trim()
                                                            const isValidMember = members.some(m => m.name === name)
                                                            const isEveryone = name === 'everyone'

                                                            if (isValidMember || isEveryone) {
                                                                return <span key={idx} className="bg-blue-500/20 text-blue-500 rounded px-0.5 font-medium">{part}</span>
                                                            }
                                                        }

                                                        // Check for URLs
                                                        const urlRegex = /(https?:\/\/[^\s]+)/g
                                                        return part.split(urlRegex).map((subPart, subIdx) => {
                                                            if (subPart.match(urlRegex)) {
                                                                return (
                                                                    <a
                                                                        key={`${idx}-${subIdx}`}
                                                                        href={subPart}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-primary hover:underline break-all"
                                                                    >
                                                                        {subPart}
                                                                    </a>
                                                                )
                                                            }
                                                            return <span key={`${idx}-${subIdx}`}>{subPart}</span>
                                                        })
                                                    })
                                                ) : msg.type === 'gif' ? (
                                                    <div className="mt-1">
                                                        <img
                                                            src={msg.content}
                                                            alt="GIF"
                                                            className="rounded-md max-w-[200px] max-h-[150px] object-cover"
                                                            loading="lazy"
                                                        />
                                                    </div>
                                                ) : null}
                                            </div>
                                            {/* Timestamp on the right */}
                                            <span className="text-[10px] text-muted-foreground/40 shrink-0 select-none opacity-0 group-hover/msg:opacity-100 transition-opacity">
                                                {timeString}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </ScrollAreaPrimitive.Viewport>
                <ScrollBar className="left-0 w-1 bg-transparent border-0" />
                <ScrollAreaPrimitive.Corner />
            </ScrollAreaPrimitive.Root>

            {/* Scroll to bottom button */}
            {showScrollButton && (
                <Button
                    size="icon"
                    variant="secondary"
                    className="absolute bottom-16 right-4 h-8 w-8 rounded-full shadow-md z-10 opacity-90 hover:opacity-100 transition-opacity"
                    onClick={() => scrollToBottom()}
                >
                    <ChevronDown className="h-4 w-4" />
                </Button>
            )}

            {/* Input Area */}
            <div className="p-2 bg-background shrink-0 relative z-20 border-t">
                {/* Mention Popover */}
                {mentionQuery !== null && suggestions.length > 0 && (
                    <div className="absolute bottom-full left-2 mb-2 w-64 bg-popover border rounded-md shadow-lg overflow-hidden flex flex-col max-h-48 z-50">
                        <div className="text-[10px] text-muted-foreground p-2 uppercase font-semibold bg-muted/50">Members</div>
                        <div className="overflow-y-auto">
                            {suggestions.map((user, idx) => (
                                <button
                                    key={user.id}
                                    className={cn(
                                        "w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted transition-colors",
                                        idx === selectedMentionIndex && "bg-muted/50" // Highlight selected option
                                    )}
                                    onClick={() => insertMention(user.name)}
                                >
                                    {user.avatar ? (
                                        <img src={user.avatar} className="w-5 h-5 rounded-full" alt="" />
                                    ) : (
                                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] text-primary">
                                            {user.name[0]}
                                        </div>
                                    )}
                                    <span>{user.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="bg-muted/50 rounded-md flex items-center p-1.5 px-3 gap-2 border min-h-[2.5rem]">
                    <Popover open={giphyOpen} onOpenChange={setGiphyOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 rounded-sm text-muted-foreground hover:text-foreground p-0 self-center"
                            >
                                <span className="text-[10px] font-bold">GIF</span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[280px] p-0 border bg-popover shadow-lg" align="start" side="top">
                            <div className="p-2">
                                <Input
                                    placeholder="Search..."
                                    className="h-7 text-xs mb-2"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    autoFocus
                                />
                                <div className="h-[250px] overflow-y-auto custom-scrollbar">
                                    <Grid
                                        width={260}
                                        columns={2}
                                        fetchGifs={fetchGifs}
                                        key={searchTerm}
                                        onGifClick={(gif, e) => {
                                            e.preventDefault()
                                            sendMessage(gif.images.fixed_height.url, "gif")
                                        }}
                                        noLink={true}
                                        hideAttribution={true}
                                    />
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>

                    {/* Input Container with Highlight Overlay */}
                    <div className="relative flex-1 min-w-0 grid py-0.5">
                        {/* Backdrop (Highlighter) */}
                        <div className="col-start-1 row-start-1 pointer-events-none whitespace-pre-wrap break-words text-xs px-0 font-sans leading-5 invisible">
                            {inputValue + ' '}
                        </div>

                        {/* Visible Highlighter (Absolute) */}
                        <div className="col-start-1 row-start-1 pointer-events-none whitespace-pre-wrap break-words text-xs px-0 font-sans leading-5 text-foreground/80 z-0">
                            {inputValue.split(/(@\w+)/g).map((part, idx) => {
                                if (part.startsWith('@')) {
                                    const name = part.slice(1)
                                    const isValidMember = members.some(m => m.name === name)
                                    const isEveryone = name === 'everyone'
                                    if (isValidMember || isEveryone) {
                                        return <span key={idx} className="bg-blue-500/20 text-blue-500 rounded-sm px-0.5 -mx-0.5">{part}</span>
                                    }
                                }
                                return <span key={idx}>{part}</span>
                            })}
                        </div>

                        {/* Actual Input (Transparent Text) */}
                        <textarea
                            value={inputValue}
                            onChange={(e) => {
                                handleInput(e as any)
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder={inputValue ? "" : "Message..."}
                            className="col-start-1 row-start-1 w-full h-full resize-none overflow-hidden bg-transparent border-0 p-0 px-0 text-xs font-sans leading-5 text-transparent caret-foreground focus:outline-none focus:ring-0 placeholder:text-muted-foreground/30 z-10"
                            spellCheck={false}
                            rows={1}
                        />
                    </div>

                    {inputValue.trim() && (
                        <div
                            className="cursor-pointer text-primary hover:text-primary/80 transition-colors self-center"
                            onClick={() => sendMessage(inputValue, "text")}
                        >
                            <Send className="w-4 h-4 ml-auto" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
