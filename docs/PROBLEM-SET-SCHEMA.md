# SAT Homework — Problem Set JSON Schema

This document fully specifies the JSON format for a homework **problem set**. Paste
it into the project where you author content; anything that conforms here can be
ingested by the homework app (via the dashboard **Upload** button or the
`npm run push` CLI).

The deliverable is always **one `.json` file = one problem set.**

---

## 1. Top-level shape

```json
{
  "id": "alg-linear-1",
  "title": "Algebra — Linear Equations",
  "problems": [ /* one or more problem objects */ ]
}
```

| Field      | Type             | Rules |
|------------|------------------|-------|
| `id`       | string           | **Stable slug.** Lowercase letters, digits, hyphens. **No `:` character.** This is the set's identity — re-uploading the same `id` **updates the set in place** (keeps student results). A new `id` makes a new set. |
| `title`    | string           | Human-readable name shown in the dashboard and to students. |
| `problems` | array            | One or more problem objects, in the order students see them. |

---

## 2. Problem object

Every problem shares these fields:

| Field         | Type                | Rules |
|---------------|---------------------|-------|
| `id`          | string              | Unique **within the set**. No `:`. Stable (used to match on re-upload). |
| `type`        | `"mc"` \| `"grid"`  | Multiple choice, or student-produced ("grid-in") response. |
| `stem`        | string              | The question text. Plain prose with inline math in `$…$` (see §4). |
| `explanation` | string *(optional)* | Worked solution shown on the review screen. Same prose+math rules as `stem`. |
| `figures`     | array *(optional)*  | Diagrams, rendered above the problem (see §5). |

### Multiple choice (`type: "mc"`)

| Field     | Type   | Rules |
|-----------|--------|-------|
| `choices` | array  | ≥ 2 objects `{ "id": "A", "content": "…" }`. `id` is the label (A/B/C/D), unique. `content` is prose+math. |
| `correct` | string | The `id` of the correct choice. **Must match one of the `choices`.** |

### Grid-in (`type: "grid"`)

| Field     | Type            | Rules |
|-----------|-----------------|-------|
| `answers` | array of string | Accepted answers. **Numeric equivalence is automatic** — `"2.5"`, `"2.50"`, and `"5/2"` all match each other. Provide the canonical form; add extra forms only if they aren't numerically equal. No `%` or units. |

---

## 3. Two complete examples

### Multiple choice

```json
{
  "id": "q1",
  "type": "mc",
  "stem": "Which expression is equivalent to $x^2 + 3x - 40$?",
  "choices": [
    { "id": "A", "content": "$(x-4)(x+10)$" },
    { "id": "B", "content": "$(x-5)(x+8)$" },
    { "id": "C", "content": "$(x-8)(x+5)$" },
    { "id": "D", "content": "$(x-10)(x+4)$" }
  ],
  "correct": "B",
  "explanation": "Two numbers with product $-40$ and sum $+3$ are $-5$ and $+8$, so $x^2+3x-40=(x-5)(x+8)$."
}
```

### Grid-in with a figure

```json
{
  "id": "q2",
  "type": "grid",
  "stem": "Line $\\ell$ passes through the two points shown. What is the slope of line $\\ell$?",
  "figures": [
    {
      "id": "fig1",
      "label": "Figure 1",
      "latex": "\\begin{tikzpicture}[scale=0.6]\\draw[->] (-1,0)--(5,0) node[right]{$x$};\\draw[->] (0,-1)--(0,5) node[above]{$y$};\\draw[thick] (0,1)--(4,5);\\fill (0,1) circle (2pt) node[left]{$(0{,}1)$};\\fill (4,5) circle (2pt) node[right]{$(4{,}5)$};\\end{tikzpicture}"
    }
  ],
  "answers": ["1", "1.0"]
}
```

---

## 4. Math: `$…$` (KaTeX)

- Wrap inline math in `$…$`; use `$$…$$` for a centered display equation.
- Text **outside** the dollar signs is plain prose — don't put LaTeX text-mode
  commands there.
- Rendering is **KaTeX** (math mode only). Common, supported commands:
  `\frac`, `\sqrt`, `^`, `_`, `\pi`, `\theta`, `\times`, `\cdot`, `\div`,
  `\le`, `\ge`, `\neq`, `\pm`, `\approx`, `\angle`, `\triangle`, `\overline`,
  `\sqrt[3]{}`, `\left(… \right)`, `\begin{cases}…\end{cases}`,
  `\begin{matrix}…\end{matrix}`, `\text{…}`. Full list:
  <https://katex.org/docs/supported>.
