import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import ru from './ru.json'

type Language = 'en' | 'ru'
type Theme = 'system' | 'light' | 'dark'
const dictionary: Record<string, string> = ru
const templates = Object.entries(dictionary).filter(([key]) => /\{\w+\}/.test(key)).map(([key, value]) => {
  const names: string[] = []
  const escaped = key.split(/(\{\w+\})/).map(part => {
    if (/^\{\w+\}$/.test(part)) { names.push(part.slice(1, -1)); return '(.+?)' }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }).join('')
  return { pattern: new RegExp(`^${escaped}$`), names, value }
})
function stored(key: string): string | null { try { return localStorage.getItem(key) } catch { return null } }
function save(key: string, value: string): void { try { localStorage.setItem(key, value) } catch { /* Session-only preference. */ } }

export function translate(language: Language, message: string | null | undefined, values: Record<string, unknown> = {}): string {
  if (!message) return ''
  let translated = language === 'ru' ? dictionary[message] ?? message : message
  if (language === 'ru' && !dictionary[message]) {
    for (const template of templates) {
      const match = template.pattern.exec(message)
      if (!match) continue
      translated = template.value
      values = { ...Object.fromEntries(template.names.map((name, index) => [name, match[index + 1]])), ...values }
      break
    }
  }
  return translated.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  )
}

interface Preferences {
  language: Language; theme: Theme
  setLanguage: (language: Language) => void; setTheme: (theme: Theme) => void
  t: (message: string | null | undefined, values?: Record<string, unknown>) => string
}
const PreferencesContext = createContext<Preferences | null>(null)
export function UiPreferencesProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [language, setLanguage] = useState<Language>(() => {
    const value = stored('cheezy-language')
    return value === 'ru' || value === 'en' ? value : navigator.language.startsWith('ru') ? 'ru' : 'en'
  })
  const [theme, setTheme] = useState<Theme>(() => {
    const value = stored('cheezy-theme')
    return value === 'light' || value === 'dark' ? value : 'system'
  })
  useEffect(() => { document.documentElement.lang = language; save('cheezy-language', language) }, [language])
  useEffect(() => {
    save('cheezy-theme', theme)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.classList.toggle('light', !dark)
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    }
    apply(); media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
  const value = useMemo(() => ({ language, theme, setLanguage, setTheme,
    t: (message: string | null | undefined, values?: Record<string, unknown>) => translate(language, message, values),
  }), [language, theme])
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}
export function useI18n(): Preferences {
  const context = useContext(PreferencesContext)
  if (!context) throw new Error('UI preferences provider is missing')
  return context
}
