import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { categoryLabels, recipes, unitLabels } from '../src/data/recipes.ts'
import { aggregateShoppingList, formatAmount, shoppingSignature } from '../src/domain.ts'
import { parseSavedState } from '../src/storage.ts'
import type { ShopCategory, ShoppingItem } from '../src/types.ts'

export interface FetchShoppingListOptions {
  url: string
  key: string
  includeChecked?: boolean
  fetchFn?: typeof fetch
}

export interface ShoppingListOutput {
  items: ShoppingItem[]
  pendingItems: ShoppingItem[]
  checkedItems: ShoppingItem[]
  counts: {
    total: number
    pending: number
    checked: number
  }
  updatedAt?: number
}

const CATEGORY_ORDER: ShopCategory[] = [
  'produce',
  'dairy',
  'meat_fish_tofu',
  'bakery',
  'grains_pantry',
  'canned_condiments',
  'other',
]

const CATEGORY_ICONS: Record<ShopCategory, string> = {
  produce: '🥦',
  dairy: '🧀',
  meat_fish_tofu: '🥩',
  bakery: '🥖',
  grains_pantry: '🌾',
  canned_condiments: '🥫',
  other: '🛒',
}

export function tryLoadEnv(): void {
  const currentDir = process.cwd()
  const scriptDir = fileURLToPath(new URL('.', import.meta.url))
  const candidatePaths = [
    resolve(currentDir, '.env'),
    resolve(currentDir, 'foodini-ui', '.env'),
    resolve(scriptDir, '..', '.env'),
    resolve(scriptDir, '../..', '.env'),
  ]

  for (const envPath of candidatePaths) {
    if (existsSync(envPath)) {
      try {
        process.loadEnvFile(envPath)
        break
      } catch {
        // Ignoruj błędy parsowania .env
      }
    }
  }
}

export function normalizeSyncUrl(rawUrl: string): string {
  let trimmed = rawUrl.trim()
  if (!trimmed) {
    throw new Error('Adres URL synchronizacji nie może być pusty.')
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    if (trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1')) {
      trimmed = `http://${trimmed}`
    } else {
      trimmed = `https://${trimmed}`
    }
  }

  const parsed = new URL(trimmed)
  if (!parsed.pathname.endsWith('/api/sync')) {
    const basePath = parsed.pathname.replace(/\/+$/, '')
    parsed.pathname = basePath ? `${basePath}/api/sync` : '/api/sync'
  }

  return parsed.toString()
}

