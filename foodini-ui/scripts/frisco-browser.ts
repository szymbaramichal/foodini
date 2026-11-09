import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium, type BrowserContext, type Page } from 'playwright'
import { fetchShoppingList, tryLoadEnv } from './get-shopping-list.ts'
import type { ShoppingItem } from '../src/types.ts'

export interface FriscoProduct {
  id: string
  name: string
  brand?: string
  price: string
  pricePerUnit?: string
  packageSize?: string
  url: string
  isAvailable: boolean
}

export interface FriscoSessionStatus {
  isLoggedIn: boolean
  userLabel?: string
  postalCode?: string
  cartCount: number
  cartValue?: string
}

export interface ProductMapping {
  name: string
  preferredQuery: string
  packageUnit?: string
  packageAmount?: number
  productId?: string
}

export interface MappingsFile {
  mappings: Record<string, ProductMapping>
}

export interface PrepareCartResult {
  success: boolean
  addedProducts: Array<{
    name: string
    quantity: number
    price: string
    url: string
    ingredientId?: string
  }>
  ambiguities: Array<{
    ingredientId?: string
    ingredientName: string
    requiredAmount: string
    candidates: Array<{ name: string; price: string; url: string }>
  }>
  notFound: Array<{
    ingredientId?: string
    name: string
    amount: string
  }>
  cartSummary: {
    cartCount: number
    cartValue: string
    postalCode?: string
  }
}

export const DEFAULT_PROFILE_DIR = resolve(homedir(), '.foodini-frisco-profile')

export function getProfileDir(customPath?: string): string {
  const target = customPath || process.env.FRISCO_PROFILE_DIR || DEFAULT_PROFILE_DIR
  if (!existsSync(target)) {
    mkdirSync(target, { recursive: true })
  }
  return target
}

export function findMappingsFilePath(): string {
  const candidates = [
    resolve(process.cwd(), '.agents/skills/frisco-shopper/resources/mappings.json'),
    resolve(process.cwd(), '../.agents/skills/frisco-shopper/resources/mappings.json'),
    resolve(
      fileURLToPath(
        new URL('../../.agents/skills/frisco-shopper/resources/mappings.json', import.meta.url),
      ),
    ),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return candidates[0]
}

export function loadMappings(): Record<string, ProductMapping> {
  const path = findMappingsFilePath()
  if (!existsSync(path)) return {}
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as MappingsFile
    return parsed.mappings || {}
  } catch {
    return {}
  }
}

export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let currentIndex = 0
  const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++
      results[idx] = await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return results
}

export function saveMapping(ingredientId: string, mapping: ProductMapping): void {
  const path = findMappingsFilePath()
  try {
    const current = loadMappings()
    current[ingredientId] = mapping
    const dir = resolve(path, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(path, JSON.stringify({ mappings: current }, null, 2), 'utf-8')
  } catch {
    // Ignoruj błędy zapisu mapowań
  }
}

export async function launchFriscoContext(options: {
  headless?: boolean
  profileDir?: string
}): Promise<BrowserContext> {
  const profile = getProfileDir(options.profileDir)

  const context = await chromium.launchPersistentContext(profile, {
    headless: options.headless ?? true,
    viewport: { width: 1280, height: 800 },
    locale: 'pl-PL',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled'],
  })

  const registerHandlers = (p: Page) => {
    void setupPagePopupHandlers(p).catch(() => {})
  }
  context.pages().forEach(registerHandlers)
  context.on('page', registerHandlers)

  // Maskowanie automatyzacji w DOM
  try {
    await context.addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      } catch {
        // Ignoruj błędy nadpisywania właściwości
      }
    })
  } catch {
    // Ignoruj błędy rejestracji skryptu init
  }

  return context
}

