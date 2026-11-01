import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { categoryLabels, recipes, tagLabels, unitLabels } from './data/recipes.ts'
import {
  aggregateShoppingList,
  filterRecipes,
  formatAmount,
  generatePlan,
  isBatchLocked,
  pickRecipe,
  portionLabel,
  replacePlanRecipe,
  retainCheckedItems,
  shoppingSignature,
  togglePlanLock,
} from './domain.ts'
import { loadSavedState, STORAGE_KEY } from './storage.ts'
import {
  clearStoredSyncKey,
  fetchRemoteState,
  getStoredSyncKey,
  pushRemoteState,
  setStoredSyncKey,
  type SyncStatus,
} from './sync.ts'
import type {
  MealPlanDay,
  Recipe,
  RecipeTag,
  ShoppingItem,
  ShopCategory,
  UnitType,
} from './types.ts'
import { Icon } from './components/Icon.tsx'
import { RecipeDialog } from './components/RecipeDialog.tsx'
import { SyncDialog } from './components/SyncDialog.tsx'

type View = 'recipes' | 'planner' | 'shopping'
const navigation: { id: View; label: string }[] = [
  { id: 'recipes', label: 'Posiłki' },
  { id: 'planner', label: 'Planer' },
  { id: 'shopping', label: 'Lista zakupów' },
]
const mealTypes = [
  { id: '', label: 'Wszystkie' },
  { id: 'lunch', label: 'Obiady' },
  { id: 'dinner', label: 'Kolacje' },
]

const syncLabels: Record<SyncStatus, { label: string; tooltip: string }> = {
  idle: { label: 'Zsynchronizowano', tooltip: 'Połączono z chmurą. Dane są aktualne.' },
  syncing: { label: 'Synchronizuję...', tooltip: 'Trwa synchronizacja danych z chmurą.' },
  error: {
    label: 'Błąd synchronizacji',
    tooltip: 'Nie udało się połączyć z bazą. Kliknij, aby sprawdzić.',
  },
  local: {
    label: 'Synchronizacja',
    tooltip: 'Współdziel plan i listę zakupów z domownikiem lub innym urządzeniem.',
  },
}

