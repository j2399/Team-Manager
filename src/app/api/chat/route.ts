
import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(request: Request) {
    try {
        const user = await getCurrentUser()
        if (!user || !user.workspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const rawLimit = parseInt(searchParams.get('limit') || '50')
        const limit = Math.min(Math.max(1, rawLimit), 200) // Clamp between 1 and 200
        const since = searchParams.get('since') // ISO timestamp for incremental updates

        const where: Prisma.GeneralChatMessageWhereInput = {
            workspaceId: user.workspaceId
        }

        // If 'since' is provided, only fetch messages newer than that timestamp
        if (since) {
            where.createdAt = { gt: new Date(since) }
        }

        const messages = await prisma.generalChatMessage.findMany({
            where,
            take: limit,
            orderBy: {
                createdAt: 'desc'
            },
            include: {
                author: {
                    select: {
                        id: true,
                        name: true,
                        avatar: true
                    }
                }
            }
        })

        return NextResponse.json(messages.reverse())
    } catch (error) {
        console.error('Failed to fetch chat messages:', error)
        return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser()
        if (!user || !user.workspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const body = await request.json()
        const { content, type } = body

        if (!content) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 })
        }

        const message = await prisma.generalChatMessage.create({
            data: {
                content,
                type: type || 'text',
                authorId: user.id,
                authorName: user.name || 'User',
                authorAvatar: user.avatar,
                workspaceId: user.workspaceId
            },
            include: {
                author: {
                    select: {
                        id: true,
                        name: true,
                        avatar: true
                    }
                }
            }
        })

        // -- Discord Integration Start --
        try {
            // Only proceed if there's a potential mention ('@')
            if (!content.includes('@')) return NextResponse.json(message)

            // Import dynamically to avoid circular deps if any (though static import is fine usually)
            const { sendDiscordNotification } = await import('@/lib/discord')

            // 1. Fetch workspace (for webhook) and members (for mentions)
            const workspace = await prisma.workspace.findUnique({
                where: { id: user.workspaceId },
                select: { discordChannelId: true }
            })

            const workspaceMembers = await prisma.user.findMany({
                where: {
                    memberships: { some: { workspaceId: user.workspaceId } },
                    discordId: { not: null }
                },
                select: { name: true, discordId: true }
            })

            // 2. Resolve mentions
            let discordContent = content
            let hasMentions = false

            // Sort by name length desc to avoid partial matches (e.g. matching "Rob" inside "Robert")
            const sortedMembers = workspaceMembers.sort((a, b) => b.name.length - a.name.length)

            for (const member of sortedMembers) {
                if (!member.discordId) continue

                const mentionString = `@${member.name}`
                if (discordContent.includes(mentionString)) {
                    // Replace all occurrences
                    // Note: String.replaceAll is standard in Node 15+
                    discordContent = discordContent.split(mentionString).join(`<@${member.discordId}>`)
                    hasMentions = true
                }
            }

            // Handle @everyone
            if (discordContent.includes('@everyone')) {
                // Discord webhook allows @everyone if configured, usually passes through
                hasMentions = true
            }

            // 3. Send to Discord
            const finalMessage = discordContent

            // Only send if it has mentions (User asked: "only bring chats to the discrod if they at somehting")
            if (hasMentions && workspace?.discordChannelId) {
                await sendDiscordNotification(
                    "",
                    [{
                        title: "💬 Chat Mention",
                        description: finalMessage,
                        color: 0x5865F2,
                        timestamp: new Date().toISOString(),
                    }],
                    workspace.discordChannelId
                )
            }

        } catch (discordErr) {
            console.error('Failed to send Discord notification for chat:', discordErr)
            // Don't fail the request if Discord fails
        }
        // -- Discord Integration End --

        return NextResponse.json(message)
    } catch (error) {
        console.error('Failed to send message:', error)
        return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
    }
}