export async function setupPagePopupHandlers(page: Page): Promise<void> {
  try {
    // 1. Zgody cookies
    await page.addLocatorHandler(
      page
        .locator(
          'button:has-text("Akceptuję"), button:has-text("Akceptuj"), #onetrust-accept-btn-handler, .cookies-consents-modal button.cta',
        )
        .first(),
      async loc => {
        await loc
          .click({ force: true })
          .catch(() => loc.evaluate(el => (el as HTMLElement).click()))
      },
    )

    // 2. Modal kodu pocztowego
    await page.addLocatorHandler(
      page
        .locator('.modal-new:has-text("Kod pocztowy"), #modal-wrapper:has-text("Kod pocztowy")')
        .first(),
      async modal => {
        const input = modal.locator('input[name="postcode"], input#postcode').first()
        if (await input.isVisible().catch(() => false)) {
          const code = (process.env.FRISCO_POSTCODE || '03-840').replace('-', '')
          await input.fill(code).catch(() => {})
          const btn = modal
            .locator(
              'button:has-text("Gotowe!"), button:has-text("Zatwierdź"), button:has-text("Dalej")',
            )
            .first()
          await btn.click({ force: true }).catch(() => {})
        }
        const close = modal.locator('button.modal-new_close, .modal-new_close').first()
        await close.click({ force: true }).catch(() => {})
      },
    )

    // 3. Modale promocyjne i nakładki Salesmanago
    await page.addLocatorHandler(
      page
        .locator(
          'button.modal-new_close, .modal-new_close, #bhr-items, .bhr-iframe-holder--custom, iframe[src*="salesmanago"]',
        )
        .first(),
      async loc => {
        await loc.click({ force: true }).catch(() => loc.evaluate(el => el.remove()))
      },
    )
  } catch {
    // Ignoruj brak wsparcia rejestracji handlerów
  }
}

export async function dismissAllPopups(page: Page): Promise<void> {
  const dismissSelectors = [
    'button:has-text("Akceptuję")',
    'button:has-text("Akceptuj")',
    '.cookies-consents-modal button.cta',
    '#onetrust-accept-btn-handler',
    '.modal-new:has-text("Kod pocztowy") button:has-text("Gotowe!")',
    '.modal-new:has-text("Kod pocztowy") button:has-text("Zatwierdź")',
    'button.modal-new_close',
    '.modal-new_close',
    'button[aria-label*="Zamknij" i]',
    'button:has-text("Nie teraz")',
    'button:has-text("Pomiń")',
  ]

  for (const sel of dismissSelectors) {
    const loc = page.locator(sel)
    const count = await loc.count().catch(() => 0)
    for (let i = 0; i < count; i++) {
      await loc
        .nth(i)
        .click({ force: true })
        .catch(() => {})
    }
  }

  // Usunięcie blokujących nakładek
  await page
    .evaluate(() => {
      document
        .querySelectorAll(
          '.modal-new_overlay, .modal-backdrop, #bhr-items, .bhr-iframe-holder--custom, .cookies-consents-modal',
        )
        .forEach(el => {
          if (
            el.id === 'bhr-items' ||
            el.classList.contains('bhr-iframe-holder--custom') ||
            el.classList.contains('cookies-consents-modal') ||
            !el.querySelector('.modal-new_content, input, button')
          ) {
            el.remove()
          }
        })
      if (document.body) {
        document.body.style.overflow = 'auto'
        document.body.style.pointerEvents = 'auto'
      }
    })
    .catch(() => {})
}

export async function dismissModalsIfPresent(page: Page): Promise<void> {
  return dismissAllPopups(page)
}

