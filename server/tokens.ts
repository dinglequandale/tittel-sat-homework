import { customAlphabet } from 'nanoid'

// URL-safe, unambiguous (no 0/o/1/l) lowercase+digits. 24 chars ≈ 120 bits —
// unguessable, so a magic link is its own access control.
export const newToken = customAlphabet('23456789abcdefghijkmnpqrstuvwxyz', 24)
