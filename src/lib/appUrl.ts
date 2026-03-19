function stripTrailingSlashes(value: string) {
    return value.replace(/\/+$/, "")
}

function normalizeBaseUrlCandidate(value: string | undefined) {
    const trimmed = value?.trim()
    if (!trimmed) return ""
    if (/^https?:\/\//i.test(trimmed)) {
        return stripTrailingSlashes(trimmed)
    }
    return `https://${stripTrailingSlashes(trimmed)}`
}

export function getAppBaseUrl() {
    const explicit = normalizeBaseUrlCandidate(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL)
    if (explicit) return stripTrailingSlashes(explicit)

    const vercelProduction = normalizeBaseUrlCandidate(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    if (vercelProduction) return vercelProduction

    const vercel = normalizeBaseUrlCandidate(process.env.VERCEL_URL)
    if (vercel) return vercel

    if (process.env.NODE_ENV === "production") return ""
    return "http://localhost:3000"
}

export function resolveAppBaseUrl(requestUrl: string) {
    const base = getAppBaseUrl()
    if (base) return base
    return new URL(requestUrl).origin
}

export function appUrl(pathname: string) {
    const base = getAppBaseUrl()
    const path = pathname.startsWith("/") ? pathname : `/${pathname}`
    return base ? `${base}${path}` : path
}

export function getDiscordRedirectUri(requestUrl: string) {
    const explicit = normalizeBaseUrlCandidate(process.env.DISCORD_REDIRECT_URI)
    if (explicit) return explicit

    return new URL('/api/discord/callback', resolveAppBaseUrl(requestUrl)).toString()
}
