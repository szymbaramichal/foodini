import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractHouseholdKey,
  handleSyncGet,
  handleSyncPost,
  hashHouseholdKey,
  onRequest,
  type D1Database,
  type D1PreparedStatement,
  type SyncEnv,
} from '../functions/api/sync.ts'
import { createInitialState } from '../src/storage.ts'

class MockD1 implements D1Database {
  public store = new Map<string, { state_json: string; version: number; updated_at: number }>()

  prepare(query: string): D1PreparedStatement {
    let boundValues: unknown[] = []

    const stmt: D1PreparedStatement = {
      bind: (...values: unknown[]) => {
        boundValues = values
        return stmt
      },
      first: async <T = Record<string, unknown>>(colName?: string): Promise<T | null> => {
        if (query.includes('SELECT count(*) as total FROM household_state')) {
          const res = { total: this.store.size }
          return (colName ? (res as Record<string, unknown>)[colName] : res) as T
        }
        if (query.includes('SELECT state_json, updated_at FROM household_state')) {
          const key = String(boundValues[0])
          const row = this.store.get(key)
          if (!row) return null
          return { state_json: row.state_json, updated_at: row.updated_at } as T
        }
        if (query.includes('SELECT updated_at FROM household_state')) {
          const key = String(boundValues[0])
          const row = this.store.get(key)
          if (!row) return null
          return { updated_at: row.updated_at } as T
        }
        return null
      },
      all: async <T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }> => {
        return { results: [], success: true }
      },
      run: async (): Promise<{ success: boolean; meta: unknown }> => {
        if (query.includes('INSERT INTO household_state')) {
          const [key, stateJson, version, updatedAt] = boundValues
          this.store.set(String(key), {
            state_json: String(stateJson),
            version: Number(version),
            updated_at: Number(updatedAt),
          })
        }
        return { success: true, meta: {} }
      },
    }

    return stmt
  }
}

test('hashHouseholdKey creates consistent sha256 hex string', async () => {
  const hash1 = await hashHouseholdKey('test')
  const hash2 = await hashHouseholdKey('test')
  const diffHash = await hashHouseholdKey('inne-obiady')

  assert.equal(hash1, hash2)
  assert.equal(typeof hash1, 'string')
  assert.equal(hash1.length, 64)
  assert.notEqual(hash1, diffHash)
})

test('extractHouseholdKey extracts from header or bearer token', () => {
  const req1 = new Request('https://foodini.pages.dev/api/sync', {
    headers: { 'x-household-key': 'sekret123' },
  })
  assert.equal(extractHouseholdKey(req1), 'sekret123')

  const req2 = new Request('https://foodini.pages.dev/api/sync', {
    headers: { authorization: 'Bearer sekret456' },
  })
  assert.equal(extractHouseholdKey(req2), 'sekret456')

  const reqShort = new Request('https://foodini.pages.dev/api/sync', {
    headers: { 'x-household-key': 'ab' },
  })
  assert.equal(extractHouseholdKey(reqShort), null)
})

test('handleSyncGet returns 401 when key is missing or invalid', async () => {
  const db = new MockD1()
  const env: SyncEnv = { DB: db }

  const req = new Request('https://foodini.pages.dev/api/sync')
  const res = await handleSyncGet(req, env)
  assert.equal(res.status, 401)
})

test('handleSyncGet returns 503 when D1 binding is not configured', async () => {
  const env: SyncEnv = {}
  const req = new Request('https://foodini.pages.dev/api/sync', {
    headers: { 'x-household-key': 'sekret123' },
  })
  const res = await handleSyncGet(req, env)
  assert.equal(res.status, 503)
})

test('handleSyncGet returns exists: false when household has no state yet', async () => {
  const db = new MockD1()
  const env: SyncEnv = { DB: db }
  const req = new Request('https://foodini.pages.dev/api/sync', {
    headers: { 'x-household-key': 'sekret123' },
  })
  const res = await handleSyncGet(req, env)
  assert.equal(res.status, 200)
  const body = (await res.json()) as { exists: boolean; state: unknown; updatedAt: number }
  assert.equal(body.exists, false)
  assert.equal(body.state, null)
})

test('handleSyncPost validates payload and stores state in D1', async () => {
  const db = new MockD1()
  const env: SyncEnv = { DB: db }
  const state = createInitialState()

  const req = new Request('https://foodini.pages.dev/api/sync', {
    method: 'POST',
    headers: {
      'x-household-key': 'sekret123',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ state }),
  })

  const res = await handleSyncPost(req, env)
  assert.equal(res.status, 200)
  const postBody = (await res.json()) as { ok: boolean; updatedAt: number }
  assert.equal(postBody.ok, true)
  assert.ok(postBody.updatedAt > 0)

  // Now verify handleSyncGet retrieves this state
  const getReq = new Request('https://foodini.pages.dev/api/sync', {
    headers: { 'x-household-key': 'sekret123' },
  })
  const getRes = await handleSyncGet(getReq, env)
  assert.equal(getRes.status, 200)
  const getBody = (await getRes.json()) as {
    exists: boolean
    state: typeof state
    updatedAt: number
  }
  assert.equal(getBody.exists, true)
  assert.deepEqual(getBody.state, state)
})

test('handleSyncPost rejects invalid state payload', async () => {
  const db = new MockD1()
  const env: SyncEnv = { DB: db }

  const req = new Request('https://foodini.pages.dev/api/sync', {
    method: 'POST',
    headers: {
      'x-household-key': 'sekret123',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ state: { invalid: true } }),
  })

  const res = await handleSyncPost(req, env)
  assert.equal(res.status, 400)
})

test('handleSyncPost enforces max households limit', async () => {
  const db = new MockD1()
  const env: SyncEnv = { DB: db }
  const state = createInitialState()

  // Pre-fill 10 households
  for (let i = 0; i < 10; i++) {
    db.store.set(`household_${i}`, {
      state_json: JSON.stringify(state),
      version: 1,
      updated_at: Date.now(),
    })
  }

  // Attempt to add an 11th new household
  const req = new Request('https://foodini.pages.dev/api/sync', {
    method: 'POST',
    headers: {
      'x-household-key': 'new-key-11th',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ state }),
  })

  const res = await handleSyncPost(req, env)
  assert.equal(res.status, 403)
})

test('onRequest responds to OPTIONS preflight with 204', async () => {
  const req = new Request('https://foodini.pages.dev/api/sync', { method: 'OPTIONS' })
  const res = await onRequest({ request: req, env: {} })
  assert.equal(res.status, 204)
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*')
})
