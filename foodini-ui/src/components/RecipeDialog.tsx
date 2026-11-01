import { useEffect, useRef, useState } from 'react'
import { tagLabels, unitLabels } from '../data/recipes.ts'
import { formatAmount, isBatchLocked, portionLabel } from '../domain.ts'
import type { MealPlanDay, Recipe } from '../types.ts'
import { Icon } from './Icon.tsx'

const difficultyLabels: Record<Recipe['difficulty'], string> = {
  easy: 'Łatwy przepis',
  medium: 'Średni poziom',
  hard: 'Wymagający przepis',
}

export function RecipeDialog({
  recipe,
  plan,
  onClose,
  onAdd,
}: {
  recipe: Recipe
  plan: MealPlanDay[]
  onClose: () => void
  onAdd: (recipeId: string, dayIndex: number) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [portions, setPortions] = useState(recipe.basePortions)
  const availableDays = plan.filter(
    (day, index) => !day.isLeftoverDay && !isBatchLocked(plan, index),
  )
  const [target, setTarget] = useState(availableDays[0]?.dayIndex ?? -1)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  useEffect(() => {
    const node = dialog.current
    if (node && !node.open) {
      node.showModal()
    }
    return () => {
      if (node?.open) {
        node.close()
      }
    }
  }, [])

  async function shareRecipe() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        const text = [
          recipe.name,
          recipe.description,
          '',
          `SKŁADNIKI (${portions} ${portionLabel(portions)}):`,
          ...recipe.ingredients.map(item => {
            const scaled = (item.amount * portions) / recipe.basePortions
            return `• ${item.name} — ${formatAmount(scaled)} ${unitLabels[item.unit]}`
          }),
          '',
          'PRZYGOTOWANIE:',
          ...recipe.instructions.map((step, i) => `${i + 1}. ${step}`),
        ].join('\n')

        await navigator.share({
          title: `Foodini · ${recipe.name}`,
          text,
        })
      } catch {
        // User dismissed share dialog
      }
    }
  }

  return (
    <dialog
      ref={dialog}
      className="dialog-modal"
      onClose={onClose}
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      aria-labelledby="recipe-title"
    >
      <div className="p-5 sm:p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2
            id="recipe-title"
            className="pt-1.5 text-xl font-semibold text-foodini-text sm:text-[22px]"
          >
            {recipe.name}
          </h2>
          <div className="-mr-2 -mt-1 flex items-center gap-1">
            {canShare && (
              <button
                className="btn-icon"
                onClick={shareRecipe}
                aria-label="Udostępnij przepis"
                title="Udostępnij przepis"
              >
                <Icon name="share" />
              </button>
            )}
            <button className="btn-icon" onClick={onClose} aria-label="Zamknij przepis">
              <Icon name="close" />
            </button>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-foodini-muted">{recipe.description}</p>
        <div className="my-4 mb-2 flex flex-wrap gap-4">
          <span className="flex items-center gap-1.5 text-[13px] text-foodini-muted">
            <Icon name="clock" size={17} />
            {recipe.prepTimeMinutes} min
          </span>
          <span className="flex items-center gap-1.5 text-[13px] text-foodini-muted">
            <Icon name="recipes" size={17} />
            {difficultyLabels[recipe.difficulty] ?? 'Średni poziom'}
          </span>
        </div>
        <p className="text-[13px] text-foodini-muted">
          {recipe.tags.map(tag => tagLabels[tag]).join(' · ')}
        </p>
        <div className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[17px] font-semibold">Składniki</h3>
          <div className="flex items-center rounded border border-foodini-border">
            <button
              className="btn-icon"
              disabled={portions <= 1}
              onClick={() => setPortions(value => value - 1)}
              aria-label="Mniej porcji"
            >
              <Icon name="minus" size={16} />
            </button>
            <span className="min-w-[62px] text-center text-[13px]">
              {portions} {portionLabel(portions)}
            </span>
            <button
              className="btn-icon"
              disabled={portions >= 16}
              onClick={() => setPortions(value => value + 1)}
              aria-label="Więcej porcji"
            >
              <Icon name="plus" size={16} />
            </button>
          </div>
        </div>
        <ul className="mb-7 list-none divide-y divide-foodini-border p-0">
          {recipe.ingredients.map(item => (
            <li
              key={`${item.id}:${item.unit}`}
              className="flex items-center justify-between gap-4 py-3 text-[13px] leading-relaxed sm:text-sm"
            >
              <span>{item.name}</span>
              <strong className="whitespace-nowrap font-medium">
                {formatAmount((item.amount * portions) / recipe.basePortions)}{' '}
                {unitLabels[item.unit]}
              </strong>
            </li>
          ))}
        </ul>
        <h3 className="text-[17px] font-semibold">Przygotowanie</h3>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-[1.8]">
          {recipe.instructions.map(instruction => (
            <li key={instruction} className="pl-1">
              {instruction}
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-foodini-border pt-5">
          <div className="w-full">
            <label htmlFor="target-day" className="block text-[15px] font-semibold">
              Dodaj do planu
            </label>
            <p className="mt-1.5 text-[13px] text-foodini-muted">
              Ilości w planie wynikają z jego ustawień.
            </p>
          </div>
          <select
            id="target-day"
            className="form-input flex-1"
            value={target}
            onChange={event => setTarget(Number(event.target.value))}
            disabled={!availableDays.length}
          >
            {availableDays.length ? (
              availableDays.map(day => (
                <option value={day.dayIndex} key={day.dayIndex}>
                  {day.dayLabel}
                  {day.coversDays === 2 ? ' + kolejny dzień' : ''}
                </option>
              ))
            ) : (
              <option value={-1}>Odblokuj dzień w planerze</option>
            )}
          </select>
          <button
            className="btn-primary"
            disabled={target < 0}
            onClick={() => onAdd(recipe.id, target)}
          >
            <Icon name="plus" size={18} />
            Dodaj
          </button>
        </div>
      </div>
    </dialog>
  )
}
