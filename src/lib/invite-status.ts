export type InviteStatus = "joined" | "already-member" | "invalid"

export type InviteNotice = {
    status: InviteStatus
    workspaceName?: string | null
}

type SearchParamValue = string | string[] | undefined
type SearchParamsLike = URLSearchParams | Record<string, SearchParamValue> | null | undefined

function firstValue(value: SearchParamValue) {
    return Array.isArray(value) ? value[0] : value
}

function getParam(searchParams: SearchParamsLike, key: string) {
    if (!searchParams) return undefined

    if (searchParams instanceof URLSearchParams) {
        return searchParams.get(key) ?? undefined
    }

    return firstValue(searchParams[key])
}

export function isInviteStatus(value: string | null | undefined): value is InviteStatus {
    return value === "joined" || value === "already-member" || value === "invalid"
}

export function readInviteNotice(searchParams: SearchParamsLike): InviteNotice | null {
    const status = getParam(searchParams, "inviteStatus")
    if (!isInviteStatus(status)) {
        return null
    }

    const workspaceName = getParam(searchParams, "inviteWorkspace")?.trim()

    return {
        status,
        workspaceName: workspaceName || null,
    }
}

export function appendInviteNotice(pathname: string, notice: InviteNotice | null | undefined) {
    if (!notice) return pathname

    const [pathWithQuery, hash = ""] = pathname.split("#", 2)
    const [pathOnly, rawQuery = ""] = pathWithQuery.split("?", 2)
    const searchParams = new URLSearchParams(rawQuery)

    searchParams.set("inviteStatus", notice.status)

    const workspaceName = notice.workspaceName?.trim()
    if (workspaceName) {
        searchParams.set("inviteWorkspace", workspaceName)
    } else {
        searchParams.delete("inviteWorkspace")
    }

    const query = searchParams.toString()
    const nextPath = query ? `${pathOnly}?${query}` : pathOnly
    return hash ? `${nextPath}#${hash}` : nextPath
}
