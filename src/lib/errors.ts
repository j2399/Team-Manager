export function getErrorCode(error: unknown): string | null {
    if (typeof error !== "object" || error === null || !("code" in error)) {
        return null
    }

    const code = (error as { code?: unknown }).code
    return typeof code === "string" ? code : null
}

export function getErrorMessage(error: unknown, fallback = "Unknown error") {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message
    }

    return fallback
}
