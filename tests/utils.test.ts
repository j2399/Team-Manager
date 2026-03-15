import assert from 'node:assert/strict'
import test from 'node:test'
import { cn, getInitials } from '@/lib/utils'

const initialsCases = [
    ['Andre Boufama', 'AB'],
    ['cupi', 'CU'],
    ['A', 'A'],
    ['  Jane   Doe  ', 'JD'],
    ['Jean Luc Picard', 'JP'],
    ['mary ann smith', 'MS'],
    ['Q', 'Q'],
    ['', '?'],
    [null, '?'],
    [undefined, '?'],
]

for (const [name, expected] of initialsCases) {
    test(`getInitials(${String(name)}) -> ${expected}`, () => {
        assert.equal(getInitials(name as string | null | undefined), expected)
    })
}

const cnCases = [
    [['px-2', 'py-4'], 'px-2 py-4'],
    [['px-2', false, 'py-4'], 'px-2 py-4'],
    [['px-2', { hidden: false, block: true }], 'px-2 block'],
    [['px-2', 'px-4'], 'px-4'],
    [['rounded', ['bg-red-500', 'text-white']], 'rounded bg-red-500 text-white'],
]

for (const [input, expected] of cnCases) {
    test(`cn(${JSON.stringify(input)})`, () => {
        assert.equal(cn(...(input as Parameters<typeof cn>)), expected)
    })
}
