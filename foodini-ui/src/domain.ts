import type {
  MealPlanDay,
  MealSlot,
  MealType,
  PlanSettings,
  Recipe,
  RecipeTag,
  ShoppingItem,
} from './types.ts'

export const normalizeText = (text: string) =>
  text
    .toLocaleLowerCase('pl')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')

export function filterRecipes(
  recipes: Recipe[],
  query: string,
  tags: RecipeTag[] = [],
  mealType = '',
): Recipe[] {
  const search = normalizeText(query.trim())
  return recipes.filter(
    recipe =>
      (!mealType || recipe.mealType === mealType) &&
      (tags.length === 0 || tags.every(tag => recipe.tags.includes(tag))) &&
      (!search ||
        normalizeText(
          [recipe.name, recipe.description, ...recipe.ingredients.map(item => item.name)].join(' '),
        ).includes(search)),
  )
}

export function pickRecipe(
  recipes: Recipe[],
  excludedId?: string,
  random = Math.random,
): Recipe | undefined {
  const alternatives = recipes.filter(recipe => recipe.id !== excludedId)
  const candidates = alternatives.length ? alternatives : recipes
  return candidates[Math.floor(random() * candidates.length)]
}

export function getBatchStart(plan: MealPlanDay[], index: number, mealType: MealType): number {
  return plan[index]?.[mealType].isLeftoverDay ? index - 1 : index
}

export function isBatchLocked(plan: MealPlanDay[], index: number, mealType: MealType): boolean {
  const start = getBatchStart(plan, index, mealType)
  const covers = plan[start]?.[mealType]?.coversDays ?? 1
  return plan.slice(start, start + covers).some(day => day[mealType]?.isLocked)
}

export function isSlotLocked(slots: MealSlot[], index: number): boolean {
  const slot = slots[index]
  if (!slot) return false
  const start = slot.isLeftoverDay ? index - 1 : index
  const covers = slots[start]?.coversDays ?? 1
  return slots.slice(start, start + covers).some(s => s?.isLocked)
}

export function generateSlotPlan(
  pool: Recipe[],
  settings: PlanSettings,
  previousSlots: MealSlot[] = [],
  random = Math.random,
): MealSlot[] {
  if (!pool.length) {
    throw new Error('Brak przepisów pasujących do filtrów. Zmień filtry i spróbuj ponownie.')
  }
  const slots: MealSlot[] = []
  for (let index = 0; index < previousSlots.length; index++) {
    if (isSlotLocked(previousSlots, index)) {
      if (index >= settings.duration) {
        throw new Error('Najpierw odblokuj dni, które chcesz usunąć z planu.')
      }
      slots[index] = { ...previousSlots[index] }
    }
  }
  let lastRecipeId: string | undefined
  for (let index = 0; index < settings.duration; index++) {
    if (slots[index]) {
      lastRecipeId = slots[index].recipeId
      continue
    }
    const coversDays = settings.batch && index + 1 < settings.duration && !slots[index + 1] ? 2 : 1
    const recipe = pickRecipe(pool, lastRecipeId, random)!
    const servings = settings.people * coversDays
    slots[index] = {
      recipeId: recipe.id,
      servings,
      coversDays,
      isLeftoverDay: false,
      isLocked: false,
    }
    if (coversDays === 2) {
      slots[index + 1] = {
        recipeId: recipe.id,
        servings: settings.people,
        coversDays: 1,
        isLeftoverDay: true,
        isLocked: false,
      }
      index++
    }
    lastRecipeId = recipe.id
  }
  return slots
}

export function generatePlan(
  pool: Recipe[],
  settings: PlanSettings,
  previous: MealPlanDay[] = [],
  random = Math.random,
): MealPlanDay[] {
  if (
    !Number.isInteger(settings.duration) ||
    settings.duration < 3 ||
    settings.duration > 7 ||
    !Number.isInteger(settings.people) ||
    settings.people < 1 ||
    settings.people > 8
  ) {
    throw new Error('Wybierz od 3 do 7 dni i od 1 do 8 porcji dziennie.')
  }
  const lunchPool = pool.filter(r => r.mealType === 'lunch')
  const dinnerPool = pool.filter(r => r.mealType === 'dinner')
  if (!lunchPool.length) {
    throw new Error('Brak przepisów na obiad pasujących do wyboru.')
  }
  if (!dinnerPool.length) {
    throw new Error('Brak przepisów na kolację pasujących do wyboru.')
  }

  const previousLunches = previous.map(d => d.lunch)
  const previousDinners = previous.map(d => ({
    ...d.dinner,
    coversDays: 1,
    isLeftoverDay: false,
    servings: d.dinner.coversDays === 2 ? Math.round(d.dinner.servings / 2) : d.dinner.servings,
  }))

  const lunches = generateSlotPlan(lunchPool, settings, previousLunches, random)
  const dinners = generateSlotPlan(
    dinnerPool,
    { ...settings, batch: false },
    previousDinners,
    random,
  )

  return Array.from({ length: settings.duration }, (_, index) => ({
    dayIndex: index,
    dayLabel: `Dzień ${index + 1}`,
    lunch: lunches[index],
    dinner: dinners[index],
  }))
}

