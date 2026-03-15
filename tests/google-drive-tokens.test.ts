import assert from 'node:assert/strict'
import test from 'node:test'
import { decryptGoogleToken, encryptGoogleToken } from '@/lib/googleDriveTokens'

const ORIGINAL_ENV = { ...process.env }

function withSecret(secret: string | undefined, run: () => void) {
    const previous = { ...process.env }

    if (secret === undefined) {
        delete process.env.GOOGLE_DRIVE_TOKEN_SECRET
    } else {
        process.env.GOOGLE_DRIVE_TOKEN_SECRET = secret
    }

    delete process.env.GOOGLE_CLIENT_SECRET
    delete process.env.DISCORD_CLIENT_SECRET

    try {
        run()
    } finally {
        process.env = { ...previous }
    }
}

test.after(() => {
    process.env = { ...ORIGINAL_ENV }
})

const tokenSamples = [
    'plain-token',
    'refresh-token-value',
    'ya29.long-google-access-token',
    'token.with.symbols._-~',
    'value with spaces',
    '1234567890',
    'uppercase-TOKEN',
    'emoji-safe-ascii-only',
]

for (const token of tokenSamples) {
    test(`round-trips encrypted token: ${token}`, () => {
        withSecret('test-secret', () => {
            const encrypted = encryptGoogleToken(token)
            assert.ok(encrypted)
            assert.notEqual(encrypted, token)
            assert.match(encrypted as string, /^enc:gcm:/)
            assert.equal(decryptGoogleToken(encrypted), token)
        })
    })
}

test('returns null for null or undefined input', () => {
    withSecret('test-secret', () => {
        assert.equal(encryptGoogleToken(null), null)
        assert.equal(encryptGoogleToken(undefined), null)
        assert.equal(decryptGoogleToken(null), null)
        assert.equal(decryptGoogleToken(undefined), null)
    })
})

test('preserves already encrypted values', () => {
    withSecret('test-secret', () => {
        const encrypted = encryptGoogleToken('secret-token')
        assert.equal(encryptGoogleToken(encrypted), encrypted)
    })
})

test('returns plaintext tokens unchanged when legacy values are stored', () => {
    withSecret('test-secret', () => {
        assert.equal(decryptGoogleToken('legacy-plaintext-token'), 'legacy-plaintext-token')
    })
})

test('throws for malformed encrypted payloads', () => {
    withSecret('test-secret', () => {
        assert.throws(() => decryptGoogleToken('enc:gcm:not.valid'))
    })
})

test('throws when no encryption secret is configured', () => {
    withSecret(undefined, () => {
        assert.throws(() => encryptGoogleToken('secret-token'))
    })
})
