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
    dialog.current?.showModal()
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
      className="recipe-dialog sync-dialog"
      onClose={onClose}
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      aria-labelledby="sync-dialog-title"
    >
      <div className="dialog-body">
        <div className="dialog-heading">
          <h2 id="sync-dialog-title">Synchronizacja</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Zamknij okno synchronizacji"
          >
            <Icon name="close" />
          </button>
        </div>

        <p className="muted">
          Współdziel bieżący plan posiłków i listę zakupów z drugim urządzeniem lub domownikiem.
        </p>

        <div className="sync-status-badge">
          <span className={`status-dot status-${status}`} />
          <span>
            {status === 'idle' && 'Połączono i zsynchronizowano z chmurą'}
            {status === 'syncing' && 'Trwa synchronizacja danych...'}
            {status === 'error' && 'Błąd połączenia lub synchronizacji'}
            {status === 'local' && 'Tryb lokalny (dane zapisywane tylko w tej przeglądarce)'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="sync-form">
          <label htmlFor="sync-key-input">Wspólny klucz gospodarstwa domowego</label>
          <input
            id="sync-key-input"
            type="text"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            placeholder="np. nasze-obiady-2026"
            minLength={4}
            maxLength={64}
            required
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
          />
          <p className="settings-hint muted">
            Wpisz to samo hasło na drugim urządzeniu, aby mieć ten sam plan i listę zakupów.
          </p>

          {errorMsg && <p className="sync-error-text">{errorMsg}</p>}

          <div className="sync-dialog-actions">
            {currentKey && (
              <button
                type="button"
                className="button secondary danger-text"
                onClick={handleDisconnect}
                disabled={isSubmitting}
              >
                Rozłącz
              </button>
            )}
            <button
              type="submit"
              className="button primary"
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