export async function checkSessionStatus(page: Page): Promise<FriscoSessionStatus> {
  const cookies = await page.context().cookies('https://www.frisco.pl')
  const sessionCookie = cookies.find(c => c.name === 'sessionIdN' && c.value.length > 0)
  const userCookie = cookies.find(c => c.name === 'userIdN' && c.value.length > 0)
  const hasSession = Boolean(sessionCookie && userCookie)

  if (hasSession && sessionCookie && userCookie && page.url().includes('frisco.pl')) {
    const cartInfo = await getCartApi(page, userCookie.value, sessionCookie.value)
    if (cartInfo) {
      return {
        isLoggedIn: true,
        postalCode: cartInfo.postalCode,
        cartCount: cartInfo.cartCount,
        cartValue: cartInfo.cartValue,
      }
    }
  }

  if (page.url() === 'about:blank' || !page.url().includes('frisco.pl')) {
    await page.goto('https://www.frisco.pl', { waitUntil: 'domcontentloaded' })
    await dismissAllPopups(page)
  }

  const refreshedCookies = await page.context().cookies('https://www.frisco.pl')
  const refreshedSession = refreshedCookies.find(c => c.name === 'sessionIdN' && c.value.length > 0)
  const refreshedUser = refreshedCookies.find(c => c.name === 'userIdN' && c.value.length > 0)
  if (refreshedSession && refreshedUser) {
    const cartInfo = await getCartApi(page, refreshedUser.value, refreshedSession.value)
    if (cartInfo) {
      return {
        isLoggedIn: true,
        postalCode: cartInfo.postalCode,
        cartCount: cartInfo.cartCount,
        cartValue: cartInfo.cartValue,
      }
    }
  }

  const hasSessionCookie = refreshedCookies.some(
    c => (c.name.startsWith('sessionId') || c.name === 'sid_customer') && c.value.length > 0,
  )

  const bodyText = await page
    .locator('body')
    .innerText()
    .catch(() => '')
  const isLoggedIn =
    hasSessionCookie || bodyText.includes('Moje konto') || bodyText.includes('Wyloguj')

  const postalCode = bodyText.match(/\b\d{2}-\d{3}\b/)?.[0]
  const cartValue =
    bodyText.match(/Mój koszyk\s*\n\s*(\d+,\d{2}\s*zł)/)?.[1] ||
    bodyText.match(/(\d+,\d{2}\s*zł)/)?.[1] ||
    '0,00 zł'
  let cartCount = 0

  const countBadge = page
    .locator('[class*="cart-badge"], [class*="badge"], [data-qa*="cart-count"]')
    .first()
  if (await countBadge.isVisible({ timeout: 800 }).catch(() => false)) {
    const raw = await countBadge.innerText().catch(() => '0')
    const parsed = parseInt(raw, 10)
    if (!isNaN(parsed)) cartCount = parsed
  }

  return { isLoggedIn, postalCode, cartCount, cartValue }
}

export async function autoLoginWithCredentials(
  page: Page,
  email?: string,
  pass?: string,
): Promise<boolean> {
  tryLoadEnv()
  const userEmail = email || process.env.FRISCO_EMAIL
  const userPass = pass || process.env.FRISCO_PASSWORD

  if (!userEmail || !userPass) {
    console.warn('⚠️ Brak FRISCO_EMAIL lub FRISCO_PASSWORD w .env – kontynuuję jako gość.')
    return false
  }

  const initialCookies = await page.context().cookies('https://www.frisco.pl')
  if (initialCookies.some(c => c.name === 'sessionIdN' && c.value.length > 0)) {
    console.log('✅ Użytkownik jest już zalogowany.')
    return true
  }

  console.log(`🔑 Logowanie do Frisco.pl jako ${userEmail}...`)
  await page.goto('https://www.frisco.pl/login', { waitUntil: 'domcontentloaded' })
  await dismissAllPopups(page)

  if (!page.url().includes('/login')) {
    console.log('✅ Użytkownik jest już zalogowany.')
    return true
  }

  const emailInput = page.locator('input[name="email"], #email').first()
  const passInput = page.locator('input[name="password"], #password').first()

  await emailInput.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  await dismissAllPopups(page)

  await emailInput.fill(userEmail)
  await passInput.fill(userPass)

  const loginSubmitBtn = page
    .locator(
      'button:has-text("Zaloguj"), button.cta:has-text("Zaloguj"), form button[type="submit"]',
    )
    .first()
  await loginSubmitBtn
    .click({ force: true, timeout: 5000 })
    .catch(() => loginSubmitBtn.evaluate(el => (el as HTMLElement).click()))

  // Szybkie oczekiwanie na ciasteczko autoryzacji (max 6 sekund, sprawdzane co 200 ms)
  for (let i = 0; i < 30; i++) {
    const cookies = await page.context().cookies('https://www.frisco.pl')
    if (cookies.some(c => c.name === 'sessionIdN' && c.value.length > 0)) {
      await dismissAllPopups(page)
      return true
    }
    await page.waitForTimeout(200)
  }

  await dismissAllPopups(page)
  const status = await checkSessionStatus(page)
  return status.isLoggedIn
}