export function replacePlanMeal(
  plan: MealPlanDay[],
  index: number,
  mealType: MealType,
  recipeId: string,
): MealPlanDay[] {
  if (!plan[index]) throw new Error('Nie znaleziono dnia w planie.')
  if (isBatchLocked(plan, index, mealType)) throw new Error('Najpierw odblokuj ten posiłek.')
  const start = getBatchStart(plan, index, mealType)
  const covers = plan[start][mealType].coversDays
  return plan.map((day, dayIndex) => {
    if (dayIndex >= start && dayIndex < start + covers) {
      return {
        ...day,
        [mealType]: {
          ...day[mealType],
          recipeId,
        },
      }
    }
    return day
  })
}

export function togglePlanLock(
  plan: MealPlanDay[],
  index: number,
  mealType: MealType,
): MealPlanDay[] {
  const start = getBatchStart(plan, index, mealType)
  const covers = plan[start][mealType].coversDays
  const locked = !isBatchLocked(plan, index, mealType)
  return plan.map((day, dayIndex) => {
    if (dayIndex >= start && dayIndex < start + covers) {
      return {
        ...day,
        [mealType]: {
          ...day[mealType],
          isLocked: locked,
        },
      }
    }
    return day
  })
}

export const shoppingSignature = (item: ShoppingItem) => `${item.amount}:${item.unit}`

export function toggleItemChecked(
  checked: Record<string, string>,
  item: ShoppingItem,
): Record<string, string> {
  const next = { ...checked }
  const sig = shoppingSignature(item)
  if (next[item.id] === sig) {
    delete next[item.id]
  } else {
    next[item.id] = sig
  }
  return next
}

export function aggregateShoppingList(plan: MealPlanDay[], recipes: Recipe[]): ShoppingItem[] {
  const items = new Map<string, ShoppingItem>()
  for (const day of plan) {
    for (const mealType of ['lunch', 'dinner'] as const) {
      const slot = day[mealType]
      if (!slot || slot.isLeftoverDay) continue
      const recipe = recipes.find(recipe => recipe.id === slot.recipeId)
      if (!recipe) throw new Error('W planie znajduje się nieznany przepis.')
      if (
        recipe.basePortions <= 0 ||
        !Number.isFinite(recipe.basePortions) ||
        slot.servings <= 0 ||
        !Number.isFinite(slot.servings)
      ) {
        throw new Error('Liczba porcji musi być większa od zera.')
      }
      for (const ingredient of recipe.ingredients) {
        const id = `${ingredient.id}:${ingredient.unit}`
        const amount = (ingredient.amount * slot.servings) / recipe.basePortions
        const existing = items.get(id)
        if (existing) existing.amount += amount
        else {
          items.set(id, {
            ...ingredient,
            id,
            ingredientId: ingredient.id,
            amount,
            isChecked: false,
            isCustom: false,
          })
        }
      }
    }
  }
  return [...items.values()].map(item => ({
    ...item,
    amount: Math.round(item.amount * 1000) / 1000,
  }))
}

export function retainCheckedItems(
  plan: MealPlanDay[],
  recipes: Recipe[],
  checked: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    aggregateShoppingList(plan, recipes)
      .filter(item => checked[item.id] === shoppingSignature(item))
      .map(item => [item.id, checked[item.id]]),
  )
}

export const formatAmount = (amount: number) =>
  new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(amount)
export const portionLabel = (amount: number) =>
  amount === 1
    ? 'porcja'
    : amount % 10 >= 2 && amount % 10 <= 4 && (amount % 100 < 12 || amount % 100 > 14)
      ? 'porcje'
      : 'porcji'
