import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { SyncStatus } from '../sync.ts'
import { Icon } from './Icon.tsx'

export function SyncDialog({
  currentKey,
  status,
  onSaveKey,
  onDisconnect,
  onClose,
}: {
  currentKey: string
  status: SyncStatus
  onSaveKey: (newKey: string) => Promise<void>
  onDisconnect: () => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [keyInput, setKeyInput] = useState(currentKey)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const node = dialog.current
    if (node && !node.open) {
      node.showModal()
    }
    return () => {
      if (node?.open) {
        node.close()
      }
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = keyInput.trim()
    if (trimmed.length < 4) {
      setErrorMsg('Klucz musi mieć co najmniej 4 znaki.')
      return
    }
    setErrorMsg('')
    setIsSubmitting(true)
    try {
      await onSaveKey(trimmed)
      onClose()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Błąd połączenia z bazą.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleDisconnect() {
    onDisconnect()
    onClose()
  }

  return (
    <dialog
      ref={dialog}
      className="dialog-modal"
      onClose={onClose}
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      aria-labelledby="sync-dialog-title"
    >
      <div className="p-5 sm:p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id="sync-dialog-title" className="text-xl font-semibold sm:text-[22px]">
            Synchronizacja
          </h2>
          <button
            className="btn-icon -mr-2 -mt-1"
            onClick={onClose}
            aria-label="Zamknij okno synchronizacji"
          >
            <Icon name="close" />
          </button>
        </div>

        <p className="text-sm leading-relaxed text-foodini-muted">
          Współdziel bieżący plan posiłków i listę zakupów z drugim urządzeniem lub domownikiem.
        </p>

        <div
          className={`my-4 rounded-md border p-3 px-3.5 text-sm ${
            status === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : status === 'syncing'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-foodini-border bg-foodini-subtle text-foodini-text'
          }`}
        >
          <span className="font-medium">
            {status === 'idle' && 'Połączono i zsynchronizowano z chmurą'}
            {status === 'syncing' && 'Trwa synchronizacja danych...'}
            {status === 'error' && 'Błąd połączenia lub synchronizacji'}
            {status === 'local' && 'Tryb lokalny (dane zapisywane tylko w tej przeglądarce)'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2">
          <label htmlFor="sync-key-input" className="text-sm font-medium">
            Wspólny klucz gospodarstwa domowego
          </label>
          <input
            id="sync-key-input"
            className="form-input"
            type="text"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            placeholder="np. nasze-obiady-2026"
            minLength={4}
            maxLength={64}
            required
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck="false"
          />
          <p className="text-[13px] leading-relaxed text-foodini-muted">
            Wpisz to samo hasło na drugim urządzeniu, aby mieć ten sam plan i listę zakupów.
          </p>

          {errorMsg && <p className="mt-1 text-[13px] text-status-error">{errorMsg}</p>}

          <div className="mt-4 flex items-center justify-end gap-2.5">
            {currentKey && (
              <button
                type="button"
                className="btn-secondary text-red-700 hover:text-red-800"
                onClick={handleDisconnect}
                disabled={isSubmitting}
              >
                Rozłącz
              </button>
            )}
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting || !keyInput.trim() || keyInput.trim().length < 4}
            >
              {isSubmitting ? 'Łączenie...' : 'Zapisz i połącz'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
