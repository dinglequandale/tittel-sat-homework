# SAT Homework

A BlueBook/OnePrep-style SAT homework runner with a tutor analytics dashboard.
A standalone app (its own repo + Render service), part of the same tutoring
toolkit as the whiteboard.

- **Students** sit every assignment through one BlueBook-style **runner**
  (`/hw/<attemptToken>`): centered countdown, mark-for-review, answer
  eliminator, calculator, reference sheet, question navigator.
- **Identity** is magic-link, zero-password. Each student has a permanent
  private portal at `/s/<studentToken>` (launcher + history/review).
- **You** review per-homework analytics at `/t/<TUTOR_SECRET>` and export
  selected problems straight into the next lesson plan's review section.
- **Persistence** is Supabase Postgres (durable, free).

## Rendering

- Inline math (`$x^2+3x-40$`) → **KaTeX**, live in the browser.
- Diagrams (`![figId]` → TikZ/pgfplots/etc.) → **pre-rendered to SVG at push
  time** by the authoring CLI using a real LaTeX toolchain, then stored in the
  DB. Full LaTeX package support; students never touch TeX. (Pipeline lands in
  Milestone 2 via `node-tikzjax` — a WASM TeX engine that ships as an npm dep,
  so there's no system LaTeX install to manage.)

See [`shared/format.ts`](shared/format.ts) for the authoring JSON contract and
[`examples/set.example.json`](examples/set.example.json) for a sample.

## Local development

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL + TUTOR_SECRET
npm run migrate               # create tables in Supabase
npm run dev                   # client :5273  ·  server :5959
```

Open http://localhost:5273 — the landing page reports server + DB health.

## Deploy

`render.yaml` defines one web service. On Render: New + → Blueprint → pick this
repo. Set `DATABASE_URL` and `TUTOR_SECRET` in Render's env panel (both
`sync: false`).
