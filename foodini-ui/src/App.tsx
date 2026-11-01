import { useEffect, useState } from 'react'
import { recipes } from './data/recipes.ts'
import {
  aggregateShoppingList,
  generatePlan,
  pickRecipe,
  replacePlanMeal,
  retainCheckedItems,
  shoppingSignature,
  toggleItemChecked,
  togglePlanLock,
} from './domain.ts'
import { loadSavedState, STORAGE_KEY } from './storage.ts'
import type { MealPlanDay, MealType, Recipe, ShoppingItem, View } from './types.ts'
import { useSync } from './useSync.ts'
import { AppHeader } from './components/AppHeader.tsx'
import { Icon } from './components/Icon.tsx'
import { PlannerView } from './components/PlannerView.tsx'
import { RecipeDialog } from './components/RecipeDialog.tsx'
import { RecipesView } from './components/RecipesView.tsx'
import { ShoppingView } from './components/ShoppingView.tsx'
import { SyncDialog } from './components/SyncDialog.tsx'
import { Toast } from './components/Toast.tsx'

function App() {
  const [initial] = useState(loadSavedState)
  const [saved, setSaved] = useState(initial.state)
  const [storageWarning, setStorageWarning] = useState(initial.warning)
  const [view, setView] = useState<View>('recipes')
  const [activeMealTab, setActiveMealTab] = useState<MealType>('lunch')
  const [query, setQuery] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null)

  function notify(message: string) {
    setToast({ message, id: Date.now() })
  }

  const {
    syncKey,
    syncStatus,
    showSyncDialog,
    setShowSyncDialog,
    handleSaveSyncKey,
    handleDisconnectSync,
  } = useSync(saved, setSaved, notify)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    } catch {
      // Storage is an external system; surface a failed synchronization to the user.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStorageWarning(
        'Nie udało się zapisać zmian. Nie zamykaj strony, jeśli chcesz zachować bieżący plan.',
      )
    }
  }, [saved])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 4500)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const generatedItems = aggregateShoppingList(saved.plan, recipes).map(item => ({
    ...item,
    isChecked: saved.checked[item.id] === shoppingSignature(item),
  }))
  const shoppingItems = [...generatedItems, ...saved.customItems]
  const checkedCount = shoppingItems.filter(item => item.isChecked).length
  const unboughtCount = shoppingItems.length - checkedCount

  function navigate(nextView: View) {
    setView(nextView)
    window.scrollTo({ top: 0 })
  }

  function updatePlan(plan: MealPlanDay[]) {
    setSaved(current => ({
      ...current,
      plan,
      checked: retainCheckedItems(plan, recipes, current.checked),
    }))
  }

  function createPlan() {
    try {
      updatePlan(generatePlan(recipes, saved.settings, saved.plan))
      notify('Plan gotowy! Lista zakupów została zaktualizowana.')
    } catch (error) {
      notify((error as Error).message)
    }
  }

  function rerollSlot(index: number, mealType: MealType) {
    const pool = recipes.filter(r => r.mealType === mealType)
    const currentRecipeId = saved.plan[index][mealType].recipeId
    const recipe = pickRecipe(pool, currentRecipeId)
    if (!recipe) return notify('Brak dań w tej kategorii.')
    if (recipe.id === currentRecipeId) return notify('To jedyny przepis w tej kategorii.')
    try {
      updatePlan(replacePlanMeal(saved.plan, index, mealType, recipe.id))
      notify(
        `${mealType === 'lunch' ? 'Obiad' : 'Kolacja'} zmieniony. Lista zakupów jest aktualna.`,
      )
    } catch (error) {
      notify((error as Error).message)
    }
  }

  function addRecipe(recipeId: string, index: number, mealType: MealType) {
    try {
      updatePlan(replacePlanMeal(saved.plan, index, mealType, recipeId))
      setSelectedRecipe(null)
      navigate('planner')
      notify('Przepis dodany do planu. Składniki są już na liście zakupów.')
    } catch (error) {
      notify((error as Error).message)
    }
  }

  function toggleShoppingItem(item: ShoppingItem) {
    setSaved(current => {
      if (item.isCustom) {
        return {
          ...current,
          customItems: current.customItems.map(entry =>
            entry.id === item.id ? { ...entry, isChecked: !entry.isChecked } : entry,
          ),
        }
      }
      return {
        ...current,
        checked: toggleItemChecked(current.checked, item),
      }
    })
  }

  function addCustomItem(item: ShoppingItem) {
    setSaved(current => ({ ...current, customItems: [...current.customItems, item] }))
  }

  function deleteCustomItem(id: string) {
    setSaved(current => ({
      ...current,
      customItems: current.customItems.filter(entry => entry.id !== id),
    }))
  }

  return (
    <div className="min-h-screen bg-white text-foodini-text">
      <a
        className="fixed -top-20 left-4 z-50 bg-brand p-3 text-white transition-all focus:top-3"
        href="#main-content"
      >
        Przejdź do treści
      </a>

      <AppHeader
        view={view}
        onNavigate={navigate}
        syncStatus={syncStatus}
        onOpenSync={() => setShowSyncDialog(true)}
        unboughtCount={unboughtCount}
      />

      <main
        id="main-content"
        className="mx-auto max-w-[1040px] px-4 py-6 pb-10 sm:px-6 sm:py-7 sm:pb-12"
      >
        {storageWarning && (
          <div
            className="mb-6 flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 px-4 text-sm leading-relaxed text-amber-900"
            role="alert"
          >
            {storageWarning}
            <button
              className="btn-icon"
              aria-label="Zamknij informację o zapisie"
              onClick={() => setStorageWarning('')}
            >
              <Icon name="close" size={17} />
            </button>
          </div>
        )}

        {view === 'recipes' && (
          <RecipesView
            recipes={recipes}
            activeMealTab={activeMealTab}
            onMealTabChange={setActiveMealTab}
            query={query}
            onQueryChange={setQuery}
            onSelectRecipe={setSelectedRecipe}
          />
        )}

        {view === 'planner' && (
          <PlannerView
            plan={saved.plan}
            settings={saved.settings}
            allRecipes={recipes}
            onUpdateSettings={updater =>
              setSaved(current => ({
                ...current,
                settings: updater(current.settings),
              }))
            }
            onCreatePlan={createPlan}
            onToggleLock={(index, mealType) =>
              updatePlan(togglePlanLock(saved.plan, index, mealType))
            }
            onRerollSlot={rerollSlot}
            onSelectRecipe={setSelectedRecipe}
            onNavigateToShopping={() => navigate('shopping')}
            onNavigateToRecipes={() => navigate('recipes')}
          />
        )}

        {view === 'shopping' && (
          <ShoppingView
            items={shoppingItems}
            planDuration={saved.plan.length}
            onToggleItem={toggleShoppingItem}
            onAddCustomItem={addCustomItem}
            onDeleteCustomItem={deleteCustomItem}
            onNotify={notify}
            onNavigateToPlanner={() => navigate('planner')}
          />
        )}
      </main>

      {selectedRecipe && (
        <RecipeDialog
          key={selectedRecipe.id}
          recipe={selectedRecipe}
          plan={saved.plan}
          onClose={() => setSelectedRecipe(null)}
          onAdd={addRecipe}
        />
      )}

      {showSyncDialog && (
        <SyncDialog
          currentKey={syncKey}
          status={syncStatus}
          onSaveKey={handleSaveSyncKey}
          onDisconnect={handleDisconnectSync}
          onClose={() => setShowSyncDialog(false)}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}

export default App
