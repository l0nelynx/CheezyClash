import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill'
// Bundled Twemoji COLR flags — Chromium/Windows won't draw Segoe or CBDT Noto flags.
import twemojiFlagsUrl from './assets/TwemojiCountryFlags.woff2?url'
import App from './App'
import './index.css'

polyfillCountryFlagEmojis('Twemoji Country Flags', twemojiFlagsUrl)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
