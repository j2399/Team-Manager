import prisma from "@/lib/prisma"
import { getErrorCode } from "@/lib/errors"

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const MAX_RETRIES = 10

export function generateWorkspaceInviteCode(random: () => number = Math.random) {
    let result = ''
    for (let index = 0; index < 6; index += 1) {
        result += ALPHABET.charAt(Math.floor(random() * ALPHABET.length))
    }
    return result
}

export async function createWorkspaceForUser({
    userId,
    userName,
    workspaceName,
}: {
    userId: string
    userName: string
    workspaceName: string
}) {
    const trimmedName = workspaceName.trim()
    if (!trimmedName) {
        throw new Error("Workspace name is required")
    }

    let attempt = 0
    while (attempt < MAX_RETRIES) {
        const inviteCode = generateWorkspaceInviteCode()

        try {
            return await prisma.$transaction(async (tx) => {
                const workspace = await tx.workspace.create({
                    data: {
                        name: trimmedName,
                        inviteCode,
                        ownerId: userId,
                    },
                })

                await tx.workspaceMember.create({
                    data: {
                        userId,
                        workspaceId: workspace.id,
                        role: 'Admin',
                        name: userName,
                    },
                })

                await tx.user.update({
                    where: { id: userId },
                    data: { workspaceId: workspace.id },
                })

                return workspace
            })
        } catch (error) {
            if (getErrorCode(error) === 'P2002') {
                attempt += 1
                continue
            }

            throw error
        }
    }

    throw new Error('Failed to create workspace. Could not generate unique code.')
}
