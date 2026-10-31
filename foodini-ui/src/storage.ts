import { categoryLabels, recipes, unitLabels } from './data/recipes.ts'
import { generatePlan } from './domain.ts'
import type { SavedState } from './types.ts'

export const STORAGE_KEY = 'foodini:poc:v1'

export function createInitialState(): SavedState {
  const settings = { duration: 5, people: 2, batch: true }
  let index = 0
  const rolls = [0, 0, 0.99]
  return { version: 1, settings, plan: generatePlan(recipes.slice(0, 3), settings, [], () => rolls[index++] ?? 0), customItems: [], checked: {} }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isPositiveInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0

export function parseSavedState(text: string): SavedState {
  const value: unknown = JSON.parse(text)
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.settings) || !Array.isArray(value.plan) || !Array.isArray(value.customItems) || !isRecord(value.checked)) throw new Error('Invalid saved state')
  const { settings, plan, customItems, checked } = value
  if (!isPositiveInteger(settings.duration) || settings.duration < 3 || settings.duration > 7 || !isPositiveInteger(settings.people) || settings.people > 8 || typeof settings.batch !== 'boolean' || plan.length > 7) throw new Error('Invalid settings')
  for (const [index, day] of plan.entries()) {
    if (!isRecord(day) || day.dayIndex !== index || typeof day.dayLabel !== 'string' || !recipes.some(recipe => recipe.id === day.recipeId) || !isPositiveInteger(day.servings) || day.servings > 16 || (day.coversDays !== 1 && day.coversDays !== 2) || typeof day.isLeftoverDay !== 'boolean' || typeof day.isLocked !== 'boolean') throw new Error('Invalid day')
    if (day.isLeftoverDay && (!index || plan[index - 1].isLeftoverDay || plan[index - 1].coversDays !== 2 || plan[index - 1].recipeId !== day.recipeId || day.coversDays !== 1 || plan[index - 1].servings !== day.servings * 2 || plan[index - 1].isLocked !== day.isLocked)) throw new Error('Orphan leftover')
    if (!day.isLeftoverDay && day.coversDays === 2 && (!plan[index + 1]?.isLeftoverDay || plan[index + 1].recipeId !== day.recipeId)) throw new Error('Incomplete batch')
  }
  if (customItems.length > 500) throw new Error('Too many custom items')
  const ids = new Set<string>()
  for (const item of customItems) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.startsWith('custom:') || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100 || typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount <= 0 || typeof item.unit !== 'string' || !Object.hasOwn(unitLabels, item.unit) || typeof item.category !== 'string' || !Object.hasOwn(categoryLabels, item.category) || typeof item.isChecked !== 'boolean' || item.isCustom !== true) throw new Error('Invalid custom item')
    ids.add(item.id)
  }
  if (!Object.values(checked).every(signature => typeof signature === 'string')) throw new Error('Invalid checked items')
  return value as unknown as SavedState
}

export function loadSavedState(): { state: SavedState; warning: string } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return { state: createInitialState(), warning: '' }
    try { return { state: parseSavedState(saved), warning: '' } }
    catch { return { state: createInitialState(), warning: 'Nie udało się odczytać poprzedniego planu. Przywróciliśmy plan przykładowy.' } }
  } catch {
    return { state: createInitialState(), warning: 'Zapis w przeglądarce jest niedostępny. Twój plan będzie dostępny do odświeżenia strony.' }
  }
}
