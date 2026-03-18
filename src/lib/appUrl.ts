function stripTrailingSlashes(value: string) {
    return value.replace(/\/+$/, "")
}

export function getAppBaseUrl() {
    const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
    if (explicit) return stripTrailingSlashes(explicit)

    const vercel = process.env.VERCEL_URL
    if (vercel) return `https://${stripTrailingSlashes(vercel)}`

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
