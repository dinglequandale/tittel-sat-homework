import pkg from 'node-tikzjax'
import type { Figure, RenderedFigure } from '../shared/format.ts'

// node-tikzjax ships CJS: the high-level wrapper is `exports.default`, which in
// Node ESM lands at `.default`. (The named `tex` export is a lower-level
// primitive that expects a pre-loaded engine — not what we want here.)
type Tex2Svg = (source: string, options?: Record<string, unknown>) => Promise<string>
const tex2svg: Tex2Svg = (pkg as { default?: Tex2Svg }).default ?? (pkg as unknown as Tex2Svg)

/** Render one figure's LaTeX body to a standalone SVG string. */
export async function renderFigureSvg(fig: Figure): Promise<string> {
  const source = `\\begin{document}\n${fig.latex}\n\\end{document}`
  const options: Record<string, unknown> = { showConsole: false }
  if (fig.packages?.length) {
    options.texPackages = Object.fromEntries(fig.packages.map((p) => [p, '']))
  }
  if (fig.libraries?.length) {
    options.tikzLibraries = fig.libraries.join(',')
  }
  const svg = await tex2svg(source, options)
  if (!svg || !svg.trimStart().startsWith('<svg')) {
    throw new Error(`figure "${fig.id}" produced no SVG`)
  }
  return svg
}

/**
 * Render every figure to an ordered array (authoring order preserved so the
 * runner can stack diagrams above the stem). Renders SERIALLY — node-tikzjax
 * must not run concurrently — and de-dups identical LaTeX so a repeated diagram
 * compiles only once.
 */
export async function renderFigures(figures: Figure[] = []): Promise<RenderedFigure[]> {
  const out: RenderedFigure[] = []
  const cache = new Map<string, string>()
  for (const fig of figures) {
    const key = JSON.stringify([fig.latex, fig.packages ?? null, fig.libraries ?? null])
    let svg = cache.get(key)
    if (svg === undefined) {
      svg = await renderFigureSvg(fig)
      cache.set(key, svg)
    }
    out.push({ id: fig.id, label: fig.label, svg })
  }
  return out
}
