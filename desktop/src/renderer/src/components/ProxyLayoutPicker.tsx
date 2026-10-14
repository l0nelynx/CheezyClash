import { GalleryHorizontal, Grid2X2, Grid3X3, List } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import type { GroupLayout, ServerLayout } from '../lib/proxy-layout'

interface Props<T extends string> {
  label: string
  value: T
  options: { value: T; label: string; icon: typeof List }[]
  onChange: (value: T) => void
}

function LayoutPicker<T extends string>({ label, value, options, onChange }: Props<T>): React.JSX.Element {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{t(label)}</span>
      <div role="group" aria-label={t(label)} className="flex rounded-lg border border-border bg-background p-0.5">
        {options.map(({ value: option, label: name, icon: Icon }) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            title={t(name)}
            aria-label={t(name)}
            onClick={() => onChange(option)}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${value === option ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  )
}

export function GroupLayoutPicker({ value, onChange }: { value: GroupLayout; onChange: (value: GroupLayout) => void }): React.JSX.Element {
  return <LayoutPicker label="Group view" value={value} onChange={onChange} options={[
    { value: 'list', label: 'List', icon: List },
    { value: 'grid', label: 'Grid', icon: Grid2X2 },
    { value: 'carousel', label: 'Carousel', icon: GalleryHorizontal },
  ]} />
}

export function ServerLayoutPicker({ value, onChange }: { value: ServerLayout; onChange: (value: ServerLayout) => void }): React.JSX.Element {
  return <LayoutPicker label="Proxy view" value={value} onChange={onChange} options={[
    { value: 'list', label: 'List', icon: List },
    { value: 'large-grid', label: 'Large grid', icon: Grid2X2 },
    { value: 'small-grid', label: 'Small grid', icon: Grid3X3 },
  ]} />
}
