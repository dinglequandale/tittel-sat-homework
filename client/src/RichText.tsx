import { useMemo } from 'react'
import katex from 'katex'

// Renders a problem string: plain prose, inline `$math$` / display `$$math$$`
// (via KaTeX), and `![figId]` figure references (pre-rendered SVG passed in the
// `figures` map). The SVG is ours (generated at push time), so inlining it is safe.

type Part =
  | { t: 'text'; v: string }
  | { t: 'math'; v: string; display: boolean }
  | { t: 'fig'; v: string }

const TOKEN = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$|!\[([^\]]+)\]/g

function parse(text: string): Part[] {
  const parts: Part[] = []
  let last = 0
  for (const m of text.matchAll(TOKEN)) {
    const i = m.index ?? 0
    if (i > last) parts.push({ t: 'text', v: text.slice(last, i) })
    if (m[1] !== undefined) parts.push({ t: 'math', v: m[1], display: true })
    else if (m[2] !== undefined) parts.push({ t: 'math', v: m[2], display: false })
    else if (m[3] !== undefined) parts.push({ t: 'fig', v: m[3] })
    last = i + m[0].length
  }
  if (last < text.length) parts.push({ t: 'text', v: text.slice(last) })
  return parts
}

export function RichText({
  text,
  figures,
}: {
  text: string
  figures?: Record<string, string>
}) {
  const parts = useMemo(() => parse(text ?? ''), [text])
  return (
    <span className="rich">
      {parts.map((p, i) => {
        if (p.t === 'text') return <span key={i}>{p.v}</span>
        if (p.t === 'math') {
          const html = katex.renderToString(p.v, { displayMode: p.display, throwOnError: false })
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
        }
        const svg = figures?.[p.v]
        return svg ? (
          <span key={i} className="figure" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <span key={i} className="figure-missing">
            [figure: {p.v}]
          </span>
        )
      })}
    </span>
  )
}
