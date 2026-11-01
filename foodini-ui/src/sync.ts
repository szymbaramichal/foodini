import { parseSavedState } from './storage.ts'
import type { SavedState } from './types.ts'

export const SYNC_KEY_STORAGE = 'foodini:sync:key'
export const SYNC_TIMESTAMP_STORAGE = 'foodini:sync:updatedAt'

export type SyncStatus = 'local' | 'idle' | 'syncing' | 'error'

export interface SyncStatusInfo {
  status: SyncStatus
  message: string
}

export function getStoredSyncKey(): string {
  try {
    return localStorage.getItem(SYNC_KEY_STORAGE)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function setStoredSyncKey(key: string): void {
  try {
    const trimmed = key.trim()
    if (trimmed) {
      localStorage.setItem(SYNC_KEY_STORAGE, trimmed)
    } else {
      localStorage.removeItem(SYNC_KEY_STORAGE)
    }
  } catch {
    // Ignore storage errors
  }
}

export function clearStoredSyncKey(): void {
  try {
    localStorage.removeItem(SYNC_KEY_STORAGE)
    localStorage.removeItem(SYNC_TIMESTAMP_STORAGE)
  } catch {
    // Ignore storage errors
  }
}

export interface RemoteSyncResponse {
  exists: boolean
  state: SavedState | null
  updatedAt: number
}

export async function fetchRemoteState(syncKey: string): Promise<RemoteSyncResponse> {
  const response = await fetch('/api/sync', {
    method: 'GET',
    headers: {
      'x-household-key': syncKey.trim(),
    },
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(errorBody.error || `Błąd pobierania (${response.status})`)
  }

  const data = (await response.json()) as {
    exists: boolean
    state: unknown
    updatedAt: number
  }

  if (!data.exists || !data.state) {
    return { exists: false, state: null, updatedAt: 0 }
  }

  const validated = parseSavedState(JSON.stringify(data.state))
  return { exists: true, state: validated, updatedAt: data.updatedAt }
}

export async function pushRemoteState(
  syncKey: string,
  state: SavedState,
): Promise<{ ok: boolean; updatedAt: number }> {
  const response = await fetch('/api/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-household-key': syncKey.trim(),
    },
    body: JSON.stringify({ state }),
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(errorBody.error || `Błąd zapisu (${response.status})`)
  }

  const data = (await response.json()) as { ok: boolean; updatedAt: number }
  try {
    localStorage.setItem(SYNC_TIMESTAMP_STORAGE, String(data.updatedAt))
  } catch {
    // Ignore
  }
  return data
}
