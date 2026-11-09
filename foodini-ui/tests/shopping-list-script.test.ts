import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchShoppingList,
  formatShoppingListText,
  normalizeSyncUrl,
  parseCliArgs,
} from '../scripts/get-shopping-list.ts'
import { createInitialState } from '../src/storage.ts'
import { shoppingSignature } from '../src/domain.ts'
import type { ShoppingItem } from '../src/types.ts'

test('normalizeSyncUrl correctly normalizes endpoints', () => {
  assert.equal(
    normalizeSyncUrl('https://foodini-poc.pages.dev'),
    'https://foodini-poc.pages.dev/api/sync',
  )
  assert.equal(
    normalizeSyncUrl('https://foodini-poc.pages.dev/'),
    'https://foodini-poc.pages.dev/api/sync',
  )
  assert.equal(
    normalizeSyncUrl('https://foodini-poc.pages.dev/api/sync'),
    'https://foodini-poc.pages.dev/api/sync',
  )
  assert.equal(normalizeSyncUrl('localhost:5173'), 'http://localhost:5173/api/sync')
  assert.equal(normalizeSyncUrl('127.0.0.1:8788'), 'http://127.0.0.1:8788/api/sync')
  assert.equal(normalizeSyncUrl('myapp.pages.dev'), 'https://myapp.pages.dev/api/sync')

  assert.throws(() => normalizeSyncUrl(''), /Adres URL/)
  assert.throws(() => normalizeSyncUrl('   '), /Adres URL/)
})

test('parseCliArgs parses flags correctly', () => {
  const parsed1 = parseCliArgs([
    '-k',
    'secret-key',
    '-u',
    'https://test.dev',
    '--all',
    '-f',
    'json',
  ])
  assert.equal(parsed1.key, 'secret-key')
  assert.equal(parsed1.url, 'https://test.dev')
  assert.equal(parsed1.all, true)
  assert.equal(parsed1.format, 'json')
  assert.equal(parsed1.help, false)

  const parsed2 = parseCliArgs(['--help'])
  assert.equal(parsed2.help, true)
  assert.equal(parsed2.all, false)
  assert.equal(parsed2.format, 'text')
})

test('fetchShoppingList rejects keys shorter than 4 characters', async () => {
  await assert.rejects(
    () => fetchShoppingList({ url: 'https://test.dev', key: '123' }),
    /co najmniej 4 znaki/,
  )
})

test('fetchShoppingList handles 401, 503, and server errors', async () => {
  const mock401 = async () =>
    new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  await assert.rejects(
    () =>
      fetchShoppingList({
        url: 'https://test.dev',
        key: 'valid-key',
        fetchFn: mock401 as unknown as typeof fetch,
      }),
    /Błąd autoryzacji \(401\)/,
  )

  const mock503 = async () => new Response(JSON.stringify({ error: 'No DB' }), { status: 503 })
  await assert.rejects(
    () =>
      fetchShoppingList({
        url: 'https://test.dev',
        key: 'valid-key',
        fetchFn: mock503 as unknown as typeof fetch,
      }),
    /Serwis niedostępny \(503\)/,
  )

  const mock500 = async () =>
    new Response(JSON.stringify({ error: 'Internal failure' }), {
      status: 500,
      statusText: 'Internal Error',
    })
  await assert.rejects(
    () =>
      fetchShoppingList({
        url: 'https://test.dev',
        key: 'valid-key',
        fetchFn: mock500 as unknown as typeof fetch,
      }),
    /Błąd serwera \(500 Internal Error\) - Internal failure/,
  )
})

