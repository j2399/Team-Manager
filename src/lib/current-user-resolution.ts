export type CurrentUserRole = "Admin" | "Team Lead" | "Member"

export function resolveCurrentUserRole(
    workspaceId: string | null,
    membershipRole: string | null,
    fallbackRole: string
): CurrentUserRole {
    if (!workspaceId) {
        return fallbackRole === "Admin" || fallbackRole === "Team Lead" ? fallbackRole : "Member"
    }

    return membershipRole === "Admin" || membershipRole === "Team Lead" ? membershipRole : "Member"
}

export function resolveCurrentUserDisplayName(
    membershipName: string | null | undefined,
    dbUserName: string
) {
    const trimmedMembershipName = membershipName?.trim()
    return trimmedMembershipName || dbUserName
}
