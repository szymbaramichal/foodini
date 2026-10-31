import type { MealPlanDay, PlanSettings, Recipe, RecipeTag, ShoppingItem } from './types.ts'

export const normalizeText = (text: string) => text.toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l')

export function filterRecipes(recipes: Recipe[], query: string, tags: RecipeTag[], mealType: string): Recipe[] {
  const search = normalizeText(query.trim())
  return recipes.filter(recipe =>
    (!mealType || recipe.mealType === mealType) &&
    tags.every(tag => recipe.tags.includes(tag)) &&
    (!search || normalizeText([recipe.name, recipe.description, ...recipe.ingredients.map(item => item.name)].join(' ')).includes(search)),
  )
}

export function pickRecipe(recipes: Recipe[], excludedId?: string, random = Math.random): Recipe | undefined {
  const alternatives = recipes.filter(recipe => recipe.id !== excludedId)
  const candidates = alternatives.length ? alternatives : recipes
  return candidates[Math.floor(random() * candidates.length)]
}

export function getBatchStart(plan: MealPlanDay[], index: number): number {
  return plan[index]?.isLeftoverDay ? index - 1 : index
}

export function isBatchLocked(plan: MealPlanDay[], index: number): boolean {
  const start = getBatchStart(plan, index)
  return plan.slice(start, start + (plan[start]?.coversDays ?? 1)).some(day => day.isLocked)
}

export function generatePlan(pool: Recipe[], settings: PlanSettings, previous: MealPlanDay[] = [], random = Math.random): MealPlanDay[] {
  if (!Number.isInteger(settings.duration) || settings.duration < 3 || settings.duration > 7 || !Number.isInteger(settings.people) || settings.people < 1 || settings.people > 8) {
    throw new Error('Wybierz od 3 do 7 dni i od 1 do 8 porcji dziennie.')
  }
  if (!pool.length) throw new Error('Brak przepisów pasujących do filtrów. Zmień filtry i spróbuj ponownie.')
  const plan: MealPlanDay[] = []
  for (let index = 0; index < previous.length; index++) {
    if (isBatchLocked(previous, index)) {
      if (index >= settings.duration) throw new Error('Najpierw odblokuj dni, które chcesz usunąć z planu.')
      plan[index] = { ...previous[index] }
    }
  }
  let lastRecipeId: string | undefined
  for (let index = 0; index < settings.duration; index++) {
    if (plan[index]) { lastRecipeId = plan[index].recipeId; continue }
    const coversDays = settings.batch && index + 1 < settings.duration && !plan[index + 1] ? 2 : 1
    const recipe = pickRecipe(pool, lastRecipeId, random)!
    const servings = settings.people * coversDays
    plan[index] = { dayIndex: index, dayLabel: `Dzień ${index + 1}`, recipeId: recipe.id, servings, coversDays, isLeftoverDay: false, isLocked: false }
    if (coversDays === 2) {
      plan[index + 1] = { dayIndex: index + 1, dayLabel: `Dzień ${index + 2}`, recipeId: recipe.id, servings: settings.people, coversDays: 1, isLeftoverDay: true, isLocked: false }
      index++
    }
    lastRecipeId = recipe.id
  }
  return plan
}

export function replacePlanRecipe(plan: MealPlanDay[], index: number, recipeId: string): MealPlanDay[] {
  if (!plan[index]) throw new Error('Nie znaleziono dnia w planie.')
  if (isBatchLocked(plan, index)) throw new Error('Najpierw odblokuj ten posiłek.')
  const start = getBatchStart(plan, index)
  return plan.map((day, dayIndex) => dayIndex >= start && dayIndex < start + plan[start].coversDays ? { ...day, recipeId } : day)
}

export function togglePlanLock(plan: MealPlanDay[], index: number): MealPlanDay[] {
  const start = getBatchStart(plan, index)
  const locked = !isBatchLocked(plan, index)
  return plan.map((day, dayIndex) => dayIndex >= start && dayIndex < start + plan[start].coversDays ? { ...day, isLocked: locked } : day)
}

export const shoppingSignature = (item: ShoppingItem) => `${item.amount}:${item.unit}`

export function aggregateShoppingList(plan: MealPlanDay[], recipes: Recipe[]): ShoppingItem[] {
  const items = new Map<string, ShoppingItem>()
  for (const day of plan) {
    if (day.isLeftoverDay) continue
    const recipe = recipes.find(recipe => recipe.id === day.recipeId)
    if (!recipe) throw new Error('W planie znajduje się nieznany przepis.')
    if (recipe.basePortions <= 0 || !Number.isFinite(recipe.basePortions) || day.servings <= 0 || !Number.isFinite(day.servings)) throw new Error('Liczba porcji musi być większa od zera.')
    for (const ingredient of recipe.ingredients) {
      const id = `${ingredient.id}:${ingredient.unit}`
      const amount = ingredient.amount * day.servings / recipe.basePortions
      const existing = items.get(id)
      if (existing) existing.amount += amount
      else items.set(id, { ...ingredient, id, ingredientId: ingredient.id, amount, isChecked: false, isCustom: false })
    }
  }
  return [...items.values()].map(item => ({ ...item, amount: Math.round(item.amount * 1000) / 1000 }))
}

export function retainCheckedItems(plan: MealPlanDay[], recipes: Recipe[], checked: Record<string, string>): Record<string, string> {
  return Object.fromEntries(aggregateShoppingList(plan, recipes).filter(item => checked[item.id] === shoppingSignature(item)).map(item => [item.id, checked[item.id]]))
}

export const formatAmount = (amount: number) => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(amount)
export const portionLabel = (amount: number) => amount === 1 ? 'porcja' : amount % 10 >= 2 && amount % 10 <= 4 && (amount % 100 < 12 || amount % 100 > 14) ? 'porcje' : 'porcji'
