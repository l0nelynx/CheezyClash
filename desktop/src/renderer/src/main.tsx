import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled locally via @fontsource — no Google/GitHub CDN at runtime
import '@fontsource/noto-color-emoji/400.css'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