test('fetchShoppingList handles non-existent remote state', async () => {
  const mockEmpty = async () =>
    new Response(JSON.stringify({ exists: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  await assert.rejects(
    () =>
      fetchShoppingList({
        url: 'https://test.dev',
        key: 'valid-key',
        fetchFn: mockEmpty as unknown as typeof fetch,
      }),
    /Nie znaleziono zapisanego stanu/,
  )
})

test('fetchShoppingList successfully parses state and aggregates shopping items', async () => {
  const state = createInitialState()

  // Dodajemy ręczny produkt
  const customItem: ShoppingItem = {
    id: 'custom:kawa',
    name: 'Kawa ziarnista',
    amount: 1,
    unit: 'pack',
    category: 'other',
    isChecked: false,
    isCustom: true,
  }
  state.customItems = [customItem]

  // Odhaczamy jeden ze składników
  const firstIngredientKey = 'onion:pcs'
  state.checked[firstIngredientKey] = shoppingSignature({
    id: firstIngredientKey,
    name: 'Cebula',
    amount: 2,
    unit: 'pcs',
    category: 'produce',
    isChecked: true,
    isCustom: false,
  })

  let capturedHeaders: HeadersInit | undefined
  const mockSuccess = async (_url: string | URL | Request, init?: RequestInit) => {
    capturedHeaders = init?.headers
    return new Response(
      JSON.stringify({
        exists: true,
        state,
        updatedAt: 1731097800000,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const result = await fetchShoppingList({
    url: 'https://test.dev',
    key: 'household-sync-secret',
    fetchFn: mockSuccess as unknown as typeof fetch,
  })

  // Sprawdzamy nagłówek autoryzacji
  assert.equal(
    (capturedHeaders as Record<string, string>)['x-household-key'],
    'household-sync-secret',
  )

  // Sprawdzamy zawartość listy
  assert.ok(result.counts.total > 0)
  assert.equal(result.counts.checked, 1)
  assert.equal(result.counts.pending, result.counts.total - 1)
  assert.equal(result.items.length, result.counts.pending)
  assert.equal(result.updatedAt, 1731097800000)

  // Sprawdzamy obecność customowego elementu
  const foundCustom = result.items.find(i => i.id === 'custom:kawa')
  assert.ok(foundCustom)
  assert.equal(foundCustom.name, 'Kawa ziarnista')

  // Sprawdzamy, że odhaczona cebula NIE znajduje się w pendingItems
  const foundCheckedInPending = result.pendingItems.find(i => i.id === firstIngredientKey)
  assert.equal(foundCheckedInPending, undefined)

  // Gdy includeChecked: true, cebula powinna się znaleźć w items
  const resultAll = await fetchShoppingList({
    url: 'https://test.dev',
    key: 'household-sync-secret',
    includeChecked: true,
    fetchFn: mockSuccess as unknown as typeof fetch,
  })
  assert.equal(resultAll.items.length, resultAll.counts.total)
  const foundCheckedInAll = resultAll.items.find(i => i.id === firstIngredientKey)
  assert.ok(foundCheckedInAll)
  assert.equal(foundCheckedInAll.isChecked, true)
})

test('formatShoppingListText formats shopping list with categories and counts', () => {
  const sampleResult = {
    items: [
      {
        id: 'onion:pcs',
        name: 'Cebula',
        amount: 3,
        unit: 'pcs' as const,
        category: 'produce' as const,
        isChecked: false,
        isCustom: false,
      },
      {
        id: 'chicken-breast:g',
        name: 'Pierś z kurczaka',
        amount: 500,
        unit: 'g' as const,
        category: 'meat_fish_tofu' as const,
        isChecked: false,
        isCustom: false,
      },
    ],
    pendingItems: [
      {
        id: 'onion:pcs',
        name: 'Cebula',
        amount: 3,
        unit: 'pcs' as const,
        category: 'produce' as const,
        isChecked: false,
        isCustom: false,
      },
      {
        id: 'chicken-breast:g',
        name: 'Pierś z kurczaka',
        amount: 500,
        unit: 'g' as const,
        category: 'meat_fish_tofu' as const,
        isChecked: false,
        isCustom: false,
      },
    ],
    checkedItems: [],
    counts: { total: 2, pending: 2, checked: 0 },
    updatedAt: 1731097800000,
  }

  const text = formatShoppingListText(sampleResult)
  assert.match(text, /🛒 Lista zakupów Foodini/)
  assert.match(text, /Pozycje: 2 do kupienia, 0 odhaczonych/)
  assert.match(text, /🥦 Warzywa i owoce:/)
  assert.match(text, /• Cebula: 3 szt\./)
  assert.match(text, /🥩 Mięso, ryby i tofu:/)
  assert.match(text, /• Pierś z kurczaka: 500 g/)
})
