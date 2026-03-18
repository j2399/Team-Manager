import assert from 'node:assert/strict'
import test from 'node:test'
import { appUrl, getAppBaseUrl, resolveAppBaseUrl } from '@/lib/appUrl'

const ORIGINAL_ENV = { ...process.env }

function withEnv(overrides: Record<string, string | undefined>, run: () => void) {
    const previous = { ...process.env }

    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) {
            delete process.env[key]
        } else {
            process.env[key] = value
        }
    }

    try {
        run()
    } finally {
        process.env = { ...previous }
    }
}

test.after(() => {
    process.env = { ...ORIGINAL_ENV }
})

const baseUrlCases = [
    {
        name: 'uses NEXT_PUBLIC_APP_URL when present',
        env: { NEXT_PUBLIC_APP_URL: 'https://cupi.app/', APP_URL: undefined, VERCEL_URL: undefined, NODE_ENV: 'production' },
        expected: 'https://cupi.app',
    },
    {
        name: 'falls back to APP_URL',
        env: { NEXT_PUBLIC_APP_URL: undefined, APP_URL: 'https://internal.cupi.app///', VERCEL_URL: undefined, NODE_ENV: 'production' },
        expected: 'https://internal.cupi.app',
    },
    {
        name: 'uses VERCEL_URL when explicit urls are missing',
        env: { NEXT_PUBLIC_APP_URL: undefined, APP_URL: undefined, VERCEL_URL: 'preview-cupi.vercel.app/', NODE_ENV: 'production' },
        expected: 'https://preview-cupi.vercel.app',
    },
    {
        name: 'returns localhost in development',
        env: { NEXT_PUBLIC_APP_URL: undefined, APP_URL: undefined, VERCEL_URL: undefined, NODE_ENV: 'development' },
        expected: 'http://localhost:3000',
    },
    {
        name: 'returns empty base in production without config',
        env: { NEXT_PUBLIC_APP_URL: undefined, APP_URL: undefined, VERCEL_URL: undefined, NODE_ENV: 'production' },
        expected: '',
    },
    {
        name: 'strips repeated slashes from explicit url',
        env: { NEXT_PUBLIC_APP_URL: 'https://example.com////', APP_URL: undefined, VERCEL_URL: undefined, NODE_ENV: 'production' },
        expected: 'https://example.com',
    },
]

for (const testCase of baseUrlCases) {
    test(testCase.name, () => {
        withEnv(testCase.env, () => {
            assert.equal(getAppBaseUrl(), testCase.expected)
        })
    })
}

const appUrlCases = [
    { name: 'joins absolute base with leading slash path', path: '/dashboard', base: 'https://cupi.app', expected: 'https://cupi.app/dashboard' },
    { name: 'adds slash for relative path', path: 'dashboard', base: 'https://cupi.app', expected: 'https://cupi.app/dashboard' },
    { name: 'handles nested paths', path: '/dashboard/settings', base: 'https://cupi.app', expected: 'https://cupi.app/dashboard/settings' },
    { name: 'returns relative path when no base exists', path: '/dashboard', base: '', expected: '/dashboard' },
    { name: 'returns relative path for plain segment when no base exists', path: 'invite/ABC123', base: '', expected: '/invite/ABC123' },
    { name: 'preserves query strings', path: '/dashboard?tab=general', base: 'https://cupi.app', expected: 'https://cupi.app/dashboard?tab=general' },
    { name: 'preserves hashes', path: '/dashboard#tasks', base: 'https://cupi.app', expected: 'https://cupi.app/dashboard#tasks' },
    { name: 'uses localhost fallback in development for relative paths', path: '/setup', base: 'http://localhost:3000', expected: 'http://localhost:3000/setup' },
]

for (const testCase of appUrlCases) {
    test(testCase.name, () => {
        withEnv(
            {
                NEXT_PUBLIC_APP_URL: testCase.base || undefined,
                APP_URL: undefined,
                VERCEL_URL: undefined,
                NODE_ENV: testCase.base ? 'production' : 'production',
            },
            () => {
                assert.equal(appUrl(testCase.path), testCase.expected)
            }
        )
    })
}

test('resolveAppBaseUrl prefers configured base over request origin', () => {
    withEnv(
        {
            NEXT_PUBLIC_APP_URL: 'https://cupi.app',
            APP_URL: undefined,
            VERCEL_URL: undefined,
            NODE_ENV: 'production',
        },
        () => {
            assert.equal(
                resolveAppBaseUrl('https://preview-cupi.vercel.app/invite/ABC123'),
                'https://cupi.app'
            )
        }
    )
})

test('resolveAppBaseUrl falls back to request origin when no configured base exists', () => {
    withEnv(
        {
            NEXT_PUBLIC_APP_URL: undefined,
            APP_URL: undefined,
            VERCEL_URL: undefined,
            NODE_ENV: 'production',
        },
        () => {
            assert.equal(
                resolveAppBaseUrl('https://preview-cupi.vercel.app/invite/ABC123'),
                'https://preview-cupi.vercel.app'
            )
        }
    )
})