export async function searchFriscoProducts(
  page: Page,
  query: string,
  limit = 5,
): Promise<FriscoProduct[]> {
  const searchUrl = `https://www.frisco.pl/q,${encodeURIComponent(query)}/stn,searchResults`
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' })
  await dismissAllPopups(page)

  await page
    .locator('.product-box-layout, .product-box_holder, .empty-search-results, .c-empty-state')
    .first()
    .waitFor({ state: 'visible', timeout: 3500 })
    .catch(() => {})

  return page.evaluate(maxCount => {
    const results: FriscoProduct[] = []
    const seen = new Set<string>()
    const boxes = Array.from(document.querySelectorAll('.product-box-layout, .product-box_holder'))

    for (const box of boxes) {
      const link = box.querySelector('a[href*="/pid,"]') as HTMLAnchorElement | null
      if (!link) continue

      const href = link.getAttribute('href') || ''
      const pidMatch = href.match(/\/pid,(\d+)\//)
      if (!pidMatch || seen.has(pidMatch[1])) continue
      const pid = pidMatch[1]
      seen.add(pid)

      const boxText = (box as HTMLElement).innerText || ''
      const lines = boxText
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
      if (boxText.includes('Przydatny do') && lines.length < 3) continue

      const name = lines[1] || lines[0] || link.getAttribute('title') || 'Produkt Frisco'
      const brand = lines[0] || undefined
      const priceLine = lines.find(l => l.includes('zł') && !l.includes('/')) || 'Cena nieznana'
      const unitPriceLine = lines.find(l => l.includes('zł/') || l.includes('zł /')) || undefined
      const isAvailable =
        !boxText.toLowerCase().includes('niedostępny') && boxText.includes('Do koszyka')

      results.push({
        id: pid,
        name: brand && !name.includes(brand) ? `${brand} ${name}` : name,
        brand,
        price: priceLine,
        pricePerUnit: unitPriceLine,
        url: href.startsWith('http') ? href : `https://www.frisco.pl${href}`,
        isAvailable,
      })

      if (results.length >= maxCount) break
    }
    return results
  }, limit)
}

export function calculateRequiredQuantity(
  item: ShoppingItem,
  mapping?: ProductMapping,
  product?: FriscoProduct,
): number {
  if (item.unit === 'pinch' || item.unit === 'tsp' || item.unit === 'tbsp') {
    return 1
  }

  if (mapping?.packageAmount && mapping.packageAmount > 0) {
    return Math.max(1, Math.ceil(item.amount / mapping.packageAmount))
  }

  const text = `${product?.name || ''} ${product?.packageSize || ''}`.toLowerCase()

  if (item.unit === 'clove' && text.includes('główk')) {
    return Math.max(1, Math.ceil(item.amount / 10))
  }

  if (item.unit === 'pcs') {
    const match = text.match(/(\d+)(?:-(\d+))?\s*szt/i)
    if (match) {
      const min = parseInt(match[1], 10)
      const max = match[2] ? parseInt(match[2], 10) : min
      const avg = (min + max) / 2
      if (avg > 0) return Math.max(1, Math.ceil(item.amount / avg))
    }
    return Math.max(1, Math.round(item.amount))
  }

  if (item.unit === 'g' || item.unit === 'ml') {
    const match = text.match(/(\d+)\s*(g|ml|kg|l)\b/i)
    if (match) {
      let pkgSize = parseInt(match[1], 10)
      const unit = match[2].toLowerCase()
      if (unit === 'kg' || unit === 'l') pkgSize *= 1000
      if (pkgSize > 0) return Math.max(1, Math.ceil(item.amount / pkgSize))
    }
  }

  return 1
}

export async function searchFriscoProductsApi(
  page: Page,
  userId: string,
  token: string,
  query: string,
  limit = 5,
): Promise<FriscoProduct[]> {
  try {
    const res = await page.request.get(
      `https://www.frisco.pl/app/commerce/api/v1/users/${userId}/offer/products/query?search=${encodeURIComponent(query)}&pageSize=${limit}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
    )
    if (!res.ok()) return []
    const data = (await res.json()) as {
      products?: Array<{
        productId: string
        product?: {
          name?: { pl?: string }
          brand?: string
          price?: { price?: number }
          grammage?: number
          unitOfMeasure?: string
          isAvailable?: boolean
        }
      }>
    }
    return (data.products || []).map(p => {
      const prod = p.product || {}
      const name = prod.name?.pl || 'Produkt Frisco'
      const brand = prod.brand
      const priceNum = prod.price?.price
      const price =
        typeof priceNum === 'number'
          ? `${priceNum.toFixed(2).replace('.', ',')} zł`
          : 'Cena nieznana'
      const packageSize = prod.grammage
        ? `${prod.grammage} ${prod.unitOfMeasure || ''}`.trim()
        : undefined
      return {
        id: p.productId,
        name: brand && !name.includes(brand) ? `${brand} ${name}` : name,
        brand,
        price,
        packageSize,
        url: `https://www.frisco.pl/pid,${p.productId}/stn,product`,
        isAvailable: prod.isAvailable ?? true,
      }
    })
  } catch {
    return []
  }
}

