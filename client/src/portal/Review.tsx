import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiGet } from '../api.ts'
import { RichText, ProblemFigures, normalizeFigures, figuresToMap, stripFigureRefs } from '../RichText.tsx'

interface RChoice { id: string; content: string }
interface ReviewProblem {
  id: string
  ordinal: number
  type: 'mc' | 'grid'
  stem: string
  choices: RChoice[]
  correct: string | null
  answers: string[]
  explanation: string | null
  figures: unknown
}
interface ReviewResponse {
  problem_id: string
  answer: string | null
  is_correct: boolean | null
  marked_for_review: boolean
  time_spent_ms: number
}
interface ReviewData {
  studentName: string
  assignmentTitle: string | null
  status: string
  score: number
  total: number
  problems: ReviewProblem[]
  responses: ReviewResponse[]
}

export function Review() {
  const { token } = useParams()
  const [data, setData] = useState<ReviewData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    apiGet<ReviewData>(`/api/attempt/${token}/review`)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [token])

  if (error) return <main className="page"><h1>Review</h1><p className="muted">{error}</p></main>
  if (!data) return <main className="page"><p className="muted">Loading…</p></main>

  const byId = new Map(data.responses.map((r) => [r.problem_id, r]))

  return (
    <main className="page review">
      <h1>{data.assignmentTitle || 'Homework'} — Review</h1>
      <p className="score-line">
        Score: <strong>{data.score}/{data.total}</strong>
        {data.status === 'expired' && <span className="muted"> · time expired</span>}
      </p>

      {data.problems.map((p, i) => {
        const r = byId.get(p.id)
        const correct = !!r?.is_correct
        const yourAnswer = r?.answer ?? null
        const figs = normalizeFigures(p.figures)
        const figMap = figuresToMap(figs)
        return (
          <article key={p.id} className={`review-q ${correct ? 'correct' : 'incorrect'}`}>
            <div className="rq-head">
              <span className="q-number">{i + 1}</span>
              <span className={`badge ${correct ? 'ok' : 'bad'}`}>{correct ? 'Correct' : 'Incorrect'}</span>
              {r && <span className="muted">{Math.round(r.time_spent_ms / 1000)}s</span>}
            </div>
            <ProblemFigures figures={figs} />
            <div className="q-stem">
              <RichText text={stripFigureRefs(p.stem)} figures={figMap} />
            </div>

            {p.type === 'mc' ? (
              <ul className="choices review-choices">
                {p.choices.map((c) => {
                  const isCorrect = p.correct === c.id
                  const isYours = yourAnswer === c.id
                  return (
                    <li
                      key={c.id}
                      className={`choice ${isCorrect ? 'is-correct' : ''} ${isYours && !isCorrect ? 'is-wrong' : ''}`}
                    >
                      <span className="choice-letter">{c.id}</span>
                      <span className="choice-content">
                        <RichText text={stripFigureRefs(c.content)} figures={figMap} />
                      </span>
                      {isCorrect && <span className="tag ok">correct</span>}
                      {isYours && <span className="tag">your answer</span>}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="grid-review">
                <div>
                  Your answer: <strong>{yourAnswer || <span className="muted">blank</span>}</strong>
                </div>
                <div>
                  Accepted: <strong>{p.answers.join(', ')}</strong>
                </div>
              </div>
            )}

            {p.explanation && (
              <div className="explanation">
                <strong>Explanation. </strong>
                <RichText text={stripFigureRefs(p.explanation)} figures={figMap} />
              </div>
            )}
          </article>
        )
      })}
    </main>
  )
}
