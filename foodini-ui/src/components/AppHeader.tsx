import type { SyncStatus } from '../sync.ts'
import type { View } from '../types.ts'

interface AppHeaderProps {
  view: View
  onNavigate: (view: View) => void
  syncStatus: SyncStatus
  onOpenSync: () => void
  unboughtCount: number
}

const navigation: { id: View; label: string }[] = [
  { id: 'recipes', label: 'Posiłki' },
  { id: 'planner', label: 'Planer' },
  { id: 'shopping', label: 'Lista zakupów' },
]

const syncLabels: Record<SyncStatus, { label: string; tooltip: string }> = {
  idle: { label: 'Zsynchronizowano', tooltip: 'Połączono z chmurą. Dane są aktualne.' },
  syncing: { label: 'Synchronizuję...', tooltip: 'Trwa synchronizacja danych z chmurą.' },
  error: {
    label: 'Błąd synchronizacji',
    tooltip: 'Nie udało się połączyć z bazą. Kliknij, aby sprawdzić.',
  },
  local: {
    label: 'Synchronizacja',
    tooltip: 'Współdziel plan i listę zakupów z domownikiem lub innym urządzeniem.',
  },
}

export function AppHeader({
  view,
  onNavigate,
  syncStatus,
  onOpenSync,
  unboughtCount,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-foodini-border bg-white">
      <div className="mx-auto flex max-w-[1040px] items-center justify-between gap-2 p-2 sm:gap-5 sm:px-6 sm:py-3 max-sm:flex-wrap">
        <div className="flex items-center gap-4 max-sm:w-full max-sm:justify-between">
          <button
            className="min-h-[44px] cursor-pointer bg-transparent p-0 text-[22px] font-bold tracking-tight text-brand sm:text-2xl"
            onClick={() => onNavigate('recipes')}
            aria-label="Foodini — posiłki"
          >
            foodini
          </button>
          <button
            type="button"
            className={`inline-flex min-h-[44px] cursor-pointer items-center rounded-md border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 sm:text-[13px] ${
              syncStatus === 'error'
                ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                : syncStatus === 'syncing'
                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                  : 'border-foodini-border bg-white text-foodini-muted hover:border-brand/40 hover:bg-foodini-subtle hover:text-brand'
            }`}
            onClick={onOpenSync}
            title={syncLabels[syncStatus].tooltip}
            aria-label={`Synchronizacja: ${syncLabels[syncStatus].label}`}
          >
            {syncLabels[syncStatus].label}
          </button>
        </div>
        <nav className="flex gap-1 max-sm:w-full" aria-label="Nawigacja główna">
          {navigation.map(item => (
            <button
              key={item.id}
              className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-2 rounded px-3 text-[13px] transition sm:flex-initial sm:px-4 sm:text-sm ${
                view === item.id
                  ? 'bg-brand-light font-semibold text-brand'
                  : 'bg-transparent text-foodini-muted hover:bg-brand-light hover:text-brand'
              }`}
              onClick={() => onNavigate(item.id)}
              aria-label={item.label}
              aria-current={view === item.id ? 'page' : undefined}
            >
              {item.label}
              {item.id === 'shopping' && <span className="text-xs">{unboughtCount}</span>}
            </button>
          ))}
        </nav>
      </div>
    </header>
  )
}