export async function getProductDetailsApi(
  page: Page,
  userId: string,
  token: string,
  productId: string,
): Promise<FriscoProduct | null> {
  try {
    const res = await page.request.get(
      `https://www.frisco.pl/app/commerce/api/v1/users/${userId}/offer/products/${productId}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
    )
    if (!res.ok()) return null
    const data = (await res.json()) as {
      productId: string
      name?: { pl?: string }
      brand?: string
      price?: { price?: number }
      grammage?: number
      unitOfMeasure?: string
      isAvailable?: boolean
    }
    const name = data.name?.pl || 'Produkt Frisco'
    const brand = data.brand
    const priceNum = data.price?.price
    const price =
      typeof priceNum === 'number' ? `${priceNum.toFixed(2).replace('.', ',')} zł` : 'Cena nieznana'
    const packageSize = data.grammage
      ? `${data.grammage} ${data.unitOfMeasure || ''}`.trim()
      : undefined
    return {
      id: data.productId,
      name: brand && !name.includes(brand) ? `${brand} ${name}` : name,
      brand,
      price,
      packageSize,
      url: `https://www.frisco.pl/pid,${data.productId}/stn,product`,
      isAvailable: data.isAvailable ?? true,
    }
  } catch {
    return null
  }
}

export async function updateCartApi(
  page: Page,
  userId: string,
  token: string,
  products: Array<{ productId: string; quantity: number }>,
): Promise<boolean> {
  try {
    const res = await page.request.put(
      `https://www.frisco.pl/app/commerce/api/v1/users/${userId}/cart`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: { products },
      },
    )
    return res.ok()
  } catch {
    return false
  }
}

export async function getCartApi(
  page: Page,
  userId: string,
  token: string,
): Promise<{
  cartCount: number
  cartValue: string
  postalCode?: string
  products: Array<{ productId: string; name: string; quantity: number; price: string }>
} | null> {
  try {
    const res = await page.request.get(
      `https://www.frisco.pl/app/commerce/api/v1/users/${userId}/cart`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      },
    )
    if (!res.ok()) return null
    const data = (await res.json()) as {
      pricing?: { total?: { _total?: number } }
      postcode?: string
      products?: Array<{
        productId: string
        quantity: number
        product?: {
          name?: { pl?: string }
          price?: { price?: number }
        }
      }>
    }
    const total = data.pricing?.total?._total ?? 0
    const totalFormatted = `${total.toFixed(2).replace('.', ',')} zł`
    const prods = (data.products || [])
      .filter(p => p.productId !== '157372')
      .map(p => {
        const priceNum = p.product?.price?.price
        return {
          productId: p.productId,
          name: p.product?.name?.pl || 'Produkt Frisco',
          quantity: p.quantity,
          price: typeof priceNum === 'number' ? `${priceNum.toFixed(2).replace('.', ',')} zł` : '',
        }
      })
    return {
      cartCount: prods.length,
      cartValue: totalFormatted,
      postalCode: data.postcode,
      products: prods,
    }
  } catch {
    return null
  }
}

