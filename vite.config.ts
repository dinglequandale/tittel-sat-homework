import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The client lives in client/ and builds to client/dist (served by the Node
// server in production). In dev, Vite serves the client on :5273 and proxies
// /api to the Node server on :5959. Ports are offset from the whiteboard
// (5173/5858) so both apps can run side by side during development.
const SERVER = 'http://localhost:5959'

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5273,
    proxy: {
      '/api': { target: SERVER },
    },
    // The shared/ contract lives outside the client root.
    fs: { allow: ['..'] },
  },
})
