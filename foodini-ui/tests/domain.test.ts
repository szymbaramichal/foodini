import assert from 'node:assert/strict'
import test from 'node:test'
import { recipes } from '../src/data/recipes.ts'
import { aggregateShoppingList, filterRecipes, generatePlan, isBatchLocked, pickRecipe, replacePlanRecipe, retainCheckedItems, shoppingSignature, togglePlanLock } from '../src/domain.ts'
import { createInitialState, parseSavedState } from '../src/storage.ts'
import type { Recipe } from '../src/types.ts'

const settings = { duration: 5, people: 2, batch: true }
const fixedRandom = () => 0

test('search finds Polish names without accents and also searches ingredients', () => {
  assert.equal(filterRecipes(recipes, 'wolowy', [], '')[0]?.id, 'beef-stew')
  assert.equal(filterRecipes(recipes, 'REKAWA', [], '')[0]?.id, 'roast-pork')
  assert.equal(filterRecipes(recipes, 'maslo orzechowe', [], '')[0]?.id, 'konjac-chicken')
  assert.equal(filterRecipes(recipes, '  CIECIERZYCY  ', [], '').length, 1)
})

test('selected tags use AND matching and meal types are respected', () => {
  assert.deepEqual(filterRecipes(recipes, '', ['quick', 'high-protein'], 'dinner').map(recipe => recipe.id), ['konjac-chicken'])
  assert.equal(filterRecipes(recipes, '', ['vegan', 'high-protein'], '').length, 0)
  assert.equal(filterRecipes(recipes, '', [], 'breakfast').length, 0)
})

test('random selection stays in the filtered pool and avoids the current recipe when possible', () => {
  assert.equal(pickRecipe([], undefined, fixedRandom), undefined)
  assert.equal(pickRecipe([recipes[2]], undefined, fixedRandom)?.id, recipes[2].id)
  assert.equal(pickRecipe([recipes[0], recipes[1]], recipes[0].id, fixedRandom)?.id, recipes[1].id)
})

test('an odd plan ends with a single cooking day and counts batch portions once', () => {
  const plan = generatePlan([recipes[0]], settings, [], fixedRandom)
  assert.deepEqual(plan.map(day => day.isLeftoverDay), [false, true, false, true, false])
  assert.deepEqual(plan.map(day => day.servings), [4, 2, 4, 2, 2])
  const items = aggregateShoppingList(plan, recipes)
  assert.equal(items.find(item => item.ingredientId === 'canned-chickpeas')?.amount, 1200)
  assert.equal(items.find(item => item.ingredientId === 'brown-rice')?.amount, 750)
})

test('all supported plan settings preserve batch invariants and exactly cover the requested days', () => {
  for (let duration = 3; duration <= 7; duration++) {
    for (let people = 1; people <= 8; people++) {
      for (const batch of [false, true]) {
        const plan = generatePlan(recipes, { duration, people, batch }, [], fixedRandom)
        assert.equal(plan.length, duration)
        assert.equal(plan.filter(day => !day.isLeftoverDay).reduce((total, day) => total + day.servings, 0), duration * people)
        for (const [index, day] of plan.entries()) {
          assert.equal(day.dayIndex, index)
          if (day.isLeftoverDay) {
            assert.equal(plan[index - 1].coversDays, 2)
            assert.equal(plan[index - 1].recipeId, day.recipeId)
            assert.equal(plan[index - 1].servings, day.servings * 2)
          }
        }
        assert.doesNotThrow(() => parseSavedState(JSON.stringify({ version: 1, settings: { duration, people, batch }, plan, customItems: [], checked: {} })))
      }
    }
  }
})

test('locking a leftover protects its whole batch during regeneration and portion changes', () => {
  const original = generatePlan(recipes, settings, [], fixedRandom)
  const locked = togglePlanLock(original, 1)
  assert.equal(isBatchLocked(locked, 0), true)
  assert.equal(locked[1].isLocked, true)
  const next = generatePlan([recipes[3]], { duration: 6, people: 4, batch: false }, locked, fixedRandom)
  assert.deepEqual(next.slice(0, 2), locked.slice(0, 2))
  assert.ok(next.slice(2).every(day => day.recipeId === recipes[3].id && day.servings === 4))
  assert.throws(() => replacePlanRecipe(locked, 1, recipes[4].id), /odblokuj/)
})

test('locked batches cannot be cut off by a shorter duration', () => {
  const plan = togglePlanLock(generatePlan(recipes, { ...settings, duration: 6 }, [], fixedRandom), 4)
  assert.throws(() => generatePlan(recipes, settings, plan, fixedRandom), /odblokuj/)
})

test('new batches cannot overlap a preserved single-day lock', () => {
  const plan = togglePlanLock(generatePlan(recipes, { ...settings, batch: false }, [], fixedRandom), 1)
  const next = generatePlan(recipes, settings, plan, fixedRandom)
  assert.equal(next[0].coversDays, 1)
  assert.deepEqual(next[1], plan[1])
  assert.equal(next[2].coversDays, 2)
  assert.equal(next[3].isLeftoverDay, true)
})