export async function prepareCartFromShoppingList(options: {
  headless?: boolean
  profileDir?: string
}): Promise<PrepareCartResult> {
  tryLoadEnv()
  const syncUrl = process.env.FOODINI_SYNC_URL
  const syncKey = process.env.FOODINI_SYNC_KEY

  if (!syncUrl || !syncKey) {
    throw new Error(
      'Brak konfiguracji synchronizacji Foodini (FOODINI_SYNC_URL lub FOODINI_SYNC_KEY w .env).',
    )
  }

  console.log('📦 1. Pobieram listę zakupów z aplikacji Foodini...')
  const shoppingData = await fetchShoppingList({
    url: syncUrl,
    key: syncKey,
    includeChecked: false,
  })
  const pendingItems = shoppingData.pendingItems
  console.log(`📋 Znaleziono ${pendingItems.length} pozycji do kupienia.`)

  if (pendingItems.length === 0) {
    return {
      success: true,
      addedProducts: [],
      ambiguities: [],
      notFound: [],
      cartSummary: { cartCount: 0, cartValue: '0,00 zł' },
    }
  }

  console.log('🌐 2. Uruchamiam sesję przeglądarki Frisco...')
  const isHeadless = options.headless ?? true
  const context = await launchFriscoContext({
    headless: isHeadless,
    profileDir: options.profileDir,
  })
  const page = context.pages()[0] || (await context.newPage())

  try {
    let session = await checkSessionStatus(page)
    let cookies = await context.cookies('https://www.frisco.pl')
    let sessionCookie = cookies.find(c => c.name === 'sessionIdN' && c.value.length > 0)
    let userCookie = cookies.find(c => c.name === 'userIdN' && c.value.length > 0)

    if (!session.isLoggedIn || !sessionCookie || !userCookie) {
      console.log('🔐 Brak aktywnej sesji – wykonuję automatyczne logowanie...')
      const loggedIn = await autoLoginWithCredentials(page)
      if (!loggedIn) {
        throw new Error(
          '❌ Nie udało się zalogować do Frisco.pl. Upewnij się, że dane FRISCO_EMAIL i FRISCO_PASSWORD w .env są poprawne lub uruchom `npm run frisco login`.',
        )
      }
      session = await checkSessionStatus(page)
      cookies = await context.cookies('https://www.frisco.pl')
      sessionCookie = cookies.find(c => c.name === 'sessionIdN' && c.value.length > 0)
      userCookie = cookies.find(c => c.name === 'userIdN' && c.value.length > 0)
    } else {
      console.log('✅ Aktywna sesja użytkownika rozpoznana.')
    }

    const token = sessionCookie?.value
    const userId = userCookie?.value

    if (!token || !userId) {
      throw new Error(
        '❌ Brak tokenów autoryzacyjnych po zalogowaniu. Uruchom `npm run frisco login`, aby odświeżyć profil sesji.',
      )
    }

    console.log('⚡ Tryb hybrydowy API aktywny (równoległe przetwarzanie pozycji)...')
    const mappings = loadMappings()
    const addedProducts: PrepareCartResult['addedProducts'] = []
    const ambiguities: PrepareCartResult['ambiguities'] = []
    const notFound: PrepareCartResult['notFound'] = []

    console.log('\n🛒 3. Przetwarzam składniki i weryfikuję w API:')
    const itemResults = await mapConcurrent(pendingItems, 6, async item => {
      const mapping = item.ingredientId ? mappings[item.ingredientId] : undefined
      const cleanName = item.name.replace(/\(.*?\)/g, '').trim()
      const searchQuery = mapping?.preferredQuery || cleanName

      if (mapping?.productId) {
        const liveDetails = await getProductDetailsApi(page, userId, token, mapping.productId)
        const quantity = calculateRequiredQuantity(item, mapping, liveDetails || undefined)
        if (liveDetails?.isAvailable !== false) {
          return {
            status: 'added' as const,
            item,
            productId: mapping.productId,
            quantity,
            addedProduct: {
              ingredientId: item.ingredientId,
              name: liveDetails?.name || mapping.name || cleanName,
              quantity,
              price: liveDetails?.price || '',
              url: `https://www.frisco.pl/pid,${mapping.productId}/stn,product`,
            },
            log: `  • "${cleanName}" (${item.amount} ${item.unit}) [ID: ${mapping.productId}] -> ✅ ${quantity}x "${liveDetails?.name || mapping.name}" (${liveDetails?.price || ''})`,
          }
        }
      }

      let results = await searchFriscoProductsApi(page, userId, token, searchQuery, 4)
      let available = results.filter(r => r.isAvailable)

      if (
        available.length === 0 &&
        mapping?.preferredQuery &&
        mapping.preferredQuery.toLowerCase() !== cleanName.toLowerCase()
      ) {
        results = await searchFriscoProductsApi(page, userId, token, cleanName, 4)
        available = results.filter(r => r.isAvailable)
      }

      if (available.length === 0) {
        return {
          status: 'not_found' as const,
          item,
          productId: '',
          quantity: 0,
          log: `  • Szukam: "${cleanName}" (${item.amount} ${item.unit}) -> ❌ BRAK WYNIKÓW`,
        }
      }

      const best = available[0]
      const quantity = calculateRequiredQuantity(item, mapping, best)
      const newMapping =
        item.ingredientId && !mappings[item.ingredientId]
          ? {
              ingredientId: item.ingredientId,
              mapping: {
                name: item.name,
                preferredQuery: searchQuery,
                productId: best.id,
              },
            }
          : undefined

      return {
        status: 'added' as const,
        item,
        productId: best.id,
        quantity,
        addedProduct: {
          ingredientId: item.ingredientId,
          name: best.name,
          quantity,
          price: best.price,
          url: best.url,
        },
        newMapping,
        log: `  • Szukam: "${cleanName}" (${item.amount} ${item.unit}) -> ✅ Znaleziono ${quantity}x "${best.name}" (${best.price})`,
      }
    })

    const productsToUpdate: Array<{ productId: string; quantity: number }> = []
    for (const res of itemResults) {
      console.log(res.log)
      if (res.newMapping) {
        saveMapping(res.newMapping.ingredientId, res.newMapping.mapping)
      }
      if (res.status === 'added' && res.addedProduct) {
        productsToUpdate.push({ productId: res.productId, quantity: res.quantity })
        addedProducts.push(res.addedProduct)
      } else if (res.status === 'not_found') {
        notFound.push({
          ingredientId: res.item.ingredientId,
          name: res.item.name,
          amount: `${res.item.amount} ${res.item.unit}`,
        })
      }
    }

    if (productsToUpdate.length > 0) {
      process.stdout.write(
        `\n🚀 Aktualizuję koszyk na Frisco (${productsToUpdate.length} pozycji)... `,
      )
      const updated = await updateCartApi(page, userId, token, productsToUpdate)
      if (updated) {
        console.log('✅ Zaktualizowano!')
      } else {
        console.log('⚠️ Błąd aktualizacji API, ponawiam próbę...')
      }
    }

    if (!isHeadless) {
      await page.goto('https://www.frisco.pl/stn,cart', { waitUntil: 'domcontentloaded' })
      await dismissAllPopups(page)
    }

    const cartInfo = await getCartApi(page, userId, token)
    return {
      success: true,
      addedProducts,
      ambiguities,
      notFound,
      cartSummary: {
        cartCount: cartInfo?.cartCount || addedProducts.length,
        cartValue: cartInfo?.cartValue || '0,00 zł',
        postalCode: cartInfo?.postalCode || session.postalCode,
      },
    }
  } finally {
    await context.close()
  }
}

