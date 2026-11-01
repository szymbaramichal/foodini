import assert from 'node:assert/strict'
import test from 'node:test'
import { recipes } from '../src/data/recipes.ts'
import {
  aggregateShoppingList,
  filterRecipes,
  generatePlan,
  isBatchLocked,
  pickRecipe,
  replacePlanMeal,
  retainCheckedItems,
  shoppingSignature,
  togglePlanLock,
} from '../src/domain.ts'
import { createInitialState, parseSavedState } from '../src/storage.ts'
import type { Recipe } from '../src/types.ts'

const settings = { duration: 5, people: 2, batch: true }
const fixedRandom = () => 0

test('search finds Polish names without accents and also searches ingredients', () => {
  assert.equal(filterRecipes(recipes, 'wolowy', [], '')[0]?.id, 'beef-stew')
  assert.equal(filterRecipes(recipes, 'REKAWA', [], '')[0]?.id, 'roast-pork')
  assert.equal(filterRecipes(recipes, 'maslo orzechowe', [], '')[0]?.id, 'konjac-chicken')
  assert.equal(filterRecipes(recipes, '  CIECIERZYCY  ', [], '').length, 2)
})

test('selected tags use AND matching and meal types are respected', () => {
  assert.deepEqual(
    filterRecipes(recipes, '', ['quick', 'high-protein'], 'dinner').map(recipe => recipe.id),
    ['konjac-chicken', 'chicken-garlic-salad'],
  )
  assert.equal(filterRecipes(recipes, '', ['vegan', 'high-protein'], '').length, 0)
  assert.ok(filterRecipes(recipes, '', [], 'lunch').every(recipe => recipe.mealType === 'lunch'))
  assert.ok(filterRecipes(recipes, '', [], 'dinner').every(recipe => recipe.mealType === 'dinner'))
})

test('random selection stays in the filtered pool and avoids the current recipe when possible', () => {
  assert.equal(pickRecipe([], undefined, fixedRandom), undefined)
  assert.equal(pickRecipe([recipes[2]], undefined, fixedRandom)?.id, recipes[2].id)
  assert.equal(pickRecipe([recipes[0], recipes[1]], recipes[0].id, fixedRandom)?.id, recipes[1].id)
})

test('an odd plan ends with a single cooking day and counts batch portions once', () => {
  const plan = generatePlan(recipes, settings, [], fixedRandom)
  assert.deepEqual(
    plan.map(day => day.lunch.isLeftoverDay),
    [false, true, false, true, false],
  )
  assert.deepEqual(
    plan.map(day => day.lunch.servings),
    [4, 2, 4, 2, 2],
  )
  assert.deepEqual(
    plan.map(day => day.dinner.isLeftoverDay),
    [false, true, false, true, false],
  )
  assert.deepEqual(
    plan.map(day => day.dinner.servings),
    [4, 2, 4, 2, 2],
  )
  const items = aggregateShoppingList(plan, recipes)
  assert.ok(items.length > 0)
})

test('all supported plan settings preserve batch invariants and exactly cover the requested days', () => {
  for (let duration = 3; duration <= 7; duration++) {
    for (let people = 1; people <= 8; people++) {
      for (const batch of [false, true]) {
        const plan = generatePlan(recipes, { duration, people, batch }, [], fixedRandom)
        assert.equal(plan.length, duration)
        assert.equal(
          plan
            .filter(day => !day.lunch.isLeftoverDay)
            .reduce((total, day) => total + day.lunch.servings, 0),
          duration * people,
        )
        assert.equal(
          plan
            .filter(day => !day.dinner.isLeftoverDay)
            .reduce((total, day) => total + day.dinner.servings, 0),
          duration * people,
        )
        for (const [index, day] of plan.entries()) {
          assert.equal(day.dayIndex, index)
          for (const mealType of ['lunch', 'dinner'] as const) {
            const slot = day[mealType]
            if (slot.isLeftoverDay) {
              assert.equal(plan[index - 1][mealType].coversDays, 2)
              assert.equal(plan[index - 1][mealType].recipeId, slot.recipeId)
              assert.equal(plan[index - 1][mealType].servings, slot.servings * 2)
            }
          }
        }
        assert.doesNotThrow(() =>
          parseSavedState(
            JSON.stringify({
              version: 2,
              settings: { duration, people, batch },
              plan,
              customItems: [],
              checked: {},
            }),
          ),
        )
      }
    }
  }
})

