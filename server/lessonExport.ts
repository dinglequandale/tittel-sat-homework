// Build a lesson-plan review section from selected homework problems.
// Output matches the whiteboard's lesson schema (LessonDoc) so it drops
// straight into the tutor's next lesson as a "Homework Review" page:
//   client/src/lesson/schema.ts -> { title, pages: [{ label, blocks: [...] }] }
// Each block is { type:'latex'|'text'|'image', content?|src?, kind, spacingAfter, maxWidth }.

import type { Choice } from '../shared/format.ts'

interface ProblemForExport {
  ordinal: number
  type: 'mc' | 'grid'
  stem: string
  choices: Choice[]
  figures: Record<string, string> // figId -> svg
  explanation?: string | null
}

const FIG_REF = /!\[([^\]]+)\]/g
const WORKSPACE = 320 // px gap left under the last block of a problem (rework space)
const TIGHT = 16 // px gap between a problem's own sub-blocks
const MAX_WIDTH = 720

interface Block {
  type: 'latex' | 'text' | 'image'
  content?: string
  src?: string
  kind: 'heading' | 'body'
  spacingAfter: number
  maxWidth: number
}

function stripFigRefs(text: string): { text: string; refs: string[] } {
  const refs: string[] = []
  const out = text.replace(FIG_REF, (_m, id: string) => {
    refs.push(id)
    return ''
  })
  return { text: out.replace(/\s{2,}/g, ' ').trim(), refs }
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
}

export function buildLessonReview(problems: ProblemForExport[], title = 'Homework Review') {
  const blocks: Block[] = []

  problems.forEach((p, idx) => {
    const segments: Block[] = []

    segments.push({
      type: 'latex',
      kind: 'heading',
      content: `Problem ${idx + 1}`,
      spacingAfter: TIGHT,
      maxWidth: MAX_WIDTH,
    })

    const { text, refs } = stripFigRefs(p.stem)
    segments.push({ type: 'latex', kind: 'body', content: text, spacingAfter: TIGHT, maxWidth: MAX_WIDTH })

    for (const figId of refs) {
      const svg = p.figures?.[figId]
      if (svg) segments.push({ type: 'image', kind: 'body', src: svgDataUri(svg), spacingAfter: TIGHT, maxWidth: MAX_WIDTH })
    }

    if (p.type === 'mc' && p.choices?.length) {
      const lines = p.choices
        .map((c) => `(${c.id})\\quad ${stripFigRefs(c.content).text}`)
        .join(' \\\\ ')
      segments.push({ type: 'latex', kind: 'body', content: lines, spacingAfter: TIGHT, maxWidth: MAX_WIDTH })
    }

    // The last block of each problem carries the big workspace gap.
    segments[segments.length - 1].spacingAfter = WORKSPACE
    blocks.push(...segments)
  })

  return {
    title,
    pages: [{ label: 'Homework Review', blocks }],
  }
}
