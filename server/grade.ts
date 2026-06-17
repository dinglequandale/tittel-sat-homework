// Server-side grading. Students never receive correct answers; grading happens
// here on submit (and on timer expiry).

/** Parse a grid-in answer to a number, accepting decimals and simple fractions. */
export function normalizeNumeric(raw: string): number | null {
  const s = raw.replace(/\s+/g, '')
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  if (/^-?\.\d+$/.test(s)) return Number(s)
  const frac = s.match(/^(-?\d+)\/(-?\d+)$/)
  if (frac) {
    const d = Number(frac[2])
    if (d !== 0) return Number(frac[1]) / d
  }
  return null
}

/** Multiple choice: exact match of the chosen choice id. */
export function gradeMc(correct: string | null | undefined, answer: string | null | undefined): boolean {
  return !!correct && !!answer && correct === answer
}

/**
 * Grid-in (student-produced response): correct if the answer matches any
 * accepted form, either as an exact trimmed string or as an equal number
 * (so "2.5" and "5/2" both match an accepted "5/2").
 */
export function gradeGrid(accepted: string[] | null | undefined, answer: string | null | undefined): boolean {
  if (!answer) return false
  const a = answer.trim()
  if (!a || !Array.isArray(accepted)) return false
  const an = normalizeNumeric(a)
  for (const acc of accepted) {
    if (a === acc.trim()) return true
    const accn = normalizeNumeric(acc)
    if (an !== null && accn !== null && Math.abs(an - accn) < 1e-9) return true
  }
  return false
}