test('locking a leftover protects its whole batch during regeneration and portion changes', () => {
  const original = generatePlan(recipes, settings, [], fixedRandom)
  const locked = togglePlanLock(original, 1, 'lunch')
  assert.equal(isBatchLocked(locked, 0, 'lunch'), true)
  assert.equal(locked[1].lunch.isLocked, true)
  assert.equal(isBatchLocked(locked, 0, 'dinner'), false)
  const next = generatePlan(recipes, { duration: 6, people: 4, batch: false }, locked, fixedRandom)
  assert.deepEqual(
    next.slice(0, 2).map(d => d.lunch),
    locked.slice(0, 2).map(d => d.lunch),
  )
  assert.throws(() => replacePlanMeal(locked, 1, 'lunch', recipes[4].id), /odblokuj/)
})

test('locked batches cannot be cut off by a shorter duration', () => {
  const plan = togglePlanLock(
    generatePlan(recipes, { ...settings, duration: 6 }, [], fixedRandom),
    4,
    'lunch',
  )
  assert.throws(() => generatePlan(recipes, settings, plan, fixedRandom), /odblokuj/)
})

test('new batches cannot overlap a preserved single-day lock', () => {
  const plan = togglePlanLock(
    generatePlan(recipes, { ...settings, batch: false }, [], fixedRandom),
    1,
    'lunch',
  )
  const next = generatePlan(recipes, settings, plan, fixedRandom)
  assert.equal(next[0].lunch.coversDays, 1)
  assert.deepEqual(next[1].lunch, plan[1].lunch)
  assert.equal(next[2].lunch.coversDays, 2)
  assert.equal(next[3].lunch.isLeftoverDay, true)
})

test('replacing either day updates both batch references without changing portions', () => {
  const plan = generatePlan(recipes, settings, [], fixedRandom)
  const next = replacePlanMeal(plan, 1, 'lunch', recipes[1].id)
  assert.equal(next[0].lunch.recipeId, recipes[1].id)
  assert.equal(next[1].lunch.recipeId, recipes[1].id)
  assert.equal(next[0].lunch.servings, 4)
  assert.equal(next[1].lunch.servings, 2)
  assert.deepEqual(next.slice(2), plan.slice(2))
  assert.equal(plan[0].lunch.recipeId, recipes[0].id)
})

test('ingredients with different units are kept separate while matching units are summed', () => {
  const lunchRecipe: Recipe = {
    ...recipes[0],
    id: 'test-recipe-1',
    mealType: 'lunch',
    basePortions: 2,
    ingredients: [
      { id: 'oil', name: 'Oliwa', amount: 10, unit: 'ml', category: 'canned_condiments' },
      { id: 'oil', name: 'Oliwa', amount: 1, unit: 'tbsp', category: 'canned_condiments' },
    ],
  }
  const dinnerRecipe: Recipe = {
    ...recipes[2],
    id: 'test-recipe-2',
    mealType: 'dinner',
    basePortions: 2,
    ingredients: [
      { id: 'oil', name: 'Oliwa', amount: 5, unit: 'ml', category: 'canned_condiments' },
    ],
  }
  const plan = generatePlan(
    [lunchRecipe, dinnerRecipe],
    { duration: 3, people: 2, batch: false },
    [],
    fixedRandom,
  )
  const items = aggregateShoppingList(plan, [lunchRecipe, dinnerRecipe])
  assert.equal(items.length, 2)
  assert.equal(items.find(item => item.unit === 'ml')?.amount, 45)
  assert.equal(items.find(item => item.unit === 'tbsp')?.amount, 3)
})

test('changed required quantities reset checks and unchanged quantities retain checks', () => {
  const plan = generatePlan(recipes, settings, [], fixedRandom)
  const items = aggregateShoppingList(plan, recipes)
  const checked = Object.fromEntries(items.map(item => [item.id, shoppingSignature(item)]))
  assert.deepEqual(retainCheckedItems(plan, recipes, checked), checked)
  const biggerPlan = generatePlan(recipes, { ...settings, people: 4 }, [], fixedRandom)
  assert.deepEqual(retainCheckedItems(biggerPlan, recipes, checked), {})
  assert.deepEqual(retainCheckedItems([], recipes, checked), {})
})

test('empty recipe pools and invalid portion settings fail with a clear message', () => {
  assert.throws(() => generatePlan([], settings), /Brak przepisów/)
  assert.throws(() => generatePlan(recipes, { ...settings, people: 0 }), /porcji/)
  assert.throws(() => generatePlan(recipes, { ...settings, duration: 2 }), /dni/)
  const plan = generatePlan(recipes, settings)
  const invalidLunch = { ...recipes.find(r => r.id === plan[0].lunch.recipeId)!, basePortions: 0 }
  const dinner = recipes.find(r => r.id === plan[0].dinner.recipeId)!
  assert.throws(() => aggregateShoppingList(plan, [invalidLunch, dinner]), /porcji/)
  assert.throws(
    () => aggregateShoppingList(plan, [{ ...invalidLunch, basePortions: NaN }, dinner]),
    /porcji/,
  )
  assert.throws(() => aggregateShoppingList(plan, []), /nieznany/)
})

