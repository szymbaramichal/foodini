import { useEffect, useState } from 'react'
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
import './App.css'

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
    const item: ShoppingItem = {
      id: `custom:${crypto.randomUUID()}`,
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

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Przejdź do treści
      </a>
      <header className="app-header">
        <div className="header-content">
          <button
            className="brand"
            onClick={() => navigate('recipes')}
            aria-label="Foodini — posiłki"
          >
            foodini
          </button>
          <nav className="main-nav" aria-label="Nawigacja główna">
            {navigation.map(item => (
              <button
                key={item.id}
                className={`nav-item ${view === item.id ? 'active' : ''}`}
                onClick={() => navigate(item.id)}
                aria-label={item.label}
                aria-current={view === item.id ? 'page' : undefined}
              >
                {item.label}
                {item.id === 'shopping' && (
                  <span className="nav-count">{shoppingItems.length - checkedCount}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main id="main-content">
        {storageWarning && (
          <div className="storage-warning" role="alert">
            {storageWarning}
            <button
              className="icon-button"
              aria-label="Zamknij informację o zapisie"
              onClick={() => setStorageWarning('')}
            >
              <Icon name="close" size={17} />
            </button>
          </div>
        )}

        {view === 'recipes' && (
          <section aria-label="Przeglądaj przepisy">
            <div className="page-heading">
              <h1>
                Posiłki <span className="muted count">{filteredRecipes.length}</span>
              </h1>
              <button
                className="button primary"
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
            <div className="search-row">
              <input
                type="search"
                placeholder="Szukaj dania lub składnika"
                aria-label="Szukaj dania lub składnika"
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
              <select
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
            <div className="filter-row">
              <div className="filter-chips" role="group" aria-label="Tagi przepisów">
                {(Object.keys(tagLabels) as RecipeTag[]).map(tag => (
                  <button
                    key={tag}
                    className={`filter-chip ${selectedTags.includes(tag) ? 'selected' : ''}`}
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
                <button className="text-button" onClick={clearFilters}>
                  Wyczyść filtry
                </button>
              )}
            </div>
            {selectedTags.length > 1 && (
              <p className="filter-explanation muted">
                Dania muszą pasować do wszystkich wybranych tagów.
              </p>
            )}

            {filteredRecipes.length ? (
              <div className="recipe-grid">
                {filteredRecipes.map((recipe, index) => (
                  <article className="recipe-card" key={recipe.id}>
                    <button
                      className="image-open"
                      onClick={() => setSelectedRecipe(recipe)}
                      aria-label={`Zobacz przepis: ${recipe.name}`}
                    >
                      <img
                        src={recipe.imageUrl}
                        alt={`Zdjęcie poglądowe dania: ${recipe.name}`}
                        loading={index < 3 ? 'eager' : 'lazy'}
                        style={{ objectPosition: recipe.imagePosition }}
                      />
                    </button>
                    <div className="card-body">
                      <button className="card-title" onClick={() => setSelectedRecipe(recipe)}>
                        <h2>{recipe.name}</h2>
                      </button>
                      <p>{recipe.description}</p>
                      <div className="card-footer">
                        {recipe.prepTimeMinutes} min · {recipe.basePortions}{' '}
                        {portionLabel(recipe.basePortions)}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h2>Brak pasujących przepisów</h2>
                <p>Zmień wyszukiwanie lub usuń część filtrów.</p>
                <button className="button secondary" onClick={clearFilters}>
                  Pokaż wszystkie przepisy
                </button>
              </div>
            )}
            <p className="photo-disclaimer muted">
              Zdjęcia poglądowe.{' '}
              {filteredRecipes
                .filter(recipe => recipe.imageCredit)
                .map(recipe => {
                  const credit = recipe.imageCredit!
                  return (
                    <span key={recipe.id}>
                      {recipe.name}: <a href={credit.sourceUrl}>{credit.author}</a>,{' '}
                      <a href={credit.licenseUrl}>{credit.licenseName}</a> (miniatura).{' '}
                    </span>
                  )
                })}
            </p>
          </section>
        )}

        {view === 'planner' && (
          <section aria-label="Plan posiłków">
            <div className="page-heading">
              <h1>Planer</h1>
              <button className="button secondary" onClick={() => navigate('shopping')}>
                Przejdź do zakupów
              </button>
            </div>
            <section className="plan-settings" aria-label="Ustawienia planu">
              <div className="setting-field">
                <label htmlFor="duration">Na ile dni?</label>
                <select
                  id="duration"
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
              <div className="setting-field">
                <label htmlFor="people">Porcje dziennie</label>
                <select
                  id="people"
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
              <label className="checkbox-label batch-setting">
                <input
                  type="checkbox"
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
              <button className="button primary" onClick={createPlan}>
                Ułóż nowy plan
              </button>
              <p className="settings-hint muted">
                Ustawienia zastosujesz przy układaniu nowego planu. Zablokowane posiłki zachowają
                dania i porcje.
              </p>
            </section>
            <div className="section-heading">
              <p className="muted">
                Dni: {saved.plan.length} · Posiłki do przygotowania: {cookingCount}
              </p>
              <button className="text-button" onClick={() => navigate('recipes')}>
                {activeFilterCount ? `Aktywne filtry: ${activeFilterCount}` : 'Filtry posiłków'}
              </button>
            </div>
            {activeFilterCount > 0 && (
              <div className="filter-notice">
                <span>
                  Losujemy z {filteredRecipes.length} pasujących przepisów. Zablokowane dania
                  pozostają bez zmian.
                </span>
                <button className="text-button" onClick={clearFilters}>
                  Wyczyść filtry
                </button>
              </div>
            )}
            <div className="plan-list">
              {saved.plan.map((day, index) => {
                const recipe = recipes.find(recipe => recipe.id === day.recipeId)!
                const locked = isBatchLocked(saved.plan, index)
                return (
                  <article
                    key={day.dayIndex}
                    className={`plan-day ${day.isLeftoverDay ? 'leftover-day' : ''} ${locked ? 'locked-day' : ''}`}
                  >
                    <span className="day-number">Dzień {index + 1}</span>
                    <div className="plan-recipe">
                      <button className="card-title" onClick={() => setSelectedRecipe(recipe)}>
                        <h2>{recipe.name}</h2>
                      </button>
                      <p className="muted">
                        {day.isLeftoverDay
                          ? `${day.servings} ${portionLabel(day.servings)} · porcja z dnia ${index}`
                          : `${day.servings} ${portionLabel(day.servings)} do przygotowania${day.coversDays === 2 ? ' · na dwa dni' : ''} · ${recipe.prepTimeMinutes} min`}
                      </p>
                    </div>
                    <div className="plan-actions">
                      <button
                        className={`icon-button ${locked ? 'is-locked' : ''}`}
                        onClick={() => updatePlan(togglePlanLock(saved.plan, index))}
                        aria-label={`${locked ? 'Odblokuj' : 'Zablokuj'} dzień ${index + 1}`}
                        title={locked ? 'Odblokuj posiłek' : 'Zachowaj przy losowaniu'}
                      >
                        <Icon name={locked ? 'lock' : 'unlock'} size={18} />
                      </button>
                      {!day.isLeftoverDay && (
                        <button
                          className="icon-button"
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
            <div className="page-heading">
              <h1>Lista zakupów</h1>
              <div className="header-actions">
                <button
                  className="button secondary"
                  onClick={downloadShoppingList}
                  disabled={!shoppingItems.length}
                >
                  Pobierz listę
                </button>
                <button
                  className="button primary"
                  onClick={copyShoppingList}
                  disabled={!shoppingItems.length}
                >
                  Kopiuj listę
                </button>
              </div>
            </div>
            <div className="section-heading">
              <p className="muted">
                Kupione: {checkedCount} z {shoppingItems.length}
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={hideChecked}
                  onChange={event => setHideChecked(event.target.checked)}
                />
                Ukryj kupione
              </label>
            </div>
            <details className="custom-item-panel">
              <summary>Dodaj produkt</summary>
              <form onSubmit={addCustomItem}>
                <div className="custom-field custom-name">
                  <label htmlFor="custom-name">Nazwa produktu</label>
                  <input
                    id="custom-name"
                    name="name"
                    placeholder="np. Kawa"
                    maxLength={100}
                    required
                  />
                </div>
                <div className="custom-field">
                  <label htmlFor="custom-amount">Ilość</label>
                  <input
                    id="custom-amount"
                    name="amount"
                    type="number"
                    min="0.01"
                    max="99999"
                    step="any"
                    defaultValue="1"
                    required
                  />
                </div>
                <div className="custom-field">
                  <label htmlFor="custom-unit">Jednostka</label>
                  <select id="custom-unit" name="unit" defaultValue="pcs">
                    {Object.entries(unitLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="custom-field custom-category">
                  <label htmlFor="custom-category">Kategoria</label>
                  <select id="custom-category" name="category" defaultValue="other">
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="button primary" type="submit">
                  Dodaj do listy
                </button>
              </form>
            </details>
            <div className="shopping-layout">
              {Object.entries(categoryLabels).map(([category, label]) => {
                const allItems = shoppingItems.filter(item => item.category === category)
                const items = allItems.filter(item => !hideChecked || !item.isChecked)
                if (!items.length) return null
                return (
                  <section className="shopping-group" key={category}>
                    <div className="group-heading">
                      <h2>{label}</h2>
                      <span className="muted">
                        {allItems.filter(item => item.isChecked).length}/{allItems.length}
                      </span>
                    </div>
                    {items.map(item => (
                      <div
                        className={`shopping-item ${item.isChecked ? 'checked-item' : ''}`}
                        key={item.id}
                      >
                        <label>
                          <input
                            type="checkbox"
                            checked={item.isChecked}
                            onChange={() => toggleShoppingItem(item)}
                          />
                          <span className="item-name">{item.name}</span>
                          <strong>
                            {formatAmount(item.amount)} {unitLabels[item.unit]}
                          </strong>
                        </label>
                        {item.isCustom && (
                          <button
                            className="icon-button"
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
                <div className="empty-state">
                  <h2>{shoppingItems.length ? 'Wszystko kupione' : 'Lista jest pusta'}</h2>
                  <button
                    className="button secondary"
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
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
        {toast && (
          <div className="toast" key={toast.id}>
            <span>{toast.message}</span>
            <button
              className="icon-button"
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
