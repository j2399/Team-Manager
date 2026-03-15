import prisma from "@/lib/prisma"

type JoinWorkspaceResult = {
    success?: true
    workspaceId?: string
    message?: string
    error?: string
}

export async function joinWorkspaceByCode({
    userId,
    userName,
    code,
}: {
    userId: string
    userName: string
    code: string
}): Promise<JoinWorkspaceResult> {
    const trimmed = code.trim()
    if (!trimmed) return { error: "Invite code is required" }

    return prisma.$transaction(async (tx) => {
        const workspaceByCode = await tx.workspace.findFirst({
            where: {
                OR: [{ inviteCode: trimmed }, { inviteCode: trimmed.toUpperCase() }],
            },
            select: { id: true, name: true },
        })

        let workspace = workspaceByCode
        let membershipRole = "Member"

        if (!workspace) {
            const invite = await tx.invite.findUnique({
                where: { token: trimmed },
                select: {
                    id: true,
                    role: true,
                    uses: true,
                    maxUses: true,
                    expiresAt: true,
                    workspaceId: true,
                    workspace: {
                        select: { id: true, name: true }
                    }
                },
            })

            if (invite) {
                if (!invite.workspaceId || !invite.workspace) {
                    return { error: "This invite is no longer attached to a workspace" }
                }

                if (
                    (invite.maxUses > 0 && invite.uses >= invite.maxUses) ||
                    (invite.expiresAt && new Date() > invite.expiresAt)
                ) {
                    return { error: "This invite code has expired or reached maximum uses" }
                }

                await tx.invite.update({
                    where: { id: invite.id },
                    data: { uses: { increment: 1 } },
                })

                workspace = invite.workspace
                membershipRole = invite.role || "Member"
            }
        }

        if (!workspace) {
            return { error: "Invalid invite code" }
        }

        const existingMember = await tx.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId, workspaceId: workspace.id } },
        })

        if (!existingMember) {
            await tx.workspaceMember.create({
                data: {
                    userId,
                    workspaceId: workspace.id,
                    role: membershipRole,
                    name: userName,
                },
            })

            await tx.notification.create({
                data: {
                    workspaceId: workspace.id,
                    userId: null,
                    type: "member_joined",
                    title: "New member joined",
                    message: `${userName} has joined the workspace.`,
                    link: "/dashboard/members",
                },
            })
        }

        await tx.user.update({
            where: { id: userId },
            data: {
                workspaceId: workspace.id,
            },
        })

        return {
            success: true,
            workspaceId: workspace.id,
            message: existingMember
                ? `Welcome back! You are already a member of ${workspace.name}.`
                : undefined,
        }
    })
}