function App() {
  const [initial] = useState(loadSavedState)
  const [saved, setSaved] = useState(initial.state)
  const [storageWarning, setStorageWarning] = useState(initial.warning)
  const [view, setView] = useState<View>('recipes')
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<RecipeTag[]>([])
  const [mealType, setMealType] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null)
  const [hideChecked, setHideChecked] = useState(false)
  const [syncKey, setSyncKey] = useState<string>(getStoredSyncKey)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => (syncKey ? 'syncing' : 'local'))
  const [showSyncDialog, setShowSyncDialog] = useState(false)
  const isInitialSyncDone = useRef(false)
  const lastSyncedSerialized = useRef<string>('')
  const savedRef = useRef(saved)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  useEffect(() => {
    savedRef.current = saved
  }, [saved])

  useEffect(() => {
    if (!syncKey) {
      isInitialSyncDone.current = true
      return
    }

    let active = true

    fetchRemoteState(syncKey)
      .then(async result => {
        if (!active) return
        if (result.exists && result.state) {
          setSaved(result.state)
          lastSyncedSerialized.current = JSON.stringify(result.state)
          setSyncStatus('idle')
        } else {
          lastSyncedSerialized.current = JSON.stringify(savedRef.current)
          await pushRemoteState(syncKey, savedRef.current)
          if (active) setSyncStatus('idle')
        }
      })
      .catch(() => {
        if (active) setSyncStatus('error')
      })
      .finally(() => {
        if (active) isInitialSyncDone.current = true
      })

    return () => {
      active = false
    }
  }, [syncKey])

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

    if (!syncKey || !isInitialSyncDone.current) return

    const currentSerialized = JSON.stringify(saved)
    if (currentSerialized === lastSyncedSerialized.current) return

    setSyncStatus('syncing')
    const timer = window.setTimeout(async () => {
      try {
        await pushRemoteState(syncKey, saved)
        lastSyncedSerialized.current = currentSerialized
        setSyncStatus('idle')
      } catch {
        setSyncStatus('error')
      }
    }, 800)

    return () => window.clearTimeout(timer)
  }, [saved, syncKey])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 4500)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const filteredRecipes = filterRecipes(recipes, query, selectedTags, mealType)
  const generatedItems = aggregateShoppingList(saved.plan, recipes).map(item => ({
    ...item,
    isChecked: saved.checked[item.id] === shoppingSignature(item),
  }))
  const shoppingItems = [...generatedItems, ...saved.customItems]
  const checkedCount = shoppingItems.filter(item => item.isChecked).length
  const cookingCount = saved.plan.filter(day => !day.isLeftoverDay).length
  const activeFilterCount =
    selectedTags.length + Number(Boolean(query.trim())) + Number(Boolean(mealType))

  function notify(message: string) {
    setToast({ message, id: Date.now() })
  }
  function navigate(nextView: View) {
    setView(nextView)
    window.scrollTo({ top: 0 })
  }
  function clearFilters() {
    setQuery('')
    setSelectedTags([])
    setMealType('')
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
      updatePlan(generatePlan(filteredRecipes, saved.settings, saved.plan))
      notify('Plan gotowy! Lista zakupów została zaktualizowana.')
    } catch (error) {
      notify((error as Error).message)
    }
  }
  function rerollDay(index: number) {
    const recipe = pickRecipe(filteredRecipes, saved.plan[index].recipeId)
    if (!recipe) return notify('Brak dań pasujących do filtrów. Zmień filtry w widoku Posiłki.')
    if (recipe.id === saved.plan[index].recipeId)
      return notify('To jedyny przepis pasujący do filtrów. Zmień filtry, aby wybrać inne danie.')
    try {
      updatePlan(replacePlanRecipe(saved.plan, index, recipe.id))
      notify('Posiłek zmieniony. Lista zakupów jest aktualna.')
    } catch (error) {
      notify((error as Error).message)
    }
  }
  function addRecipe(recipeId: string, index: number) {
    try {
      updatePlan(replacePlanRecipe(saved.plan, index, recipeId))
      setSelectedRecipe(null)
      navigate('planner')
      notify('Przepis dodany do planu. Składniki są już na liście zakupów.')
    } catch (error) {
      notify((error as Error).message)
    }
  }
  function toggleShoppingItem(item: ShoppingItem) {
    setSaved(current => {
      if (item.isCustom)
        return {
          ...current,
          customItems: current.customItems.map(entry =>
            entry.id === item.id ? { ...entry, isChecked: !entry.isChecked } : entry,
          ),
        }
      const checked = { ...current.checked }
      if (item.isChecked) delete checked[item.id]
      else checked[item.id] = shoppingSignature(item)
      return { ...current, checked }
    })
  }
  function addCustomItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    const amount = Number(data.get('amount'))
    if (!name || name.length > 100 || !Number.isFinite(amount) || amount <= 0)
      return notify('Wpisz nazwę produktu i ilość większą od zera.')
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36)
    const item: ShoppingItem = {
      id: `custom:${id}`,
      name,
      amount,
      unit: data.get('unit') as UnitType,
      category: data.get('category') as ShopCategory,
      isChecked: false,
      isCustom: true,
    }
    setSaved(current => ({ ...current, customItems: [...current.customItems, item] }))
    form.reset()
    notify('Produkt dodany do listy.')
  }
  function shoppingText() {
    return [
      'FOODINI · LISTA ZAKUPÓW',
      `Plan na ${saved.plan.length} dni`,
      '',
      ...Object.entries(categoryLabels).flatMap(([category, label]) => {
        const items = shoppingItems.filter(item => item.category === category)
        return items.length
          ? [
              label.toLocaleUpperCase('pl'),
              ...items.map(
                item =>
                  `${item.isChecked ? '☑' : '☐'} ${item.name} — ${formatAmount(item.amount)} ${unitLabels[item.unit]}`,
              ),
              '',
            ]
          : []
      }),
    ].join('\n')
  }
  async function copyShoppingList() {
    try {
      await navigator.clipboard.writeText(shoppingText())
      notify('Lista skopiowana. Możesz ją teraz wkleić do wiadomości.')
    } catch {
      notify('Przeglądarka nie pozwoliła skopiować listy. Skorzystaj z przycisku „Pobierz listę”.')
    }
  }
  async function shareShoppingList() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Foodini · Lista zakupów',
          text: shoppingText(),
        })
        notify('Lista zakupów została udostępniona.')
      } catch {
        // User cancelled share dialog
      }
    } else {
      await copyShoppingList()
    }
  }
  function downloadShoppingList() {
    const url = URL.createObjectURL(
      new Blob([shoppingText()], { type: 'text/plain;charset=utf-8' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'foodini-lista-zakupow.txt'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify('Lista zakupów została pobrana.')
  }

  async function handleSaveSyncKey(newKey: string) {
    setStoredSyncKey(newKey)
    setSyncKey(newKey)
    setSyncStatus('syncing')
    try {
      const result = await fetchRemoteState(newKey)
      if (result.exists && result.state) {
        setSaved(result.state)
        lastSyncedSerialized.current = JSON.stringify(result.state)
        notify('Połączono! Wczytano dane z chmury.')
      } else {
        await pushRemoteState(newKey, saved)
        lastSyncedSerialized.current = JSON.stringify(saved)
        notify('Połączono! Zapisano bieżący plan w chmurze.')
      }
      setSyncStatus('idle')
    } catch (err) {
      setSyncStatus('error')
      throw err
    }
  }

  function handleDisconnectSync() {
    clearStoredSyncKey()
    setSyncKey('')
    setSyncStatus('local')
    notify('Odłączono synchronizację. Dane pozostają w pamięci tej przeglądarki.')
  }

  return (
    <div className="min-h-screen bg-white text-foodini-text">
      <a
        className="fixed -top-20 left-4 z-50 bg-brand p-3 text-white transition-all focus:top-3"
        href="#main-content"
      >
        Przejdź do treści
      </a>
      <header className="sticky top-0 z-20 border-b border-foodini-border bg-white">
        <div className="mx-auto flex max-w-[1040px] items-center justify-between gap-2 p-2 sm:gap-5 sm:px-6 sm:py-3 max-sm:flex-wrap">
          <div className="flex items-center gap-4 max-sm:w-full max-sm:justify-between">
            <button
              className="min-h-[44px] cursor-pointer bg-transparent p-0 text-[22px] font-bold tracking-tight text-brand sm:text-2xl"
              onClick={() => navigate('recipes')}
              aria-label="Foodini — posiłki"
            >
              foodini
            </button>
            <button
              type="button"
              className={`inline-flex min-h-[44px] cursor-pointer items-center rounded-md border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 sm:text-[13px] ${
                syncStatus === 'error'
                  ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                  : syncStatus === 'syncing'
                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-foodini-border bg-white text-foodini-muted hover:border-brand/40 hover:bg-foodini-subtle hover:text-brand'
              }`}
              onClick={() => setShowSyncDialog(true)}
              title={syncLabels[syncStatus].tooltip}
              aria-label={`Synchronizacja: ${syncLabels[syncStatus].label}`}
            >
              {syncLabels[syncStatus].label}
            </button>
          </div>
          <nav className="flex gap-1 max-sm:w-full" aria-label="Nawigacja główna">
            {navigation.map(item => (
              <button
                key={item.id}
                className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-2 rounded px-3 text-[13px] transition sm:flex-initial sm:px-4 sm:text-sm ${
                  view === item.id
                    ? 'bg-brand-light font-semibold text-brand'
                    : 'bg-transparent text-foodini-muted hover:bg-brand-light hover:text-brand'
                }`}
                onClick={() => navigate(item.id)}
                aria-label={item.label}
                aria-current={view === item.id ? 'page' : undefined}
              >
                {item.label}
                {item.id === 'shopping' && (
                  <span className="text-xs">{shoppingItems.length - checkedCount}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

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
          <section aria-label="Przeglądaj przepisy">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:items-center sm:gap-4">
              <h1 className="text-[23px] font-semibold tracking-tight sm:text-[26px]">
                Posiłki{' '}
                <span className="ml-1.5 text-base font-normal text-foodini-muted">
                  {filteredRecipes.length}
                </span>
              </h1>
              <button
                className="btn-primary"
                disabled={!filteredRecipes.length}
                onClick={() => {
                  const recipe = pickRecipe(filteredRecipes)
                  if (recipe) setSelectedRecipe(recipe)
                }}
              >
                <Icon name="shuffle" size={18} />
                Wylosuj posiłek
              </button>
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:gap-3">
              <input
                type="search"
                className="form-input flex-1"
                placeholder="Szukaj dania lub składnika"
                aria-label="Szukaj dania lub składnika"
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
              <select
                className="form-input sm:w-40"
                value={mealType}
                onChange={event => setMealType(event.target.value)}
                aria-label="Rodzaj posiłku"
              >
                {mealTypes.map(type => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="my-3 mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 sm:my-4">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tagi przepisów">
                {(Object.keys(tagLabels) as RecipeTag[]).map(tag => (
                  <button
                    key={tag}
                    className={`min-h-[44px] cursor-pointer rounded border px-2.5 text-[13px] transition ${
                      selectedTags.includes(tag)
                        ? 'border-brand bg-brand-light font-medium text-brand'
                        : 'border-foodini-border bg-white text-foodini-muted hover:border-brand/40'
                    }`}
                    aria-pressed={selectedTags.includes(tag)}
                    onClick={() =>
                      setSelectedTags(current =>
                        current.includes(tag)
                          ? current.filter(value => value !== tag)
                          : [...current, tag],
                      )
                    }
                  >
                    {tagLabels[tag]}
                  </button>
                ))}
              </div>
              {activeFilterCount > 0 && (
                <button className="btn-text" onClick={clearFilters}>
                  Wyczyść filtry
                </button>
              )}
            </div>
            {selectedTags.length > 1 && (
              <p className="-mt-2 mb-4 text-[13px] text-foodini-muted">
                Dania muszą pasować do wszystkich wybranych tagów.
              </p>
            )}

            {filteredRecipes.length ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {filteredRecipes.map((recipe, index) => (
                  <article
                    className="flex items-start gap-3 rounded-md border border-foodini-border bg-white p-3 sm:gap-4 sm:p-4"
                    key={recipe.id}
                  >
                    <button
                      className="h-[88px] w-[88px] shrink-0 cursor-pointer overflow-hidden rounded border-0 bg-foodini-subtle p-0 sm:h-[104px] sm:w-[104px]"
                      onClick={() => setSelectedRecipe(recipe)}
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      <img
                        src={recipe.imageUrl}
                        alt=""
                        className="block h-full w-full object-cover"
                        loading={index < 3 ? 'eager' : 'lazy'}
                        style={{ objectPosition: recipe.imagePosition }}
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-semibold leading-snug sm:text-[17px]">
                        <button
                          className="min-h-[44px] cursor-pointer bg-transparent p-0 text-left text-inherit hover:text-brand"
                          onClick={() => setSelectedRecipe(recipe)}
                        >
                          {recipe.name}
                        </button>
                      </h2>
                      <p className="mt-1 text-[13px] leading-relaxed text-foodini-muted">
                        {recipe.description}
                      </p>
                      <div className="mt-2.5 text-xs text-foodini-muted">
                        {recipe.prepTimeMinutes} min · {recipe.basePortions}{' '}
                        {portionLabel(recipe.basePortions)}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-foodini-border bg-white p-9 text-center">
                <h2 className="text-base font-semibold sm:text-[17px]">
                  Brak pasujących przepisów
                </h2>
                <p className="my-3 text-sm text-foodini-muted">
                  Zmień wyszukiwanie lub usuń część filtrów.
                </p>
                <button className="btn-secondary mt-4" onClick={clearFilters}>
                  Pokaż wszystkie przepisy
                </button>
              </div>
            )}
            <p className="mt-4 text-xs text-foodini-muted">
              Zdjęcia poglądowe.{' '}
              {filteredRecipes
                .filter(recipe => recipe.imageCredit)
                .map(recipe => {
                  const credit = recipe.imageCredit!
                  return (
                    <span key={recipe.id}>
                      {recipe.name}:{' '}
                      <a
                        className="text-brand underline hover:text-brand-dark"
                        href={credit.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {credit.author}
                      </a>
                      ,{' '}
                      <a
                        className="text-brand underline hover:text-brand-dark"
                        href={credit.licenseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {credit.licenseName}
                      </a>{' '}
                      (miniatura).{' '}
                    </span>
                  )
                })}
            </p>
          </section>
        )}

        {view === 'planner' && (
          <section aria-label="Plan posiłków">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:items-center sm:gap-4">
              <h1 className="text-[23px] font-semibold tracking-tight sm:text-[26px]">Planer</h1>
              <button className="btn-secondary" onClick={() => navigate('shopping')}>
                Przejdź do zakupów
              </button>
            </div>
            <section
              className="grid grid-cols-1 items-end gap-3 rounded-md border border-foodini-border bg-white p-4 sm:grid-cols-2 sm:gap-4 sm:p-5 lg:grid-cols-[140px_140px_1fr_auto]"
              aria-label="Ustawienia planu"
            >
              <div>
                <label htmlFor="duration" className="mb-1.5 block text-[13px] font-medium">
                  Na ile dni?
                </label>
                <select
                  id="duration"
                  className="form-input"
                  value={saved.settings.duration}
                  onChange={event =>
                    setSaved(current => ({
                      ...current,
                      settings: { ...current.settings, duration: Number(event.target.value) },
                    }))
                  }
                >
                  {[3, 4, 5, 6, 7].map(days => (
                    <option key={days} value={days}>
                      {days} dni
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="people" className="mb-1.5 block text-[13px] font-medium">
                  Porcje dziennie
                </label>
                <select
                  id="people"
                  className="form-input"
                  value={saved.settings.people}
                  onChange={event =>
                    setSaved(current => ({
                      ...current,
                      settings: { ...current.settings, people: Number(event.target.value) },
                    }))
                  }
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(people => (
                    <option key={people} value={people}>
                      {people} {portionLabel(people)}
                    </option>
                  ))}
                </select>
              </div>
              <label className="checkbox-label self-end max-sm:col-span-full">
                <input
                  type="checkbox"
                  className="form-checkbox"
                  checked={saved.settings.batch}
                  onChange={event =>
                    setSaved(current => ({
                      ...current,
                      settings: { ...current.settings, batch: event.target.checked },
                    }))
                  }
                />
                Gotuję na dwa dni
              </label>
              <button className="btn-primary self-end max-sm:col-span-full" onClick={createPlan}>
                Ułóż nowy plan
              </button>
              <p className="col-span-full text-[13px] leading-relaxed text-foodini-muted">
                Ustawienia zastosujesz przy układaniu nowego planu. Zablokowane posiłki zachowają
                dania i porcje.
              </p>
            </section>
            <div className="my-4 flex items-center justify-between gap-3 text-sm sm:my-5">
              <p className="text-foodini-muted">
                Dni: {saved.plan.length} · Posiłki do przygotowania: {cookingCount}
              </p>
              <button className="btn-text" onClick={() => navigate('recipes')}>
                {activeFilterCount ? `Aktywne filtry: ${activeFilterCount}` : 'Filtry posiłków'}
              </button>
            </div>
            {activeFilterCount > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-foodini-muted">
                <span>
                  Losujemy z {filteredRecipes.length} pasujących przepisów. Zablokowane dania
                  pozostają bez zmian.
                </span>
                <button className="btn-text" onClick={clearFilters}>
                  Wyczyść filtry
                </button>
              </div>
            )}
            <div className="divide-y divide-foodini-border overflow-hidden rounded-md border border-foodini-border bg-white">
              {saved.plan.map((day, index) => {
                const recipe = recipes.find(recipe => recipe.id === day.recipeId)!
                const locked = isBatchLocked(saved.plan, index)
                return (
                  <article
                    key={day.dayIndex}
                    className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 p-3 transition sm:grid-cols-[70px_minmax(0,1fr)_auto] sm:gap-4 sm:p-4 ${
                      day.isLeftoverDay ? 'bg-foodini-subtle' : ''
                    }`}
                  >
                    <span
                      className={`text-sm font-semibold max-sm:col-start-1 max-sm:row-start-1 ${
                        locked ? 'text-brand' : 'text-foodini-text'
                      }`}
                    >
                      Dzień {index + 1}
                    </span>
                    <div className="min-w-0 max-sm:col-span-2 max-sm:row-start-2">
                      <h2 className="text-base font-semibold leading-snug sm:text-[17px]">
                        <button
                          className="min-h-[44px] cursor-pointer bg-transparent p-0 text-left text-inherit hover:text-brand"
                          onClick={() => setSelectedRecipe(recipe)}
                        >
                          {recipe.name}
                        </button>
                      </h2>
                      <p className="text-[13px] leading-relaxed text-foodini-muted">
                        {day.isLeftoverDay
                          ? `${day.servings} ${portionLabel(day.servings)} · porcja z dnia ${index}`
                          : `${day.servings} ${portionLabel(day.servings)} do przygotowania${day.coversDays === 2 ? ' · na dwa dni' : ''} · ${recipe.prepTimeMinutes} min`}
                      </p>
                    </div>
                    <div className="flex gap-1 justify-self-end max-sm:col-start-2 max-sm:row-start-1">
                      <button
                        className={`btn-icon ${locked ? 'bg-brand-light text-brand' : ''}`}
                        onClick={() => updatePlan(togglePlanLock(saved.plan, index))}
                        aria-label={`${locked ? 'Odblokuj' : 'Zablokuj'} dzień ${index + 1}`}
                        title={locked ? 'Odblokuj posiłek' : 'Zachowaj przy losowaniu'}
                      >
                        <Icon name={locked ? 'lock' : 'unlock'} size={18} />
                      </button>
                      {!day.isLeftoverDay && (
                        <button
                          className="btn-icon"
                          disabled={locked}
                          onClick={() => rerollDay(index)}
                          aria-label={`Wylosuj inne danie na dzień ${index + 1}`}
                          title="Wylosuj inne danie"
                        >
                          <Icon name="shuffle" size={18} />
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {view === 'shopping' && (
          <section aria-label="Zakupy">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:items-center sm:gap-4">
              <h1 className="text-[23px] font-semibold tracking-tight sm:text-[26px]">
                Lista zakupów
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {canShare && (
                  <button
                    className="btn-secondary"
                    onClick={shareShoppingList}
                    disabled={!shoppingItems.length}
                    title="Udostępnij do Google Keep, notatek lub komunikatora"
                  >
                    <Icon name="share" size={17} />
                    Udostępnij
                  </button>
                )}
                <button
                  className="btn-secondary"
                  onClick={downloadShoppingList}
                  disabled={!shoppingItems.length}
                >
                  Pobierz listę
                </button>
                <button
                  className="btn-primary"
                  onClick={copyShoppingList}
                  disabled={!shoppingItems.length}
                >
                  Kopiuj listę
                </button>
              </div>
            </div>
            <div className="my-4 flex items-center justify-between gap-3 text-sm sm:my-5">
              <p className="text-foodini-muted">
                Kupione: {checkedCount} z {shoppingItems.length}
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  className="form-checkbox"
                  checked={hideChecked}
                  onChange={event => setHideChecked(event.target.checked)}
                />
                Ukryj kupione
              </label>
            </div>
            <details className="mb-6 rounded-md border border-foodini-border bg-white px-4">
              <summary className="flex min-h-[48px] cursor-pointer items-center py-3 text-sm font-medium">
                Dodaj produkt
              </summary>
              <form
                onSubmit={addCustomItem}
                className="grid grid-cols-1 items-end gap-3 pb-4 pt-1 sm:grid-cols-2 md:grid-cols-[minmax(140px,2fr)_80px_100px_minmax(140px,1fr)_auto]"
              >
                <div className="max-md:col-span-full">
                  <label htmlFor="custom-name" className="mb-1.5 block text-[13px] font-medium">
                    Nazwa produktu
                  </label>
                  <input
                    id="custom-name"
                    className="form-input"
                    name="name"
                    placeholder="np. Kawa"
                    maxLength={100}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="custom-amount" className="mb-1.5 block text-[13px] font-medium">
                    Ilość
                  </label>
                  <input
                    id="custom-amount"
                    className="form-input"
                    name="amount"
                    type="number"
                    min="0.01"
                    max="99999"
                    step="any"
                    defaultValue="1"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="custom-unit" className="mb-1.5 block text-[13px] font-medium">
                    Jednostka
                  </label>
                  <select id="custom-unit" className="form-input" name="unit" defaultValue="pcs">
                    {Object.entries(unitLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="max-md:col-span-full">
                  <label htmlFor="custom-category" className="mb-1.5 block text-[13px] font-medium">
                    Kategoria
                  </label>
                  <select
                    id="custom-category"
                    className="form-input"
                    name="category"
                    defaultValue="other"
                  >
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="btn-primary" type="submit">
                  Dodaj do listy
                </button>
              </form>
            </details>
            <div className="space-y-6">
              {Object.entries(categoryLabels).map(([category, label]) => {
                const allItems = shoppingItems.filter(item => item.category === category)
                const items = allItems.filter(item => !hideChecked || !item.isChecked)
                if (!items.length) return null
                return (
                  <section key={category}>
                    <div className="flex items-center justify-between gap-3 border-b border-foodini-border pb-2">
                      <h2 className="text-[15px] font-semibold">{label}</h2>
                      <span className="text-xs text-foodini-muted">
                        {allItems.filter(item => item.isChecked).length}/{allItems.length}
                      </span>
                    </div>
                    {items.map(item => (
                      <div
                        className="flex items-center gap-2 border-b border-foodini-border/60"
                        key={item.id}
                      >
                        <label className="flex min-h-[52px] flex-1 cursor-pointer select-none items-center gap-3 py-2.5 text-sm">
                          <input
                            type="checkbox"
                            className="form-checkbox"
                            checked={item.isChecked}
                            onChange={() => toggleShoppingItem(item)}
                          />
                          <span
                            className={`leading-normal ${
                              item.isChecked ? 'text-foodini-muted line-through' : ''
                            }`}
                          >
                            {item.name}
                          </span>
                          <strong
                            className={`ml-auto whitespace-nowrap text-[13px] font-medium ${
                              item.isChecked ? 'text-foodini-muted line-through' : ''
                            }`}
                          >
                            {formatAmount(item.amount)} {unitLabels[item.unit]}
                          </strong>
                        </label>
                        {item.isCustom && (
                          <button
                            className="btn-icon"
                            aria-label={`Usuń produkt: ${item.name}`}
                            onClick={() =>
                              setSaved(current => ({
                                ...current,
                                customItems: current.customItems.filter(
                                  entry => entry.id !== item.id,
                                ),
                              }))
                            }
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </section>
                )
              })}
              {(!shoppingItems.length ||
                (hideChecked && checkedCount === shoppingItems.length)) && (
                <div className="rounded-md border border-foodini-border bg-white p-9 text-center">
                  <h2 className="text-base font-semibold sm:text-[17px]">
                    {shoppingItems.length ? 'Wszystko kupione' : 'Lista jest pusta'}
                  </h2>
                  <button
                    className="btn-secondary mt-4"
                    onClick={() =>
                      shoppingItems.length ? setHideChecked(false) : navigate('planner')
                    }
                  >
                    {shoppingItems.length ? 'Pokaż kupione produkty' : 'Przejdź do planera'}
                  </button>
                </div>
              )}
            </div>
          </section>
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
      <div
        className="fixed bottom-5 left-1/2 z-50 w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {toast && (
          <div
            className="flex items-center gap-2 rounded-md bg-brand-dark py-2 pl-4 pr-2 text-sm leading-normal text-white shadow-lg"
            key={toast.id}
          >
            <span>{toast.message}</span>
            <button
              className="btn-icon text-white hover:bg-white/10"
              aria-label="Zamknij powiadomienie"
              onClick={() => setToast(null)}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
