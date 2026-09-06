import { useI18n } from '../lib/i18n'
import { Link2, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'

interface Props {
  productName: string
  onLoggedIn: () => void
  onImportUrl: (url: string) => Promise<void>
  onCancel?: () => void
  handoffError?: string | null
}

export function LoginPage({
  productName,
  onLoggedIn,
  onImportUrl,
  onCancel,
  handoffError,
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [subscriptionUrl, setSubscriptionUrl] = useState('')
  const [busyAction, setBusyAction] = useState<'login' | 'import' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = busyAction !== null

  async function submitLogin(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setBusyAction('login')
    setError(null)
    try {
      await window.cheezy.privateLogin(email.trim(), password)
      onLoggedIn()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusyAction(null)
    }
  }

  async function submitImport(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const url = subscriptionUrl.trim()
    if (!url) return
    setBusyAction('import')
    setError(null)
    try {
      await onImportUrl(url)
      setSubscriptionUrl('')
    } catch (err) {
      setError(String(err))
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex min-h-full items-center justify-center">
        <div className="page-card w-full max-w-sm space-y-5 rounded-2xl p-6">
          <div>
            <h1 className="text-xl font-semibold text-ink">{productName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Sign in to sync your account subscriptions.")}</p>
          </div>

          {(error || handoffError) && (
            <p
              role="alert"
              className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {error || handoffError}
            </p>
          )}

          <form
            onSubmit={(ev) => void submitLogin(ev)}
            className="space-y-4"
            aria-busy={busyAction === 'login'}
          >
            <label className="block">
              <span className="mb-1.5 block text-xs text-ink-dim">{t("Email")}</span>
              <Input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-ink-dim">{t("Password")}</span>
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </label>
            <Button type="submit" className="w-full" disabled={busy || !email || !password}>
              {busyAction === 'login' ? <Loader2 className="animate-spin" /> : null}
              {t("Sign in")}</Button>
          </form>

          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-surface-border" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-dim">{t("or")}</span>
            <span className="h-px flex-1 bg-surface-border" />
          </div>

          <form
            onSubmit={(ev) => void submitImport(ev)}
            className="space-y-3"
            aria-busy={busyAction === 'import'}
          >
            <div>
              <p className="text-sm font-medium text-ink">{t("Use a subscription link")}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-dim">
                {t("Use {0} without signing in. You can sign in later from Settings.", {0:productName})}</p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs text-ink-dim">{t("Subscription URL")}</span>
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" />
                <Input
                  className="pl-9"
                  type="url"
                  autoComplete="url"
                  placeholder="https://…"
                  required
                  value={subscriptionUrl}
                  onChange={(e) => setSubscriptionUrl(e.target.value)}
                  disabled={busy}
                />
              </div>
            </label>
            <Button
              type="submit"
              variant="outline"
              className="w-full"
              disabled={busy || !subscriptionUrl.trim()}
            >
              {busyAction === 'import' ? <Loader2 className="animate-spin" /> : <Link2 />}
              {t("Import subscription")}</Button>
          </form>

          {onCancel && (
            <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={onCancel}>
              {t("Back to app")}</Button>
          )}
        </div>
      </div>
    </div>
  )
}
