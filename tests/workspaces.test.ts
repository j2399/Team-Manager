import assert from 'node:assert/strict'
import test from 'node:test'
import { generateWorkspaceInviteCode } from '@/lib/workspaces'

const ALLOWED_CHARACTERS = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/

for (let index = 0; index < 300; index += 1) {
    test(`generateWorkspaceInviteCode produces a six-character safe code #${index + 1}`, () => {
        const code = generateWorkspaceInviteCode()
        assert.match(code, ALLOWED_CHARACTERS)
        assert.equal(code.length, 6)
    })
}

test('generateWorkspaceInviteCode can be deterministic with a custom random source', () => {
    let calls = 0
    const code = generateWorkspaceInviteCode(() => {
        calls += 1
        return 0
    })

    assert.equal(code, 'AAAAAA')
    assert.equal(calls, 6)
})
