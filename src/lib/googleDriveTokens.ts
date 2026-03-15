import crypto from "crypto"

const ENCRYPTED_PREFIX = "enc:gcm:"

function getEncryptionSecret() {
    const secret =
        process.env.GOOGLE_DRIVE_TOKEN_SECRET ||
        process.env.GOOGLE_CLIENT_SECRET ||
        process.env.DISCORD_CLIENT_SECRET

    if (!secret) {
        throw new Error("Missing token encryption secret")
    }

    return secret
}

function getKey() {
    return crypto.createHash("sha256").update(getEncryptionSecret()).digest()
}

export function encryptGoogleToken(value: string | null | undefined) {
    if (!value) return null
    if (value.startsWith(ENCRYPTED_PREFIX)) return value

    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv)
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
    const tag = cipher.getAuthTag()

    return `${ENCRYPTED_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`
}

export function decryptGoogleToken(value: string | null | undefined) {
    if (!value) return null
    if (!value.startsWith(ENCRYPTED_PREFIX)) return value

    const payload = value.slice(ENCRYPTED_PREFIX.length)
    const [ivPart, tagPart, encryptedPart] = payload.split(".")
    if (!ivPart || !tagPart || !encryptedPart) {
        throw new Error("Invalid encrypted token payload")
    }

    const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        getKey(),
        Buffer.from(ivPart, "base64url")
    )
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"))

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedPart, "base64url")),
        decipher.final(),
    ])

    return decrypted.toString("utf8")
}
