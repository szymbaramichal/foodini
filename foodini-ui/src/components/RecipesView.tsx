import { Icon } from './Icon.tsx'
import { filterRecipes, pickRecipe, portionLabel } from '../domain.ts'
import type { MealType, Recipe } from '../types.ts'

interface RecipesViewProps {
  recipes: Recipe[]
  activeMealTab: MealType
  onMealTabChange: (tab: MealType) => void
  query: string
  onQueryChange: (query: string) => void
  onSelectRecipe: (recipe: Recipe) => void
}

const mealTabs: { id: MealType; label: string }[] = [
  { id: 'lunch', label: 'Obiady' },
  { id: 'dinner', label: 'Kolacje' },
]

export function RecipesView({
  recipes,
  activeMealTab,
  onMealTabChange,
  query,
  onQueryChange,
  onSelectRecipe,
}: RecipesViewProps) {
  const filteredRecipes = filterRecipes(recipes, query, [], activeMealTab)

  return (
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
            if (recipe) onSelectRecipe(recipe)
          }}
        >
          <Icon name="shuffle" size={18} />
          Wylosuj posiłek
        </button>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div
          className="inline-flex rounded-lg border border-foodini-border bg-foodini-subtle p-1 max-sm:w-full"
          role="tablist"
          aria-label="Rodzaj dań"
        >
          {mealTabs.map(tab => {
            const isActive = activeMealTab === tab.id
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                className={`min-h-[40px] flex-1 rounded-md px-5 text-sm font-medium transition cursor-pointer sm:flex-initial ${
                  isActive
                    ? 'bg-white text-brand font-semibold shadow-xs'
                    : 'text-foodini-muted hover:text-foodini-text'
                }`}
                onClick={() => onMealTabChange(tab.id)}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
        <div className="flex flex-1 items-center gap-2">
          <input
            type="search"
            className="form-input flex-1"
            placeholder={
              activeMealTab === 'lunch'
                ? 'Szukaj obiadu lub składnika'
                : 'Szukaj kolacji lub składnika'
            }
            aria-label="Szukaj dania lub składnika"
            value={query}
            onChange={event => onQueryChange(event.target.value)}
          />
          {query.trim() && (
            <button className="btn-text whitespace-nowrap" onClick={() => onQueryChange('')}>
              Wyczyść
            </button>
          )}
        </div>
      </div>

      {filteredRecipes.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filteredRecipes.map((recipe, index) => (
            <article
              className="flex items-start gap-3 rounded-md border border-foodini-border bg-white p-3 sm:gap-4 sm:p-4"
              key={recipe.id}
            >
              <button
                className="h-[88px] w-[88px] shrink-0 cursor-pointer overflow-hidden rounded border-0 bg-foodini-subtle p-0 sm:h-[104px] sm:w-[104px]"
                onClick={() => onSelectRecipe(recipe)}
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
                    onClick={() => onSelectRecipe(recipe)}
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
          <h2 className="text-base font-semibold sm:text-[17px]">Brak pasujących przepisów</h2>
          <p className="my-3 text-sm text-foodini-muted">
            Zmień wyszukiwanie lub przełącz na drugą zakładkę.
          </p>
          {query.trim() && (
            <button className="btn-secondary mt-4" onClick={() => onQueryChange('')}>
              Wyczyść wyszukiwanie
            </button>
          )}
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
  )
}
