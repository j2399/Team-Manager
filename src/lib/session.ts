import crypto from 'crypto'
import prisma from './prisma'

export const SESSION_COOKIE_NAME = 'session_token'
export const SESSION_TTL_DAYS = 30
export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60

function hashSessionToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string) {
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashSessionToken(token)
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)

    await prisma.session.create({
        data: {
            userId,
            tokenHash,
            expiresAt
        }
    })

    return { token, expiresAt }
}

export async function getSession(token: string) {
    const tokenHash = hashSessionToken(token)
    const session = await prisma.session.findUnique({
        where: { tokenHash },
        include: {
            user: {
                include: {
                    workspace: true,
                    memberships: {
                        include: {
                            workspace: {
                                include: {
                                    _count: {
                                        select: {
                                            members: true,
                                            projects: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    })

    if (!session) return null

    if (session.expiresAt < new Date()) {
        await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
        return null
    }

    return session
}

export async function deleteSession(token: string) {
    const tokenHash = hashSessionToken(token)
    await prisma.session.delete({ where: { tokenHash } }).catch(() => {})
}
