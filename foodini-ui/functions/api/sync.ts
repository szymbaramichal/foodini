import { parseSavedState } from '../../src/storage.ts'
import type { SavedState } from '../../src/types.ts'

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>
  run(): Promise<{ success: boolean; meta: unknown }>
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement
}

export interface SyncEnv {
  DB?: D1Database
  FOODINI_SECRET_KEY?: string
}

export interface SyncContext {
  request: Request
  env: SyncEnv
}

const MAX_PAYLOAD_BYTES = 64 * 1024 // 64 KB
const MAX_HOUSEHOLDS = 10

export async function hashHouseholdKey(key: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(key.trim())
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export function extractHouseholdKey(request: Request): string | null {
  const customHeader = request.headers.get('x-household-key')
  if (customHeader && customHeader.trim().length >= 4) {
    return customHeader.trim()
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token.length >= 4) return token
  }
  return null
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-household-key',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders,
    },
  })
}

export async function handleSyncGet(request: Request, env: SyncEnv): Promise<Response> {
  const rawKey = extractHouseholdKey(request)
  if (!rawKey) {
    return jsonResponse(
      { error: 'Wymagany jest prawidłowy klucz synchronizacji (min. 4 znaki)' },
      401,
    )
  }

  if (env.FOODINI_SECRET_KEY && rawKey !== env.FOODINI_SECRET_KEY) {
    return jsonResponse({ error: 'Nieprawidłowy klucz synchronizacji' }, 401)
  }

  if (!env.DB) {
    return jsonResponse({ error: 'Baza D1 nie jest skonfigurowana' }, 503)
  }

  const householdId = await hashHouseholdKey(rawKey)
  const row = await env.DB.prepare(
    'SELECT state_json, updated_at FROM household_state WHERE household_id = ?1',
  )
    .bind(householdId)
    .first<{ state_json: string; updated_at: number }>()

  if (!row) {
    return jsonResponse({ exists: false, state: null, updatedAt: 0 }, 200)
  }

  try {
    const state = parseSavedState(row.state_json)
    return jsonResponse({ exists: true, state, updatedAt: row.updated_at }, 200)
  } catch {
    // If the saved state cannot be parsed or validated (e.g. outdated incompatible schema),
    // treat it as non-existent so the client can safely re-seed from local state rather than breaking with 500.
    return jsonResponse({ exists: false, state: null, updatedAt: 0 }, 200)
  }
}

export async function handleSyncPost(request: Request, env: SyncEnv): Promise<Response> {
  const rawKey = extractHouseholdKey(request)
  if (!rawKey) {
    return jsonResponse(
      { error: 'Wymagany jest prawidłowy klucz synchronizacji (min. 4 znaki)' },
      401,
    )
  }

  if (env.FOODINI_SECRET_KEY && rawKey !== env.FOODINI_SECRET_KEY) {
    return jsonResponse({ error: 'Nieprawidłowy klucz synchronizacji' }, 401)
  }

  if (!env.DB) {
    return jsonResponse({ error: 'Baza D1 nie jest skonfigurowana' }, 503)
  }

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return jsonResponse({ error: 'Przekroczono maksymalny rozmiar danych (64 KB)' }, 413)
  }

  const text = await request.text()
  if (text.length > MAX_PAYLOAD_BYTES) {
    return jsonResponse({ error: 'Przekroczono maksymalny rozmiar danych (64 KB)' }, 413)
  }

  let payload: { state?: unknown }
  try {
    payload = JSON.parse(text)
  } catch {
    return jsonResponse({ error: 'Nieprawidłowy format JSON' }, 400)
  }

  let validatedState: SavedState
  try {
    validatedState = parseSavedState(JSON.stringify(payload.state))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Błąd walidacji'
    return jsonResponse({ error: `Nieprawidłowe dane stanu: ${message}` }, 400)
  }

  const householdId = await hashHouseholdKey(rawKey)

  // Flood protection: if household does not exist yet, ensure total households count is below limit
  const existing = await env.DB.prepare(
    'SELECT updated_at FROM household_state WHERE household_id = ?1',
  )
    .bind(householdId)
    .first<{ updated_at: number }>()

  if (!existing) {
    const countRow = await env.DB.prepare('SELECT count(*) as total FROM household_state').first<{
      total: number
    }>()
    const total = countRow?.total ?? 0
    if (total >= MAX_HOUSEHOLDS) {
      return jsonResponse({ error: 'Osiągnięto limit gospodarstw domowych w bazie' }, 403)
    }
  }

  const now = Math.max(Date.now(), (existing?.updated_at ?? 0) + 1)
  const stateJson = JSON.stringify(validatedState)

  await env.DB.prepare(
    `INSERT INTO household_state (household_id, state_json, version, updated_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(household_id) DO UPDATE SET
       state_json = excluded.state_json,
       version = excluded.version,
       updated_at = excluded.updated_at`,
  )
    .bind(householdId, stateJson, validatedState.version, now)
    .run()

  return jsonResponse({ ok: true, updatedAt: now }, 200)
}

export async function onRequest(context: SyncContext): Promise<Response> {
  const method = context.request.method.toUpperCase()
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (method === 'GET') {
    return handleSyncGet(context.request, context.env)
  }
  if (method === 'POST') {
    return handleSyncPost(context.request, context.env)
  }
  return jsonResponse({ error: 'Metoda niedozwolona' }, 405)
}
