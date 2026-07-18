import { useState } from 'react'
import { Loader2 } from 'lucide-react'

interface Props {
  productName: string
  onLoggedIn: () => void
}

export function LoginPage({ productName, onLoggedIn }: Props): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await window.cheezy.privateLogin(email.trim(), password)
      onLoggedIn()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <form
        onSubmit={(ev) => void submit(ev)}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-surface-border bg-surface-raised p-6"
      >
        <div>
          <h1 className="text-xl font-semibold text-ink">{productName}</h1>
          <p className="mt-1 text-sm text-ink-muted">Sign in to sync your subscription.</p>
        </div>
        {error && (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <label className="block">
          <span className="mb-1.5 block text-xs text-ink-dim">Email</span>
          <input
            className="field"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-ink-dim">Password</span>
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </label>
        <button type="submit" className="btn-primary w-full" disabled={busy || !email || !password}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Sign in
        </button>
      </form>
    </div>
  )
}