export async function runCli(args: string[] = process.argv.slice(2)): Promise<void> {
  tryLoadEnv()
  const { values, positionals } = parseArgs({
    args,
    options: {
      profile: { type: 'string', short: 'p' },
      headless: { type: 'boolean' },
      headful: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  })

  const isHeadless = values.headful ? false : (values.headless ?? true)
  const command = positionals[0]
  if (values.help || !command) {
    console.log(`
Użycie:
  npm run frisco <komenda> [opcje]

Dostępne komendy:
  prepare               Automatycznie pobiera listę z Foodini i przygotowuje cały koszyk na Frisco
  login                 Otwiera okno przeglądarki do jednorazowego zalogowania
  status                Sprawdza stan sesji, kod pocztowy i koszyk
  search <fraza>        Wyszukuje produkty na Frisco.pl

Opcje:
  --headful             Otwiera przeglądarkę w widocznym oknie graficznym (domyślnie headless)
  -p, --profile         Własna ścieżka do profilu przeglądarki
  -h, --help            Wyświetla pomoc
`)
    return
  }

  switch (command) {
    case 'prepare': {
      const result = await prepareCartFromShoppingList({
        headless: isHeadless,
        profileDir: values.profile,
      })
      console.log('\n─────────────────────────────────────────────────────────────────')
      console.log('🎉 PODSUMOWANIE KOSZYKA FRISCO:')
      console.log(`  • Dodano produktów: ${result.addedProducts.length}`)
      console.log(`  • Wartość koszyka: ${result.cartSummary.cartValue}`)
      console.log('  • Adres koszyka: https://www.frisco.pl/stn,cart')
      if (result.notFound.length > 0) {
        console.log(`  • Nie znaleziono pozycji (${result.notFound.length}):`)
        result.notFound.forEach(item => console.log(`    - ${item.name} (${item.amount})`))
      }
      console.log('─────────────────────────────────────────────────────────────────')
      process.exit(0)
      break
    }
    case 'login': {
      const profile = getProfileDir(values.profile)
      console.log(
        `\n🚀 Uruchamiam okno przeglądarki z profilem sesji:\n📁 Katalog profilu: ${profile}\n`,
      )
      const context = await launchFriscoContext({ headless: false, profileDir: values.profile })
      const page = context.pages()[0] || (await context.newPage())
      await page.goto('https://www.frisco.pl', { waitUntil: 'domcontentloaded' })
      await dismissAllPopups(page)
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      await rl.question('Naciśnij [ENTER], gdy zakończysz logowanie... ')
      rl.close()
      const status = await checkSessionStatus(page)
      console.log(status.isLoggedIn ? '✅ Zalogowano pomyślnie!' : '⚠️ Brak aktywnego logowania.')
      await context.close()
      break
    }
    case 'status': {
      console.log('⏳ Sprawdzam aktywną sesję Frisco...')
      const context = await launchFriscoContext({
        headless: isHeadless,
        profileDir: values.profile,
      })
      const page = context.pages()[0] || (await context.newPage())
      try {
        const status = await checkSessionStatus(page)
        console.log('\n📋 Status sesji Frisco:')
        console.log(`  • Zalogowany: ${status.isLoggedIn ? 'TAK ✅' : 'NIE ❌'}`)
        console.log(`  • Kod pocztowy: ${status.postalCode || 'Nieustawiony ⚠️'}`)
        console.log(`  • Wartość koszyka: ${status.cartValue || '0,00 zł'}`)
        console.log(`  • Pozycji w koszyku: ${status.cartCount}`)
      } finally {
        await context.close()
      }
      break
    }
    case 'search': {
      const query = positionals.slice(1).join(' ')
      if (!query.trim()) {
        console.error('❌ Podaj frazę do wyszukania.')
        process.exit(1)
      }
      const context = await launchFriscoContext({
        headless: isHeadless,
        profileDir: values.profile,
      })
      const page = context.pages()[0] || (await context.newPage())
      try {
        const products = await searchFriscoProducts(page, query, 5)
        console.log(`Znaleziono ${products.length} produktów:`)
        products.forEach((p, idx) => console.log(`[${idx + 1}] ${p.name} - ${p.price}`))
      } finally {
        await context.close()
      }
      break
    }
    default:
      console.error(`❌ Nieznana komenda: "${command}". Użyj --help.`)
      process.exit(1)
  }
}

const isDirectExecution =
  process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)
if (isDirectExecution) {
  runCli().catch(err => {
    console.error('❌ Błąd:', err)
    process.exit(1)
  })
}
