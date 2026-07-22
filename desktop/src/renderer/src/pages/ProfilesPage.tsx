import type { ProfileMeta } from '../../../shared/types'
import { ProfileList } from '../components/ProfileList'

interface Props {
  profiles: ProfileMeta[]
  activeId: string | null
  busy: boolean
  onImportUrl: (url: string) => Promise<void>
  onImportFile: () => void
  onActivate: (id: string) => void
  onUpdate: (id: string) => void
  onDelete: (id: string) => void
}

export function ProfilesPage(props: Props): React.JSX.Element {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink">Profiles</h2>
        <p className="text-sm text-muted-foreground">Your subscriptions and configs.</p>
      </div>
      <ProfileList {...props} />
    </div>
  )
}
