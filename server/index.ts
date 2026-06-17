import './env.ts'
import { app } from './app.ts'

// Long-running server bootstrap (Render). The app itself lives in app.ts so a
// future serverless handler could import it without this listen() call.
const PORT = Number(process.env.PORT) || 5959

app.listen(PORT, () => {
  console.log(`SAT homework server listening on http://localhost:${PORT}`)
})
