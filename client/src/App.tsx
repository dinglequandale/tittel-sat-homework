import { Routes, Route, useParams } from 'react-router-dom'
import { Home } from './Home.tsx'

// Route map (surfaces fleshed out across later milestones):
//   /             info / landing + scaffold health check
//   /s/:token     student portal — launcher + history (Milestone 5)
//   /hw/:token    the BlueBook-style runner — where homework is DONE (Milestone 3)
//   /t/:secret    tutor dashboard — analytics + lesson-plan export (Milestone 6)
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/s/:token" element={<Placeholder name="Student portal" />} />
      <Route path="/hw/:token" element={<Placeholder name="Test runner" />} />
      <Route path="/t/:secret" element={<Placeholder name="Tutor dashboard" />} />
      <Route path="*" element={<Placeholder name="Not found" />} />
    </Routes>
  )
}

function Placeholder({ name }: { name: string }) {
  const params = useParams()
  const key = params.token ?? params.secret
  return (
    <main className="page">
      <h1>{name}</h1>
      <p className="muted">Coming in a later milestone.</p>
      {key && <p className="muted">key: <code>{key}</code></p>}
    </main>
  )
}
