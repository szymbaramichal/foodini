import { Icon } from './Icon.tsx'
import { isBatchLocked, portionLabel } from '../domain.ts'
import type { MealPlanDay, MealSlot, MealType, PlanSettings, Recipe } from '../types.ts'

interface MealPlanSlotRowProps {
  mealType: MealType
  slot: MealSlot
  recipe: Recipe
  dayIndex: number
  isLocked: boolean
  onSelectRecipe: (recipe: Recipe) => void
  onToggleLock: () => void
  onReroll: () => void
}

function MealPlanSlotRow({
  mealType,
  slot,
  recipe,
  dayIndex,
  isLocked,
  onSelectRecipe,
  onToggleLock,
  onReroll,
}: MealPlanSlotRowProps) {
  const isLunch = mealType === 'lunch'
  const slotLabel = isLunch ? 'Obiad' : 'Kolacja'
  const slotAccusative = isLunch ? 'obiad' : 'kolację'

  return (
    <div
      className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 p-3.5 transition sm:grid-cols-[85px_minmax(0,1fr)_auto] sm:gap-4 sm:p-4 ${
        slot.isLeftoverDay ? 'bg-foodini-subtle/50' : ''
      }`}
    >
      <span
        className={`text-xs font-semibold uppercase tracking-wider max-sm:col-start-1 max-sm:row-start-1 ${
          isLocked ? 'text-brand' : 'text-foodini-muted'
        }`}
      >
        {slotLabel}
      </span>
      <div className="min-w-0 max-sm:col-span-2 max-sm:row-start-2">
        <h2 className="text-base font-semibold leading-snug sm:text-[17px]">
          <button
            className="min-h-[44px] cursor-pointer bg-transparent p-0 text-left text-inherit hover:text-brand"
            onClick={() => onSelectRecipe(recipe)}
          >
            {recipe.name}
          </button>
        </h2>
        <p className="text-[13px] leading-relaxed text-foodini-muted">
          {slot.isLeftoverDay
            ? `${slot.servings} ${portionLabel(slot.servings)} · porcja z wczoraj (dzień ${dayIndex})`
            : `${slot.servings} ${portionLabel(slot.servings)} do przygotowania${
                slot.coversDays === 2 ? ' · na dwa dni' : ''
              } · ${recipe.prepTimeMinutes} min`}
        </p>
      </div>
      <div className="flex gap-1 justify-self-end max-sm:col-start-2 max-sm:row-start-1">
        <button
          className={`btn-icon ${isLocked ? 'bg-brand-light text-brand' : ''}`}
          onClick={onToggleLock}
          aria-label={`${isLocked ? 'Odblokuj' : 'Zablokuj'} ${slotAccusative} na dzień ${dayIndex + 1}`}
          title={
            isLocked ? `Odblokuj ${slotAccusative}` : `Zachowaj ${slotAccusative} przy losowaniu`
          }
        >
          <Icon name={isLocked ? 'lock' : 'unlock'} size={18} />
        </button>
        {!slot.isLeftoverDay && (
          <button
            className="btn-icon"
            disabled={isLocked}
            onClick={onReroll}
            aria-label={`Wylosuj inn${isLunch ? 'y obiad' : 'ą kolację'} na dzień ${dayIndex + 1}`}
            title={`Wylosuj inn${isLunch ? 'y obiad' : 'ą kolację'}`}
          >
            <Icon name="shuffle" size={18} />
          </button>
        )}
      </div>
    </div>
  )
}

interface PlannerViewProps {
  plan: MealPlanDay[]
  settings: PlanSettings
  allRecipes: Recipe[]
  onUpdateSettings: (updater: (prev: PlanSettings) => PlanSettings) => void
  onCreatePlan: () => void
  onToggleLock: (dayIndex: number, mealType: MealType) => void
  onRerollSlot: (dayIndex: number, mealType: MealType) => void
  onSelectRecipe: (recipe: Recipe) => void
  onNavigateToShopping: () => void
  onNavigateToRecipes: () => void
}

export function PlannerView({
  plan,
  settings,
  allRecipes,
  onUpdateSettings,
  onCreatePlan,
  onToggleLock,
  onRerollSlot,
  onSelectRecipe,
  onNavigateToShopping,
  onNavigateToRecipes,
}: PlannerViewProps) {
  const cookingCount = plan.reduce(
    (sum, day) => sum + Number(!day.lunch.isLeftoverDay) + Number(!day.dinner.isLeftoverDay),
    0,
  )

  return (
    <section aria-label="Plan posiłków">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:items-center sm:gap-4">
        <h1 className="text-[23px] font-semibold tracking-tight sm:text-[26px]">Planer</h1>
        <button className="btn-secondary" onClick={onNavigateToShopping}>
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
            value={settings.duration}
            onChange={event =>
              onUpdateSettings(current => ({
                ...current,
                duration: Number(event.target.value),
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
            Porcje posiłku
          </label>
          <select
            id="people"
            className="form-input"
            value={settings.people}
            onChange={event =>
              onUpdateSettings(current => ({
                ...current,
                people: Number(event.target.value),
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
            checked={settings.batch}
            onChange={event =>
              onUpdateSettings(current => ({
                ...current,
                batch: event.target.checked,
              }))
            }
          />
          Gotuję na dwa dni
        </label>
        <button className="btn-primary self-end max-sm:col-span-full" onClick={onCreatePlan}>
          Ułóż nowy plan
        </button>
        <p className="col-span-full text-[13px] leading-relaxed text-foodini-muted">
          Plan układa obiad i kolację na każdy dzień. Obiady można przygotowywać na dwa dni, a
          kolacje są zawsze na jeden dzień. Zablokowane posiłki zachowają dania i porcje.
        </p>
      </section>

      <div className="my-4 flex items-center justify-between gap-3 text-sm sm:my-5">
        <p className="text-foodini-muted">
          Dni: {plan.length} · Posiłki do przygotowania: {cookingCount}
        </p>
        <button className="btn-text" onClick={onNavigateToRecipes}>
          Przeglądaj posiłki
        </button>
      </div>

      <div className="space-y-4">
        {plan.map((day, index) => {
          const lunchRecipe = allRecipes.find(recipe => recipe.id === day.lunch.recipeId)!
          const dinnerRecipe = allRecipes.find(recipe => recipe.id === day.dinner.recipeId)!
          const lunchLocked = isBatchLocked(plan, index, 'lunch')
          const dinnerLocked = isBatchLocked(plan, index, 'dinner')

          return (
            <article
              key={day.dayIndex}
              className="overflow-hidden rounded-md border border-foodini-border bg-white"
            >
              <div className="border-b border-foodini-border bg-foodini-subtle/80 px-4 py-2 sm:px-5">
                <span className="text-sm font-semibold text-foodini-text">Dzień {index + 1}</span>
              </div>

              <div className="divide-y divide-foodini-border/60">
                <MealPlanSlotRow
                  mealType="lunch"
                  slot={day.lunch}
                  recipe={lunchRecipe}
                  dayIndex={index}
                  isLocked={lunchLocked}
                  onSelectRecipe={onSelectRecipe}
                  onToggleLock={() => onToggleLock(index, 'lunch')}
                  onReroll={() => onRerollSlot(index, 'lunch')}
                />
                <MealPlanSlotRow
                  mealType="dinner"
                  slot={day.dinner}
                  recipe={dinnerRecipe}
                  dayIndex={index}
                  isLocked={dinnerLocked}
                  onSelectRecipe={onSelectRecipe}
                  onToggleLock={() => onToggleLock(index, 'dinner')}
                  onReroll={() => onRerollSlot(index, 'dinner')}
                />
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
