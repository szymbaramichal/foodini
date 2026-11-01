import { categoryLabels, recipes, unitLabels } from './data/recipes.ts'
import { generatePlan } from './domain.ts'
import type { MealType, SavedState } from './types.ts'

export const STORAGE_KEY = 'foodini:poc:v2'

export function createInitialState(): SavedState {
  const settings = { duration: 5, people: 2, batch: true }
  let index = 0
  const rolls = [0, 0, 0, 0, 0, 0, 0, 0]
  return {
    version: 2,
    settings,
    plan: generatePlan(recipes, settings, [], () => rolls[index++] ?? 0),
    customItems: [],
    checked: {},
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isPositiveInteger = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) > 0

export function parseSavedState(text: string): SavedState {
  const value: unknown = JSON.parse(text)
  if (
    !isRecord(value) ||
    value.version !== 2 ||
    !isRecord(value.settings) ||
    !Array.isArray(value.plan) ||
    !Array.isArray(value.customItems) ||
    !isRecord(value.checked)
  )
    throw new Error('Invalid saved state')
  const { settings, plan, customItems, checked } = value
  if (
    !isPositiveInteger(settings.duration) ||
    settings.duration < 3 ||
    settings.duration > 7 ||
    !isPositiveInteger(settings.people) ||
    settings.people > 8 ||
    typeof settings.batch !== 'boolean' ||
    plan.length > 7
  )
    throw new Error('Invalid settings')
  for (const [index, day] of plan.entries()) {
    if (
      !isRecord(day) ||
      day.dayIndex !== index ||
      typeof day.dayLabel !== 'string' ||
      !isRecord(day.lunch) ||
      !isRecord(day.dinner)
    )
      throw new Error('Invalid day')

    const slots: { slot: Record<string, unknown>; mealType: MealType }[] = [
      { slot: day.lunch as Record<string, unknown>, mealType: 'lunch' },
      { slot: day.dinner as Record<string, unknown>, mealType: 'dinner' },
    ]

    for (const { slot, mealType } of slots) {
      if (
        typeof slot.recipeId !== 'string' ||
        !recipes.some(recipe => recipe.id === slot.recipeId && recipe.mealType === mealType) ||
        !isPositiveInteger(slot.servings) ||
        slot.servings > 16 ||
        (slot.coversDays !== 1 && slot.coversDays !== 2) ||
        typeof slot.isLeftoverDay !== 'boolean' ||
        typeof slot.isLocked !== 'boolean' ||
        (mealType === 'dinner' && (slot.coversDays !== 1 || slot.isLeftoverDay))
      )
        throw new Error('Invalid meal slot')

      if (
        slot.isLeftoverDay &&
        (!index ||
          plan[index - 1][mealType].isLeftoverDay ||
          plan[index - 1][mealType].coversDays !== 2 ||
          plan[index - 1][mealType].recipeId !== slot.recipeId ||
          slot.coversDays !== 1 ||
          plan[index - 1][mealType].servings !== (slot.servings as number) * 2 ||
          plan[index - 1][mealType].isLocked !== slot.isLocked)
      )
        throw new Error('Orphan leftover')

      if (
        !slot.isLeftoverDay &&
        slot.coversDays === 2 &&
        (!plan[index + 1]?.[mealType]?.isLeftoverDay ||
          plan[index + 1][mealType].recipeId !== slot.recipeId)
      )
        throw new Error('Incomplete batch')
    }
  }
  if (customItems.length > 500) throw new Error('Too many custom items')
  const ids = new Set<string>()
  for (const item of customItems) {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      !item.id.startsWith('custom:') ||
      ids.has(item.id) ||
      typeof item.name !== 'string' ||
      !item.name.trim() ||
      item.name.length > 100 ||
      typeof item.amount !== 'number' ||
      !Number.isFinite(item.amount) ||
      item.amount <= 0 ||
      typeof item.unit !== 'string' ||
      !Object.hasOwn(unitLabels, item.unit) ||
      typeof item.category !== 'string' ||
      !Object.hasOwn(categoryLabels, item.category) ||
      typeof item.isChecked !== 'boolean' ||
      item.isCustom !== true
    )
      throw new Error('Invalid custom item')
    ids.add(item.id)
  }
  if (!Object.values(checked).every(signature => typeof signature === 'string'))
    throw new Error('Invalid checked items')
  return value as unknown as SavedState
}

export function loadSavedState(): { state: SavedState; warning: string } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return { state: createInitialState(), warning: '' }
    try {
      return { state: parseSavedState(saved), warning: '' }
    } catch {
      return {
        state: createInitialState(),
        warning: 'Nie udało się odczytać poprzedniego planu. Przywróciliśmy plan przykładowy.',
      }
    }
  } catch {
    return {
      state: createInitialState(),
      warning:
        'Zapis w przeglądarce jest niedostępny. Twój plan będzie dostępny do odświeżenia strony.',
    }
  }
}
