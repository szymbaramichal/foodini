export type View = 'recipes' | 'planner' | 'shopping'
export type MealType = 'lunch' | 'dinner'
export type RecipeTag =
  'low-gi' | 'dairy-free' | 'quick' | 'vegetarian' | 'vegan' | 'high-protein' | 'one-pot'
export type UnitType = 'g' | 'ml' | 'pcs' | 'tbsp' | 'tsp' | 'clove' | 'can' | 'pack' | 'pinch'
export type ShopCategory =
  | 'produce'
  | 'dairy'
  | 'bakery'
  | 'meat_fish_tofu'
  | 'grains_pantry'
  | 'canned_condiments'
  | 'other'

export interface IngredientItem {
  id: string
  name: string
  amount: number
  unit: UnitType
  category: ShopCategory
}

export interface Recipe {
  id: string
  name: string
  description: string
  mealType: MealType
  prepTimeMinutes: number
  difficulty: 'easy' | 'medium' | 'hard'
  basePortions: number
  tags: RecipeTag[]
  ingredients: IngredientItem[]
  instructions: string[]
  imageUrl: string
  imagePosition?: string
  imageCredit?: { author: string; sourceUrl: string; licenseName: string; licenseUrl: string }
}

export interface MealSlot {
  recipeId: string
  servings: number
  coversDays: number
  isLeftoverDay: boolean
  isLocked: boolean
}

export interface MealPlanDay {
  dayIndex: number
  dayLabel: string
  lunch: MealSlot
  dinner: MealSlot
}

export interface ShoppingItem extends Omit<IngredientItem, 'id'> {
  id: string
  ingredientId?: string
  isChecked: boolean
  isCustom: boolean
}

export interface PlanSettings {
  duration: number
  people: number
  batch: boolean
}

export interface SavedState {
  version: 2
  settings: PlanSettings
  plan: MealPlanDay[]
  customItems: ShoppingItem[]
  checked: Record<string, string>
}