- A literal comma between numbers, like `(4,5)`, gets extra spacing in math
  mode. For a tight comma write `(4{,}5)`.

---

## 5. Diagrams: `figures`

Diagrams are authored as **real LaTeX** (TikZ / pgfplots / …) and rendered to
SVG when the set is ingested — full package support, crisp vectors, and students
never run LaTeX.

**Layout:** every figure in a problem's `figures` array renders **stacked above
the problem text**, in array order, each with its optional caption. You do **not**
need to point at them from the prose — just refer to them naturally ("the line
shown", "Figure 1"). *(A legacy `![figId]` marker in the stem is silently removed,
so don't bother with it.)*

| Field       | Type                | Rules |
|-------------|---------------------|-------|
| `id`        | string              | Unique within the problem. |
| `latex`     | string              | A LaTeX body, typically `\begin{tikzpicture}…\end{tikzpicture}`. **Do not** include `\documentclass`, `\usepackage`, or `\begin{document}` — those are added automatically. |
| `label`     | string *(optional)* | Caption shown under the figure (e.g. `"Figure 1"`). |
| `packages`  | string[] *(optional)* | Extra LaTeX packages, e.g. `["pgfplots"]`. |
| `libraries` | string[] *(optional)* | Extra TikZ libraries, e.g. `["arrows.meta", "calc"]`. |

**Available packages** (load via `packages`): `pgfplots`, `tikz-cd`,
`circuitikz`, `chemfig`, `amsmath`, `amssymb`, `amsfonts`, `amstext`, `array`,
`tikz-3dplot`.

### pgfplots example (function graph)

```json
{
  "id": "graph1",
  "label": "Figure 1",
  "packages": ["pgfplots"],
  "latex": "\\begin{axis}[axis lines=middle, xlabel=$x$, ylabel=$y$, xmin=-3, xmax=3, ymin=-1, ymax=9, width=7cm, height=7cm]\\addplot[thick, domain=-3:3, samples=80]{x^2};\\end{axis}"
}
```
*(pgfplots' `axis` environment goes directly in `latex`; the surrounding
`tikzpicture` is implied.)*

---

## 6. Updating a set (idempotency)

- **Re-upload to edit.** Keep the same set `id` and problem `id`s; the app
  upserts in place, so existing student results stay attached.
- **Removing a problem** from the file deletes it on re-upload — *unless* a
  student has already answered it (then it's kept to protect their results).
- **Changing an `id`** creates a new, separate problem/set.

---

## 7. JSON gotchas (important)

1. **It must be valid JSON.** Every LaTeX backslash is **doubled**: write
   `\\frac`, `\\begin{tikzpicture}`, `\\ell`, `\\draw`. (A single `\` is a JSON
   escape character and will break parsing.)
2. No trailing commas, straight double-quotes only.
3. Keep `$…$` balanced — an odd number of `$` renders as raw text.
4. Tight number commas: `(4{,}5)` not `(4,5)` (see §4).

---

## 8. Authoring checklist

- [ ] Valid JSON; all LaTeX backslashes doubled.
- [ ] `id` is a stable slug; problem `id`s unique within the set; no `:`.
- [ ] Every `mc` has `≥ 2` choices and a `correct` that matches a choice id.
- [ ] Every `grid` has a non-empty `answers` array.
- [ ] Figures: only the inner `latex` body; pull extra `packages`/`libraries` if used.
- [ ] Math wrapped in `$…$`; tight commas as `{,}`.

---

## 9. TypeScript reference (authoritative shape)

```ts
interface ProblemSet {
  id: string
  title: string
  problems: Problem[]
}

interface Problem {
  id: string
  type: 'mc' | 'grid'
  stem: string
  explanation?: string
  figures?: Figure[]
  choices?: Choice[]   // mc only
  correct?: string     // mc only — id of the correct choice
  answers?: string[]   // grid only — accepted answers
}

interface Choice { id: string; content: string }

interface Figure {
  id: string
  latex: string
  label?: string
  packages?: string[]
  libraries?: string[]
}
```
