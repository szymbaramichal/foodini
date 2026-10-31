import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { categoryLabels, recipes, tagLabels, unitLabels } from './data/recipes.ts'
import { aggregateShoppingList, filterRecipes, formatAmount, generatePlan, isBatchLocked, pickRecipe, portionLabel, replacePlanRecipe, retainCheckedItems, shoppingSignature, togglePlanLock } from './domain.ts'
import { loadSavedState, STORAGE_KEY } from './storage.ts'
import type { MealPlanDay, Recipe, RecipeTag, ShoppingItem, ShopCategory, UnitType } from './types.ts'
import { Icon } from './components/Icon.tsx'
import type { IconName } from './components/Icon.tsx'
import { RecipeDialog } from './components/RecipeDialog.tsx'
import './App.css'

type View = 'recipes' | 'planner' | 'shopping'
const navigation: { id: View; label: string; icon: IconName }[] = [
  { id: 'recipes', label: 'Posiłki', icon: 'recipes' },
  { id: 'planner', label: 'Planer', icon: 'calendar' },
  { id: 'shopping', label: 'Lista zakupów', icon: 'basket' },
]
const mealTypes = [{ id: '', label: 'Wszystkie' }, { id: 'breakfast', label: 'Śniadania' }, { id: 'lunch', label: 'Obiady' }, { id: 'dinner', label: 'Kolacje' }, { id: 'snack', label: 'Przekąski' }]

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
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)) }
    catch {
      // Storage is an external system; surface a failed synchronization to the user.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStorageWarning('Nie udało się zapisać zmian. Nie zamykaj strony, jeśli chcesz zachować bieżący plan.')
    }
  }, [saved])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 4500)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const filteredRecipes = filterRecipes(recipes, query, selectedTags, mealType)
  const generatedItems = aggregateShoppingList(saved.plan, recipes).map(item => ({ ...item, isChecked: saved.checked[item.id] === shoppingSignature(item) }))
  const shoppingItems = [...generatedItems, ...saved.customItems]
  const checkedCount = shoppingItems.filter(item => item.isChecked).length
  const cookingCount = saved.plan.filter(day => !day.isLeftoverDay).length
  const activeFilterCount = selectedTags.length + Number(Boolean(query.trim())) + Number(Boolean(mealType))
  const progress = shoppingItems.length ? Math.round(checkedCount / shoppingItems.length * 100) : 0

  function notify(message: string) { setToast({ message, id: Date.now() }) }
  function navigate(nextView: View) { setView(nextView); window.scrollTo({ top: 0 }) }
  function clearFilters() { setQuery(''); setSelectedTags([]); setMealType('') }
  function updatePlan(plan: MealPlanDay[]) {
    setSaved(current => ({ ...current, plan, checked: retainCheckedItems(plan, recipes, current.checked) }))
  }
  function createPlan() {
    try {
      updatePlan(generatePlan(filteredRecipes, saved.settings, saved.plan))
      notify('Plan gotowy! Lista zakupów została zaktualizowana.')
    } catch (error) { notify((error as Error).message) }
  }
  function rerollDay(index: number) {
    const recipe = pickRecipe(filteredRecipes, saved.plan[index].recipeId)
    if (!recipe) return notify('Brak dań pasujących do filtrów. Zmień filtry w widoku Posiłki.')
    if (recipe.id === saved.plan[index].recipeId) return notify('To jedyny przepis pasujący do filtrów. Zmień filtry, aby wybrać inne danie.')
    try { updatePlan(replacePlanRecipe(saved.plan, index, recipe.id)); notify('Posiłek zmieniony. Lista zakupów jest aktualna.') }
    catch (error) { notify((error as Error).message) }
  }
  function addRecipe(recipeId: string, index: number) {
    try {
      updatePlan(replacePlanRecipe(saved.plan, index, recipeId))
      setSelectedRecipe(null)
      navigate('planner')
      notify('Przepis dodany do planu. Składniki są już na liście zakupów.')
    } catch (error) { notify((error as Error).message) }
  }
  function toggleShoppingItem(item: ShoppingItem) {
    setSaved(current => {
      if (item.isCustom) return { ...current, customItems: current.customItems.map(entry => entry.id === item.id ? { ...entry, isChecked: !entry.isChecked } : entry) }
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
    if (!name || name.length > 100 || !Number.isFinite(amount) || amount <= 0) return notify('Wpisz nazwę produktu i ilość większą od zera.')
    const item: ShoppingItem = { id: `custom:${crypto.randomUUID()}`, name, amount, unit: data.get('unit') as UnitType, category: data.get('category') as ShopCategory, isChecked: false, isCustom: true }
    setSaved(current => ({ ...current, customItems: [...current.customItems, item] }))
    form.reset()
    notify('Produkt dodany do listy.')
  }
  function shoppingText() {
    return ['FOODINI · LISTA ZAKUPÓW', `Plan na ${saved.plan.length} dni`, '', ...Object.entries(categoryLabels).flatMap(([category, label]) => {
      const items = shoppingItems.filter(item => item.category === category)
      return items.length ? [label.toLocaleUpperCase('pl'), ...items.map(item => `${item.isChecked ? '☑' : '☐'} ${item.name} — ${formatAmount(item.amount)} ${unitLabels[item.unit]}`), ''] : []
    })].join('\n')
  }
  async function copyShoppingList() {
    try { await navigator.clipboard.writeText(shoppingText()); notify('Lista skopiowana. Możesz ją teraz wkleić do wiadomości.') }
    catch { notify('Przeglądarka nie pozwoliła skopiować listy. Skorzystaj z przycisku „Pobierz listę”.') }
  }
  function downloadShoppingList() {
    const url = URL.createObjectURL(new Blob([shoppingText()], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'foodini-lista-zakupow.txt'; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify('Lista zakupów została pobrana.')
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Przejdź do treści</a>
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate('recipes')} aria-label="Foodini — posiłki"><span className="brand-mark"><Icon name="leaf" size={27} /></span>foodini<span className="brand-dot">.</span></button>
      <p className="brand-caption">Dobrze zjeść. Prosto żyć.</p>
      <div className="nav-label">TWOJA KUCHNIA</div>
      <nav aria-label="Nawigacja główna">{navigation.map(item => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)} aria-label={item.label} aria-current={view === item.id ? 'page' : undefined}><Icon name={item.icon} /><span>{item.label}</span>{item.id === 'shopping' && <span className="nav-count">{shoppingItems.length - checkedCount}</span>}{item.id === 'recipes' && <span className="nav-count">{recipes.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-tip"><span className="tip-icon"><Icon name="leaf" size={23} /></span><h3>Mały plan.<br />Duża różnica.</h3><p>Gotuj na dwa dni i zostaw więcej czasu dla siebie.</p><button onClick={() => navigate('planner')}>Ułóż swój plan <Icon name="arrow" size={16} /></button></div><div className="sidebar-footer"><span className="online-dot" />Twoja codzienna inspiracja<span>POC</span></div></div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">Twoja kuchnia <Icon name="chevron" size={13} /><span>{navigation.find(item => item.id === view)?.label}</span></div><div className="topbar-right"><span className="save-status"><span className={`online-dot ${storageWarning ? 'warning-dot' : ''}`} />{storageWarning ? 'Sprawdź zapis' : 'Zapis w przeglądarce'}</span><span className="avatar" aria-label="Twoja kuchnia"><Icon name="leaf" size={19} /></span></div></header>
      <main id="main-content">
        {storageWarning && <div className="storage-warning" role="alert">{storageWarning}<button className="icon-button" aria-label="Zamknij informację o zapisie" onClick={() => setStorageWarning('')}><Icon name="close" size={17} /></button></div>}

        {view === 'recipes' && <>
          <section className="page-intro"><div><div className="eyebrow"><span />MNIEJ ZASTANAWIANIA, WIĘCEJ SMAKU</div><h1>Coś dobrego<br />na <em>każdy dzień.</em></h1><p>Twoje ulubione dania, prosty plan i zakupy z głowy.</p></div><div className="intro-note"><span className="note-icon"><Icon name="calendar" size={24} /></span><div><span className="small muted">TWÓJ PLAN W PIGUŁCE</span><h3>{saved.plan.length} dni, {cookingCount} gotowania<span className="green-dot">.</span></h3><p>Więcej czasu. Mniej „co dziś zjeść?”.</p><button className="text-button" onClick={() => navigate('planner')}>Zobacz swój plan <Icon name="arrow" size={17} /></button></div></div></section>
          <section className="recipe-workspace" aria-label="Przeglądaj przepisy">
            <div className="section-heading"><div><h2>Twoje przepisy <span className="heading-count">{String(filteredRecipes.length).padStart(2, '0')}</span></h2><p>Sprawdzone pomysły. Po prostu wybierz coś dla siebie.</p></div><button className="button primary random-button" disabled={!filteredRecipes.length} onClick={() => { const recipe = pickRecipe(filteredRecipes); if (recipe) setSelectedRecipe(recipe) }}><Icon name="shuffle" size={18} />Wylosuj posiłek</button></div>
            <div className="search-row"><label className="search-box"><Icon name="search" size={20} /><input type="search" placeholder="Na co masz ochotę? Szukaj dania lub składnika..." aria-label="Szukaj dania lub składnika" value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="icon-button" onClick={() => setQuery('')} aria-label="Wyczyść wyszukiwanie"><Icon name="close" size={16} /></button>}</label><span className="recipe-total">{recipes.length} pomysłów na dobry posiłek</span></div>
            <div className="meal-tabs" role="group" aria-label="Rodzaj posiłku">{mealTypes.map(type => <button key={type.id} aria-pressed={mealType === type.id} className={mealType === type.id ? 'selected' : ''} onClick={() => setMealType(type.id)}>{type.label}</button>)}</div>
            <div className="filter-row"><span className="filter-label">Mam ochotę na:</span><div className="filter-chips">{(Object.keys(tagLabels) as RecipeTag[]).map(tag => <button key={tag} className={`filter-chip ${selectedTags.includes(tag) ? 'selected' : ''}`} aria-pressed={selectedTags.includes(tag)} onClick={() => setSelectedTags(current => current.includes(tag) ? current.filter(value => value !== tag) : [...current, tag])}>{selectedTags.includes(tag) ? <Icon name="check" size={14} /> : tag === 'vegetarian' || tag === 'vegan' ? <Icon name="leaf" size={14} /> : null}{tagLabels[tag]}</button>)}</div>{activeFilterCount > 0 && <button className="clear-filters" onClick={clearFilters}>Wyczyść filtry <Icon name="close" size={13} /></button>}</div>
            {selectedTags.length > 1 && <p className="filter-explanation">Pokazujemy dania pasujące do wszystkich wybranych tagów.</p>}
            {filteredRecipes.length ? <div className="recipe-grid">{filteredRecipes.map((recipe, index) => <article className="recipe-card" key={recipe.id} style={{ animationDelay: `${index * 45}ms` }}><div className="card-image"><button className="image-open" onClick={() => setSelectedRecipe(recipe)} aria-label={`Zobacz przepis: ${recipe.name}`}><img src={recipe.imageUrl} alt={`Zdjęcie poglądowe dania: ${recipe.name}`} loading={index < 3 ? 'eager' : 'lazy'} style={{ objectPosition: recipe.imagePosition }} /></button><span className="image-label">{recipe.mealType === 'lunch' ? 'OBIAD' : 'KOLACJA'}</span><button className="card-add" aria-label={`Dodaj do planu: ${recipe.name}`} onClick={() => setSelectedRecipe(recipe)}><Icon name="plus" size={20} /></button></div><div className="card-body"><button className="card-title" onClick={() => setSelectedRecipe(recipe)}><h3>{recipe.name}</h3></button><p>{recipe.description}</p><div className="tag-list">{recipe.tags.slice(0, 2).map(tag => <span key={tag} className={`tag tag-${tag}`}>{tagLabels[tag]}</span>)}{recipe.tags.length > 2 && <span className="tag tag-extra" title={recipe.tags.slice(2).map(tag => tagLabels[tag]).join(', ')}>+{recipe.tags.length - 2}</span>}</div><div className="card-footer"><span><Icon name="clock" size={16} />{recipe.prepTimeMinutes} min</span><span><Icon name="people" size={16} />{recipe.basePortions} {portionLabel(recipe.basePortions)}</span><button onClick={() => setSelectedRecipe(recipe)} aria-label={`Otwórz przepis: ${recipe.name}`}><Icon name="arrow" size={18} /></button></div></div></article>)}</div> : <div className="empty-state"><span className="empty-icon"><Icon name="search" size={30} /></span><h3>Jeszcze nie mamy takiego połączenia</h3><p>Zmień wyszukiwanie lub usuń część filtrów.<br />W kolekcji czeka siedem pysznych propozycji.</p><button className="button secondary" onClick={clearFilters}>Pokaż wszystkie przepisy</button></div>}
          </section>
          <div className="bottom-note"><Icon name="leaf" size={16} /><span>Dobre jedzenie zaczyna się od prostego planu.</span><span className="photo-disclaimer">Zdjęcia potraw są poglądowe.</span></div>
        </>}

        {view === 'planner' && <>
          <section className="page-intro compact-intro"><div><div className="eyebrow"><span />TWÓJ TYDZIEŃ, PO TWOJEMU</div><h1>Mniej gotowania.<br /><em>Więcej dla siebie.</em></h1><p>Ułóż plan, a my zbierzemy składniki na jednej liście.</p></div><button className="button secondary" onClick={() => navigate('shopping')}><Icon name="basket" size={18} />Przejdź do zakupów<Icon name="arrow" size={17} /></button></section>
          <section className="plan-settings" aria-label="Ustawienia planu"><div className="setting-field"><label htmlFor="duration">Na ile dni?</label><select id="duration" value={saved.settings.duration} onChange={event => setSaved(current => ({ ...current, settings: { ...current.settings, duration: Number(event.target.value) } }))}>{[3, 4, 5, 6, 7].map(days => <option key={days} value={days}>{days} dni</option>)}</select></div><div className="setting-field"><label htmlFor="people">Porcje dziennie</label><select id="people" value={saved.settings.people} onChange={event => setSaved(current => ({ ...current, settings: { ...current.settings, people: Number(event.target.value) } }))}>{[1, 2, 3, 4, 5, 6, 7, 8].map(people => <option key={people} value={people}>{people} {portionLabel(people)}</option>)}</select></div><label className="batch-setting"><input type="checkbox" checked={saved.settings.batch} onChange={event => setSaved(current => ({ ...current, settings: { ...current.settings, batch: event.target.checked } }))} /><span className="toggle-track" /><span><strong>Gotuję na dwa dni</strong><small>Raz gotujesz, dwa razy jesz.</small></span></label><button className="button primary" onClick={createPlan}><Icon name="shuffle" size={18} />Ułóż nowy plan</button><p className="settings-hint">Ustawienia zastosujesz przy układaniu nowego planu. Zablokowane posiłki zachowają dania i porcje.</p></section>
          <div className="section-heading plan-heading"><div><h2>Twój plan na {saved.plan.length} dni <span className="heading-count">{cookingCount} gotowania</span></h2><p>Lista zakupów aktualizuje się razem z planem.</p></div><button className="text-button" onClick={() => navigate('recipes')}>{activeFilterCount ? `Aktywne filtry: ${activeFilterCount}` : 'Wybierz preferencje'}<Icon name="arrow" size={16} /></button></div>
          {activeFilterCount > 0 && <div className="filter-notice"><Icon name="search" size={17} /><span>Losujemy z {filteredRecipes.length} pasujących przepisów. Zablokowane dania pozostają bez zmian.</span><button onClick={clearFilters}>Wyczyść filtry</button></div>}
          <div className="plan-list">{saved.plan.map((day, index) => {
            const recipe = recipes.find(recipe => recipe.id === day.recipeId)!
            const locked = isBatchLocked(saved.plan, index)
            return <article key={day.dayIndex} className={`plan-day ${day.isLeftoverDay ? 'leftover-day' : ''} ${locked ? 'locked-day' : ''}`}><div className="day-number"><span>DZIEŃ</span><strong>{String(index + 1).padStart(2, '0')}</strong></div>{day.isLeftoverDay ? <div className="leftover-symbol"><Icon name="leaf" size={25} /></div> : <button className="plan-photo" onClick={() => setSelectedRecipe(recipe)} aria-label={`Zobacz przepis: ${recipe.name}`}><img src={recipe.imageUrl} alt="" /></button>}<div className="plan-recipe"><span className="plan-meal-label">{day.isLeftoverDay ? `PORCJA Z DNIA ${index}` : 'DZIŚ GOTUJESZ'}</span><button className="card-title" onClick={() => setSelectedRecipe(recipe)}><h3>{recipe.name}</h3></button><p>{day.isLeftoverDay ? `${day.servings} ${portionLabel(day.servings)} · Gotowe, wystarczy podgrzać.` : `${day.servings} ${portionLabel(day.servings)} do przygotowania${day.coversDays === 2 ? ' · na dwa dni' : ''}`}</p></div><div className="plan-day-end">{!day.isLeftoverDay && <span className="plan-time"><Icon name="clock" size={16} />{recipe.prepTimeMinutes} min</span>}{day.isLeftoverDay && <span className="leftover-badge">Dziś odpoczywasz</span>}<div className="plan-actions"><button className={`icon-button ${locked ? 'is-locked' : ''}`} onClick={() => updatePlan(togglePlanLock(saved.plan, index))} aria-label={`${locked ? 'Odblokuj' : 'Zablokuj'} dzień ${index + 1}`} title={locked ? 'Odblokuj posiłek' : 'Zachowaj przy losowaniu'}><Icon name={locked ? 'lock' : 'unlock'} size={18} /></button>{!day.isLeftoverDay && <button className="icon-button" disabled={locked} onClick={() => rerollDay(index)} aria-label={`Wylosuj inne danie na dzień ${index + 1}`} title="Wylosuj inne danie"><Icon name="shuffle" size={18} /></button>}</div></div></article>
          })}</div>
          <div className="plan-footer"><Icon name="sparkle" size={23} /><div><strong>Plan gotowy? Zakupy też.</strong><p>Wszystkie potrzebne składniki czekają na jednej liście.</p></div><button className="button primary" onClick={() => navigate('shopping')}>Zobacz listę zakupów<Icon name="arrow" size={17} /></button></div>
        </>}

        {view === 'shopping' && <>
          <section className="page-intro compact-intro"><div><div className="eyebrow"><span />DO SKLEPU Z DOBRYM PLANEM</div><h1>Wszystko na liście.<br /><em>Spokojna głowa.</em></h1><p>Składniki z Twojego planu, zebrane w jednym miejscu.</p></div><div className="shopping-header-actions"><button className="button secondary" onClick={downloadShoppingList} disabled={!shoppingItems.length}>Pobierz listę</button><button className="button primary" onClick={copyShoppingList} disabled={!shoppingItems.length}><Icon name="copy" size={18} />Kopiuj listę</button></div></section>
          <section className="shopping-summary"><span className="summary-icon"><Icon name="basket" size={29} /></span><div className="shopping-summary-text"><h2>{shoppingItems.length - checkedCount === 0 && shoppingItems.length ? 'Wszystko kupione. Czas na gotowanie!' : 'Twoje zakupy, krok po kroku.'}</h2><p>{saved.plan.length} dni w planie · {cookingCount} gotowania · składniki połączone bez powtórek</p></div><div className="shopping-progress"><span><strong>{checkedCount}</strong> / {shoppingItems.length} kupionych</span><div className="progress-track" role="progressbar" aria-label="Postęp zakupów" aria-valuenow={checkedCount} aria-valuemin={0} aria-valuemax={shoppingItems.length || 1}><div style={{ width: `${progress}%` }} /></div></div></section>
          <div className="section-heading shopping-list-heading"><div><h2>Lista zakupów <span className="heading-count">{shoppingItems.length}</span></h2><p>Ilości uwzględniają porcje i gotowanie na dwa dni.</p></div><label className="hide-checked"><input type="checkbox" checked={hideChecked} onChange={event => setHideChecked(event.target.checked)} />Ukryj kupione</label></div>
          <div className="shopping-layout"><div className="shopping-groups">{Object.entries(categoryLabels).map(([category, label]) => {
            const allItems = shoppingItems.filter(item => item.category === category)
            const items = allItems.filter(item => !hideChecked || !item.isChecked)
            if (!items.length) return null
            return <section className="shopping-group" key={category}><div className="group-heading"><h3>{label}</h3><span>{allItems.filter(item => item.isChecked).length}/{allItems.length}</span></div>{items.map(item => <div className={`shopping-item ${item.isChecked ? 'checked-item' : ''}`} key={item.id}><label><input type="checkbox" checked={item.isChecked} onChange={() => toggleShoppingItem(item)} /><span className="item-name">{item.name}{item.isCustom && <span className="custom-label">Dodane przez Ciebie</span>}</span><strong>{formatAmount(item.amount)} {unitLabels[item.unit]}</strong></label>{item.isCustom && <button className="icon-button delete-item" aria-label={`Usuń produkt: ${item.name}`} onClick={() => setSaved(current => ({ ...current, customItems: current.customItems.filter(entry => entry.id !== item.id) }))}><Icon name="trash" size={16} /></button>}</div>)}</section>
          })}{(!shoppingItems.length || (hideChecked && checkedCount === shoppingItems.length)) && <div className="empty-state"><span className="empty-icon"><Icon name="check" size={30} /></span><h3>{shoppingItems.length ? 'Wszystko odhaczone!' : 'Zacznij od dobrego planu'}</h3><p>{shoppingItems.length ? 'Masz wszystko, czego potrzebujesz.' : 'Ułóż plan posiłków, aby przygotować listę zakupów.'}</p><button className="button secondary" onClick={() => shoppingItems.length ? setHideChecked(false) : navigate('planner')}>{shoppingItems.length ? 'Pokaż kupione produkty' : 'Przejdź do planera'}</button></div>}</div>
          <aside className="custom-item-panel"><span className="panel-icon"><Icon name="plus" size={22} /></span><h3>Coś jeszcze?</h3><p>Kawa, ulubiony owoc, coś na potem.<br />Dodaj własny produkt do listy.</p><form onSubmit={addCustomItem}><label htmlFor="custom-name">Nazwa produktu</label><input id="custom-name" name="name" placeholder="np. Kawa" maxLength={100} required /><div className="custom-amount-row"><div><label htmlFor="custom-amount">Ilość</label><input id="custom-amount" name="amount" type="number" min="0.01" max="99999" step="any" defaultValue="1" required /></div><div><label htmlFor="custom-unit">Jednostka</label><select id="custom-unit" name="unit" defaultValue="pcs">{Object.entries(unitLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div><label htmlFor="custom-category">Kategoria</label><select id="custom-category" name="category" defaultValue="other">{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="button primary" type="submit"><Icon name="plus" size={17} />Dodaj do listy</button></form><div className="custom-tip"><Icon name="leaf" size={18} /><span>Sprawdź szafki przed zakupami. To, co już masz, możesz od razu odhaczyć.</span></div></aside></div>
        </>}
        <footer className="page-footer"><span>foodini<span className="green-dot">.</span></span><p>Mniej planowania. Więcej smaku.</p><span>Twoja mała pomoc w kuchni</span></footer>
      </main>
    </div>
    {selectedRecipe && <RecipeDialog key={selectedRecipe.id} recipe={selectedRecipe} plan={saved.plan} onClose={() => setSelectedRecipe(null)} onAdd={addRecipe} />}
    <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">{toast && <div className="toast" key={toast.id}><Icon name="check" size={18} /><span>{toast.message}</span><button className="icon-button" aria-label="Zamknij powiadomienie" onClick={() => setToast(null)}><Icon name="close" size={16} /></button></div>}</div>
  </div>
}

export default App
