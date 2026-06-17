// Pure-logic tests that need no database. Run: npm test
import assert from 'node:assert/strict'
import { gradeMc, gradeGrid, normalizeNumeric } from '../server/grade.ts'
import { buildLessonReview } from '../server/lessonExport.ts'

// --- Multiple choice --------------------------------------------------------
assert.equal(gradeMc('B', 'B'), true)
assert.equal(gradeMc('B', 'A'), false)
assert.equal(gradeMc('B', null), false)
assert.equal(gradeMc(null, 'B'), false)

// --- Grid-in (equivalent forms) ---------------------------------------------
assert.equal(normalizeNumeric('5/2'), 2.5)
assert.equal(normalizeNumeric('.75'), 0.75)
assert.equal(gradeGrid(['2.5', '5/2'], '2.5'), true)
assert.equal(gradeGrid(['5/2'], '2.5'), true) // numeric equivalence
assert.equal(gradeGrid(['5/2'], '2.50'), true)
assert.equal(gradeGrid(['1'], '1.0'), true)
assert.equal(gradeGrid(['12.5'], ' 12.5 '), true) // trims
assert.equal(gradeGrid(['12.5'], ''), false)
assert.equal(gradeGrid(['12.5'], null), false)
assert.equal(gradeGrid(['2/3'], '0.6'), false) // not equal

// --- Lesson export ----------------------------------------------------------
const doc = buildLessonReview(
  [
    {
      ordinal: 1,
      type: 'mc',
      stem: 'In the figure ![f1], solve for $x$.',
      choices: [
        { id: 'A', content: '$1$' },
        { id: 'B', content: '$2$' },
      ],
      figures: [{ id: 'f1', label: 'Figure 1', svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }],
      explanation: null,
    },
  ],
  'Test Review',
)
assert.equal(doc.title, 'Test Review')
assert.equal(doc.pages.length, 1)
assert.equal(doc.pages[0].label, 'Homework Review')
const blocks = doc.pages[0].blocks
assert.ok(blocks.some((b) => b.kind === 'heading'), 'has a heading block')
assert.ok(
  blocks.some((b) => b.type === 'image' && (b.src ?? '').startsWith('data:image/svg+xml;base64,')),
  'figure became a data-URI image block',
)
assert.ok(blocks.some((b) => b.type === 'latex' && (b.content ?? '').includes('(A)')), 'choices block present')
assert.equal(blocks[blocks.length - 1].spacingAfter, 320, 'last block carries the workspace gap')
// figure ref is stripped from the stem text block
assert.ok(!blocks.some((b) => (b.content ?? '').includes('![f1]')), 'figure ref stripped from prose')

console.log('✓ all unit assertions passed')
