import { Routes, Route } from 'react-router-dom'
import { Home } from './Home.tsx'
import { Runner } from './runner/Runner.tsx'
import { Portal } from './portal/Portal.tsx'
import { Review } from './portal/Review.tsx'
import { Tutor } from './tutor/Tutor.tsx'

// Route map:
//   /              info / landing + scaffold health check
//   /s/:token      student portal — launcher + history
//   /hw/:token     the BlueBook-style runner — where homework is DONE
//   /review/:token read-only review of a submitted attempt
//   /t/:secret     tutor dashboard — analytics + lesson-plan export
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/s/:token" element={<Portal />} />
      <Route path="/hw/:token" element={<Runner />} />
      <Route path="/review/:token" element={<Review />} />
      <Route path="/t/:secret" element={<Tutor />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

function NotFound() {
  return (
    <main className="page">
      <h1>Not found</h1>
      <p className="muted">Check your link.</p>
    </main>
  )
}
