import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from 'playwright'
import {
  calculateRequiredQuantity,
  dismissAllPopups,
  dismissModalsIfPresent,
  findMappingsFilePath,
  loadMappings,
  mapConcurrent,
  setupPagePopupHandlers,
  type FriscoProduct,
  type ProductMapping,
} from '../scripts/frisco-browser.ts'
import type { ShoppingItem } from '../src/types.ts'

test('calculateRequiredQuantity uses mapping packageAmount when provided', () => {
  const item: ShoppingItem = {
    id: 'garlic:clove',
    name: 'Czosnek',
    amount: 12,
    unit: 'clove',
    category: 'produce',
    ingredientId: 'garlic',
    isChecked: false,
    isCustom: false,
  }
  const mapping: ProductMapping = {
    name: 'Czosnek',
    preferredQuery: 'czosnek 1 główka',
    packageAmount: 10,
  }
  const qty = calculateRequiredQuantity(item, mapping)
  assert.equal(qty, 2)
})

test('calculateRequiredQuantity scales pieces when product has multi-piece packaging', () => {
  const item: ShoppingItem = {
    id: 'zucchini:pcs',
    name: 'Cukinia',
    amount: 4,
    unit: 'pcs',
    category: 'produce',
    ingredientId: 'zucchini',
    isChecked: false,
    isCustom: false,
  }
  const product: FriscoProduct = {
    id: '4116',
    name: 'FRISCO FRESH Cukinia zielona 2-3 szt. (680g-1020g)',
    price: '6,79 zł',
    url: 'https://www.frisco.pl/pid,4116',
    isAvailable: true,
  }
  const qty = calculateRequiredQuantity(item, undefined, product)
  // avg is 2.5, 4 / 2.5 = 1.6 -> ceil is 2
  assert.equal(qty, 2)
})

test('calculateRequiredQuantity scales clove unit into garlic heads', () => {
  const item: ShoppingItem = {
    id: 'garlic:clove',
    name: 'Czosnek',
    amount: 15,
    unit: 'clove',
    category: 'produce',
    ingredientId: 'garlic',
    isChecked: false,
    isCustom: false,
  }
  const product: FriscoProduct = {
    id: '144773',
    name: 'FRISCO FRESH Czosnek 1 główka',
    price: '1,99 zł',
    url: 'https://www.frisco.pl/pid,144773',
    isAvailable: true,
  }
  const qty = calculateRequiredQuantity(item, undefined, product)
  // 15 cloves / 10 = 1.5 -> ceil is 2
  assert.equal(qty, 2)
})

test('calculateRequiredQuantity scales gram weight according to product package weight', () => {
  const item: ShoppingItem = {
    id: 'mushrooms:g',
    name: 'Pieczarki',
    amount: 600,
    unit: 'g',
    category: 'produce',
    ingredientId: 'button-mushrooms',
    isChecked: false,
    isCustom: false,
  }
  const product: FriscoProduct = {
    id: '102645',
    name: 'Pieczarki tacka 250g',
    price: '13,89 zł',
    url: 'https://www.frisco.pl/pid,102645',
    isAvailable: true,
  }
  const qty = calculateRequiredQuantity(item, undefined, product)
  // 600 / 250 = 2.4 -> ceil is 3
  assert.equal(qty, 3)
})

test('loadMappings loads valid mappings from repository', () => {
  const filePath = findMappingsFilePath()
  assert.ok(filePath.length > 0)

  const mappings = loadMappings()
  assert.ok(typeof mappings === 'object')
  assert.ok(mappings['canned-chickpeas'])
  assert.equal(mappings['canned-chickpeas'].name, 'Ciecierzyca konserwowa')
})

test('dismissAllPopups clicks cookie, postal code, and promotional popups', async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.setContent(`
      <div id="cookie-modal" class="cookies-consents-modal">
        <button class="cta" onclick="this.parentElement.remove()">Akceptuję</button>
      </div>
      <div id="postal-modal" class="modal-new">
        <div class="modal-new_title">Kod pocztowy dostawy</div>
        <input id="postcode" name="postcode" />
        <button onclick="this.parentElement.remove()">Gotowe!</button>
      </div>
      <div id="promo-modal" class="modal-new">
        <button class="modal-new_close" onclick="this.parentElement.remove()">X</button>
      </div>
      <button id="target-btn">Do koszyka</button>
    `)

    await dismissAllPopups(page)

    assert.equal(await page.locator('#cookie-modal').isVisible(), false)
    assert.equal(await page.locator('#postal-modal').isVisible(), false)
    assert.equal(await page.locator('#promo-modal').isVisible(), false)
    assert.equal(await page.locator('#target-btn').isVisible(), true)

    // dismissModalsIfPresent should delegate to dismissAllPopups
    assert.equal(typeof dismissModalsIfPresent, 'function')
    assert.equal(typeof setupPagePopupHandlers, 'function')
  } finally {
    await browser.close()
  }
})

test('mapConcurrent executes tasks with bounded concurrency and preserves order', async () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  let active = 0
  let maxActive = 0

  const results = await mapConcurrent(items, 3, async n => {
    active++
    if (active > maxActive) maxActive = active
    await new Promise(r => setTimeout(r, 10))
    active--
    return n * 2
  })

  assert.equal(maxActive <= 3, true)
  assert.deepEqual(results, [2, 4, 6, 8, 10, 12, 14, 16, 18, 20])
})