test('saved state round-trips including custom items and check state', () => {
  const state = createInitialState()
  const item = aggregateShoppingList(state.plan, recipes)[0]
  state.checked[item.id] = shoppingSignature(item)
  state.customItems.push({
    id: 'custom:test',
    name: 'Kawa',
    amount: 1,
    unit: 'pack',
    category: 'other',
    isCustom: true,
    isChecked: true,
  })
  assert.deepEqual(parseSavedState(JSON.stringify(state)), state)
})

test('invalid storage cannot introduce unknown recipes, incomplete batches, or invalid units', () => {
  assert.throws(() => parseSavedState('{'))
  assert.throws(() => parseSavedState('null'))
  assert.throws(() => parseSavedState(JSON.stringify({ ...createInitialState(), version: 1 })))
  const unknownRecipe = createInitialState()
  unknownRecipe.plan[0].lunch.recipeId = 'unknown'
  assert.throws(() => parseSavedState(JSON.stringify(unknownRecipe)))
  const truncatedBatch = createInitialState()
  truncatedBatch.plan.pop()
  truncatedBatch.plan.pop()
  assert.throws(() => parseSavedState(JSON.stringify(truncatedBatch)))
  const invalidItem = {
    ...createInitialState(),
    customItems: [
      {
        id: 'custom:x',
        name: 'Kawa',
        amount: 1,
        unit: '__proto__',
        category: 'other',
        isChecked: false,
        isCustom: true,
      },
    ],
  }
  assert.throws(() => parseSavedState(JSON.stringify(invalidItem)))
})

test('the seed catalog has valid quantities, identifiers, tags, and Polish instructions', () => {
  assert.equal(recipes.length, 13)
  assert.equal(new Set(recipes.map(recipe => recipe.id)).size, recipes.length)
  for (const recipe of recipes) {
    assert.ok(recipe.basePortions > 0)
    assert.ok(['lunch', 'dinner'].includes(recipe.mealType))
    assert.ok(recipe.instructions.length >= 4)
    assert.ok(recipe.ingredients.every(item => item.amount > 0))
    assert.ok(recipe.tags.includes('low-gi'))
    assert.equal(
      new Set(recipe.ingredients.map(item => `${item.id}:${item.unit}`)).size,
      recipe.ingredients.length,
    )
    if (recipe.tags.includes('quick')) assert.ok(recipe.prepTimeMinutes <= 25)
    if (recipe.tags.includes('vegan'))
      assert.ok(recipe.tags.includes('vegetarian') && recipe.tags.includes('dairy-free'))
  }
})

test('mixed-pasta bolognese keeps both pasta types separate and in equal dry weights in a batch plan', () => {
  const recipe = recipes.find(recipe => recipe.id === 'bolognese-mixed-pasta')!
  const dinner = recipes.find(recipe => recipe.id === 'konjac-chicken')!
  const plan = generatePlan(
    [recipe, dinner],
    { duration: 3, people: 2, batch: true },
    [],
    fixedRandom,
  )
  const items = aggregateShoppingList(plan, [recipe, dinner])
  const wheatPasta = items.find(item => item.ingredientId === 'wheat-pasta')!
  const chickpeaPasta = items.find(item => item.ingredientId === 'chickpea-pasta')!
  assert.notEqual(wheatPasta.id, chickpeaPasta.id)
  assert.equal(wheatPasta.amount, 240)
  assert.equal(chickpeaPasta.amount, 240)
  assert.equal(wheatPasta.unit, 'g')
  assert.equal(chickpeaPasta.unit, 'g')
})

test('four-serving bigos scales to a two-person plan without counting leftovers twice', () => {
  const recipe = recipes.find(recipe => recipe.id === 'bigos')!
  const dinner = recipes.find(recipe => recipe.id === 'konjac-chicken')!
  const plan = generatePlan(
    [recipe, dinner],
    { duration: 3, people: 2, batch: true },
    [],
    fixedRandom,
  )
  const items = aggregateShoppingList(plan, [recipe, dinner])
  assert.equal(items.find(item => item.ingredientId === 'sauerkraut')?.amount, 750)
  assert.equal(items.find(item => item.ingredientId === 'pork-shoulder')?.amount, 600)
  assert.doesNotThrow(() => parseSavedState(JSON.stringify({ ...createInitialState(), plan })))
})
