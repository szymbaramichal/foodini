import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  clearStoredSyncKey,
  fetchRemoteState,
  getStoredSyncKey,
  pushRemoteState,
  setStoredSyncKey,
  type SyncStatus,
} from './sync.ts'
import type { SavedState } from './types.ts'

export function useSync(
  saved: SavedState,
  setSaved: Dispatch<SetStateAction<SavedState>>,
  notify: (message: string) => void,
) {
  const [syncKey, setSyncKey] = useState<string>(getStoredSyncKey)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => (syncKey ? 'syncing' : 'local'))
  const [showSyncDialog, setShowSyncDialog] = useState(false)
  const isInitialSyncDone = useRef(false)
  const lastSyncedSerialized = useRef<string>('')
  const savedRef = useRef(saved)

  useEffect(() => {
    savedRef.current = saved
  }, [saved])

  useEffect(() => {
    if (!syncKey) {
      isInitialSyncDone.current = true
      return
    }

    let active = true

    fetchRemoteState(syncKey)
      .then(async result => {
        if (!active) return
        if (result.exists && result.state) {
          setSaved(result.state)
          lastSyncedSerialized.current = JSON.stringify(result.state)
          setSyncStatus('idle')
        } else {
          lastSyncedSerialized.current = JSON.stringify(savedRef.current)
          await pushRemoteState(syncKey, savedRef.current)
          if (active) setSyncStatus('idle')
        }
      })
      .catch(() => {
        if (active) setSyncStatus('error')
      })
      .finally(() => {
        if (active) isInitialSyncDone.current = true
      })

    return () => {
      active = false
    }
  }, [syncKey, setSaved])

  useEffect(() => {
    if (!syncKey || !isInitialSyncDone.current) return

    const currentSerialized = JSON.stringify(saved)
    if (currentSerialized === lastSyncedSerialized.current) return

    setSyncStatus('syncing')
    const timer = window.setTimeout(async () => {
      try {
        await pushRemoteState(syncKey, saved)
        lastSyncedSerialized.current = currentSerialized
        setSyncStatus('idle')
      } catch {
        setSyncStatus('error')
      }
    }, 800)

    return () => window.clearTimeout(timer)
  }, [saved, syncKey])

  async function handleSaveSyncKey(newKey: string) {
    setStoredSyncKey(newKey)
    setSyncKey(newKey)
    setSyncStatus('syncing')
    try {
      const result = await fetchRemoteState(newKey)
      if (result.exists && result.state) {
        setSaved(result.state)
        lastSyncedSerialized.current = JSON.stringify(result.state)
        notify('Połączono! Wczytano dane z chmury.')
      } else {
        await pushRemoteState(newKey, saved)
        lastSyncedSerialized.current = JSON.stringify(saved)
        notify('Połączono! Zapisano bieżący plan w chmurze.')
      }
      setSyncStatus('idle')
    } catch (err) {
      setSyncStatus('error')
      throw err
    }
  }

  function handleDisconnectSync() {
    clearStoredSyncKey()
    setSyncKey('')
    setSyncStatus('local')
    notify('Odłączono synchronizację. Dane pozostają w pamięci tej przeglądarki.')
  }

  return {
    syncKey,
    syncStatus,
    showSyncDialog,
    setShowSyncDialog,
    handleSaveSyncKey,
    handleDisconnectSync,
  }
}
