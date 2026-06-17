// ---------------------------------------------------------------------------
// The authoring contract: the JSON shape you push into the app with the CLI.
// Kept deliberately generic (a dumb content container, like the lesson-plan
// schema) so the pedagogy is just content you pour in.
//
// Rendering split:
//   - `$...$` / `$$...$$` in any text  -> KaTeX, live in the browser (math only).
//   - `![figId]` references            -> a Figure, pre-rendered to SVG by the
//                                          push CLI using a REAL LaTeX toolchain
//                                          (full tikz/pgfplots/etc. support).
// ---------------------------------------------------------------------------

export type ProblemType = 'mc' | 'grid'

/** A multiple-choice option. `content` may contain $math$ and ![figId] refs. */
export interface Choice {
  id: string // 'A' | 'B' | 'C' | 'D' (author-chosen, any stable label)
  content: string
}

/** A diagram authored in full LaTeX; pre-rendered to SVG at push time. */
export interface Figure {
  id: string // referenced inline as ![id]
  latex: string // e.g. "\\begin{tikzpicture}...\\end{tikzpicture}"
  /** Optional caption shown under the figure (e.g. "Figure 1"). */
  label?: string
  /** Extra LaTeX packages this figure needs, e.g. ["pgfplots"]. */
  packages?: string[]
  /** Extra TikZ libraries, e.g. ["arrows.meta", "calc"]. */
  libraries?: string[]
}

/**
 * A figure after rendering, as stored on the problem and sent to the client.
 * Ordered (authoring order) so the runner can stack diagrams above the stem.
 */
export interface RenderedFigure {
  id: string
  label?: string
  svg: string
}

export interface AuthoredProblem {
  id: string
  type: ProblemType
  /** Prose with inline $math$ and ![figId] references. */
  stem: string
  /** Multiple-choice only. */
  choices?: Choice[]
  /** Multiple-choice only: the id of the correct choice. */
  correct?: string
  /** Grid-in only: accepted answers (equivalent forms), e.g. ["2.5", "5/2"]. */
  answers?: string[]
  /** Optional worked solution shown in review; may contain $math$ + ![figId]. */
  explanation?: string
  /** Diagrams referenced by the stem / choices / explanation. */
  figures?: Figure[]
}

export interface ProblemSet {
  /** Stable author-chosen slug; re-pushing the same id upserts in place. */
  id: string
  title: string
  problems: AuthoredProblem[]
}