export async function fetchShoppingList(
  options: FetchShoppingListOptions,
): Promise<ShoppingListOutput> {
  const { url, key, includeChecked = false, fetchFn = globalThis.fetch } = options

  const trimmedKey = key.trim()
  if (!trimmedKey || trimmedKey.length < 4) {
    throw new Error('Klucz synchronizacji gospodarstwa musi mieć co najmniej 4 znaki.')
  }

  const endpoint = normalizeSyncUrl(url)

  let response: Response
  try {
    response = await fetchFn(endpoint, {
      method: 'GET',
      headers: {
        'x-household-key': trimmedKey,
        Accept: 'application/json',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Nie udało się połączyć z serwerem (${endpoint}): ${message}`, { cause: err })
  }

  if (response.status === 401) {
    throw new Error(
      'Błąd autoryzacji (401): Klucz gospodarstwa jest nieprawidłowy lub nie ma dostępu.',
    )
  }

  if (response.status === 503) {
    throw new Error(
      'Serwis niedostępny (503): Baza Cloudflare D1 nie jest podpięta w Pages Functions.',
    )
  }

  if (!response.ok) {
    let errorDetail = ''
    try {
      const errJson = (await response.json()) as { error?: string }
      if (errJson?.error) errorDetail = ` - ${errJson.error}`
    } catch {
      // Ignoruj błąd parsowania JSON odpowiedzi o błędzie
    }
    throw new Error(`Błąd serwera (${response.status} ${response.statusText})${errorDetail}`)
  }

  const data = (await response.json()) as {
    exists: boolean
    state?: unknown
    updatedAt?: number
  }

  if (!data.exists || !data.state) {
    throw new Error(
      'Nie znaleziono zapisanego stanu dla podanego klucza gospodarstwa. Upewnij się, że plan został zapisany i zsynchronizowany w aplikacji.',
    )
  }

  const saved = parseSavedState(JSON.stringify(data.state))

  const generatedItems = aggregateShoppingList(saved.plan, recipes).map(item => ({
    ...item,
    isChecked: saved.checked[item.id] === shoppingSignature(item),
  }))

  const customItems = saved.customItems.map(item => ({
    ...item,
    isChecked: Boolean(item.isChecked),
  }))

  const allItems: ShoppingItem[] = [...generatedItems, ...customItems]
  const pendingItems = allItems.filter(item => !item.isChecked)
  const checkedItems = allItems.filter(item => item.isChecked)

  return {
    items: includeChecked ? allItems : pendingItems,
    pendingItems,
    checkedItems,
    counts: {
      total: allItems.length,
      pending: pendingItems.length,
      checked: checkedItems.length,
    },
    updatedAt: data.updatedAt,
  }
}

export function formatShoppingListText(result: ShoppingListOutput, includeChecked = false): string {
  const lines: string[] = []

  lines.push('🛒 Lista zakupów Foodini')
  lines.push(
    `Pozycje: ${result.counts.pending} do kupienia, ${result.counts.checked} odhaczonych (łącznie: ${result.counts.total})`,
  )

  if (result.updatedAt) {
    const formattedDate = new Date(result.updatedAt).toLocaleString('pl-PL')
    lines.push(`Ostatnia synchronizacja: ${formattedDate}`)
  }
  lines.push('')

  const itemsToDisplay = includeChecked ? result.items : result.pendingItems

  if (itemsToDisplay.length === 0) {
    lines.push('Wszystkie produkty z listy zostały już kupione! 🎉')
    return lines.join('\n')
  }

  for (const category of CATEGORY_ORDER) {
    const categoryItems = itemsToDisplay.filter(item => item.category === category)
    if (categoryItems.length === 0) continue

    const icon = CATEGORY_ICONS[category] ?? '📦'
    const label = categoryLabels[category] ?? category
    lines.push(`${icon} ${label}:`)

    for (const item of categoryItems) {
      const unitLabel = unitLabels[item.unit] ?? item.unit
      const amountStr = formatAmount(item.amount)
      const checkMark = item.isChecked ? '✓ ' : '• '
      const customBadge = item.isCustom ? ' (dodany ręcznie)' : ''
      const checkedBadge = item.isChecked ? ' [KUPIONE]' : ''
      lines.push(
        `  ${checkMark}${item.name}: ${amountStr} ${unitLabel}${customBadge}${checkedBadge}`,
      )
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}

export function parseCliArgs(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      url: { type: 'string', short: 'u' },
      key: { type: 'string', short: 'k' },
      format: { type: 'string', short: 'f', default: 'text' },
      all: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: false,
  })

  return {
    url: values.url as string | undefined,
    key: values.key as string | undefined,
    format: (values.format as string | undefined) ?? 'text',
    all: Boolean(values.all),
    help: Boolean(values.help),
  }
}

function printHelp(): void {
  console.log(`
Użycie:
  npm run shopping-list [opcje]

Opcje:
  -u, --url <url>      Adres URL instancji Foodini (np. https://foodini.pages.dev)
  -k, --key <klucz>    Klucz synchronizacji gospodarstwa (min. 4 znaki)
  -f, --format <typ>   Format wyjścia: 'text' (domyślny) lub 'json'
      --all            Pokaż wszystkie pozycje (w tym już odhaczone jako kupione)
  -h, --help           Wyświetl tę pomoc

Zmienne środowiskowe (.env lub eksportowane w terminalu):
  FOODINI_SYNC_URL     Domyślny adres URL instancji Foodini
  FOODINI_SYNC_KEY     Domyślny klucz synchronizacji gospodarstwa

Przykłady:
  npm run shopping-list -- -k moj-klucz -u https://foodini.pages.dev
  npm run shopping-list -- --format json
  npm run shopping-list -- --all
`)
}

export async function runCli(args: string[] = process.argv.slice(2)): Promise<void> {
  tryLoadEnv()
  const cliOptions = parseCliArgs(args)

  if (cliOptions.help) {
    printHelp()
    return
  }

  const url = cliOptions.url || process.env.FOODINI_SYNC_URL
  const key = cliOptions.key || process.env.FOODINI_SYNC_KEY

  if (!url || !key) {
    console.error('❌ Błąd: Brak adresu URL lub klucza synchronizacji.\n')
    if (!url)
      console.error('  • Brak adresu URL: podaj --url lub ustaw FOODINI_SYNC_URL w pliku .env')
    if (!key) console.error('  • Brak klucza: podaj --key lub ustaw FOODINI_SYNC_KEY w pliku .env')
    console.error('\nWpisz "npm run shopping-list -- --help" aby zobaczyć instrukcję.')
    process.exit(1)
  }

  try {
    const result = await fetchShoppingList({
      url,
      key,
      includeChecked: cliOptions.all,
    })

    if (cliOptions.format === 'json') {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(formatShoppingListText(result, cliOptions.all))
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`❌ Błąd: ${message}`)
    process.exit(1)
  }
}

// Uruchom tylko gdy plik jest wywoływany bezpośrednio jako skrypt CLI
const isDirectExecution =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isDirectExecution) {
  runCli().catch(err => {
    console.error('Nieoczekiwany błąd:', err)
    process.exit(1)
  })
}