test('replacing either day updates both batch references without changing portions', () => {
  const plan = generatePlan(recipes, settings, [], fixedRandom)
  const next = replacePlanRecipe(plan, 1, recipes[5].id)
  assert.equal(next[0].recipeId, recipes[5].id)
  assert.equal(next[1].recipeId, recipes[5].id)
  assert.equal(next[0].servings, 4)
  assert.equal(next[1].servings, 2)
  assert.deepEqual(next.slice(2), plan.slice(2))
  assert.equal(plan[0].recipeId, recipes[0].id)
})

test('ingredients with different units are kept separate while matching units are summed', () => {
  const recipe: Recipe = { ...recipes[0], id: 'test-recipe', basePortions: 2, ingredients: [
    { id: 'oil', name: 'Oliwa', amount: 10, unit: 'ml', category: 'canned_condiments' },
    { id: 'oil', name: 'Oliwa', amount: 1, unit: 'tbsp', category: 'canned_condiments' },
  ] }
  const plan = generatePlan([recipe], { duration: 3, people: 2, batch: false }, [], fixedRandom)
  const items = aggregateShoppingList(plan, [recipe])
  assert.equal(items.length, 2)
  assert.equal(items.find(item => item.unit === 'ml')?.amount, 30)
  assert.equal(items.find(item => item.unit === 'tbsp')?.amount, 3)
  assert.notEqual(items[0].id, items[1].id)
})

test('changed required quantities reset checks and unchanged quantities retain checks', () => {
  const plan = generatePlan([recipes[0]], settings, [], fixedRandom)
  const items = aggregateShoppingList(plan, recipes)
  const checked = Object.fromEntries(items.map(item => [item.id, shoppingSignature(item)]))
  assert.deepEqual(retainCheckedItems(plan, recipes, checked), checked)
  const biggerPlan = generatePlan([recipes[0]], { ...settings, people: 4 }, [], fixedRandom)
  assert.deepEqual(retainCheckedItems(biggerPlan, recipes, checked), {})
  assert.deepEqual(retainCheckedItems([], recipes, checked), {})
})

test('empty recipe pools and invalid portion settings fail with a clear message', () => {
  assert.throws(() => generatePlan([], settings), /Brak przepisów/)
  assert.throws(() => generatePlan(recipes, { ...settings, people: 0 }), /porcji/)
  assert.throws(() => generatePlan(recipes, { ...settings, duration: 2 }), /dni/)
  const plan = generatePlan([recipes[0]], settings)
  assert.throws(() => aggregateShoppingList(plan, [{ ...recipes[0], basePortions: 0 }]), /porcji/)
  assert.throws(() => aggregateShoppingList(plan, [{ ...recipes[0], basePortions: NaN }]), /porcji/)
  assert.throws(() => aggregateShoppingList(plan, []), /nieznany/)
})

test('saved state round-trips including custom items and check state', () => {
  const state = createInitialState()
  const item = aggregateShoppingList(state.plan, recipes)[0]
  state.checked[item.id] = shoppingSignature(item)
  state.customItems.push({ id: 'custom:test', name: 'Kawa', amount: 1, unit: 'pack', category: 'other', isCustom: true, isChecked: true })
  assert.deepEqual(parseSavedState(JSON.stringify(state)), state)
})

test('invalid storage cannot introduce unknown recipes, incomplete batches, or invalid units', () => {
  assert.throws(() => parseSavedState('{'))
  assert.throws(() => parseSavedState('null'))
  assert.throws(() => parseSavedState(JSON.stringify({ ...createInitialState(), version: 2 })))
  const unknownRecipe = createInitialState()
  unknownRecipe.plan[0].recipeId = 'unknown'
  assert.throws(() => parseSavedState(JSON.stringify(unknownRecipe)))
  const truncatedBatch = createInitialState()
  truncatedBatch.plan.pop()
  truncatedBatch.plan.pop()
  assert.throws(() => parseSavedState(JSON.stringify(truncatedBatch)))
  const invalidItem = { ...createInitialState(), customItems: [{ id: 'custom:x', name: 'Kawa', amount: 1, unit: '__proto__', category: 'other', isChecked: false, isCustom: true }] }
  assert.throws(() => parseSavedState(JSON.stringify(invalidItem)))
})

test('the seven seed recipes have valid quantities, identifiers, tags, and Polish instructions', () => {
  assert.equal(recipes.length, 7)
  assert.equal(new Set(recipes.map(recipe => recipe.id)).size, 7)
  for (const recipe of recipes) {
    assert.ok(recipe.basePortions > 0)
    assert.ok(recipe.instructions.length >= 4)
    assert.ok(recipe.ingredients.every(item => item.amount > 0))
    assert.equal(new Set(recipe.ingredients.map(item => `${item.id}:${item.unit}`)).size, recipe.ingredients.length)
    if (recipe.tags.includes('quick')) assert.ok(recipe.prepTimeMinutes <= 25)
    if (recipe.tags.includes('vegan')) assert.ok(recipe.tags.includes('vegetarian') && recipe.tags.includes('dairy-free'))
  }
})
