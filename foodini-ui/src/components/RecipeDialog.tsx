import { useEffect, useRef, useState } from 'react'
import { tagLabels, unitLabels } from '../data/recipes.ts'
import { formatAmount, isBatchLocked, portionLabel } from '../domain.ts'
import type { MealPlanDay, Recipe } from '../types.ts'
import { Icon } from './Icon.tsx'

export function RecipeDialog({ recipe, plan, onClose, onAdd }: { recipe: Recipe; plan: MealPlanDay[]; onClose: () => void; onAdd: (recipeId: string, dayIndex: number) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [portions, setPortions] = useState(recipe.basePortions)
  const availableDays = plan.filter((day, index) => !day.isLeftoverDay && !isBatchLocked(plan, index))
  const [target, setTarget] = useState(availableDays[0]?.dayIndex ?? -1)
  useEffect(() => { dialog.current?.showModal() }, [])

  return <dialog ref={dialog} className="recipe-dialog" onClose={onClose} onClick={event => { if (event.target === event.currentTarget) onClose() }} aria-labelledby="recipe-title">
    <div className="dialog-body">
      <div className="dialog-heading">
        <h2 id="recipe-title">{recipe.name}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Zamknij przepis"><Icon name="close" /></button>
      </div>
      <p className="muted">{recipe.description}</p>
      <div className="recipe-meta"><span><Icon name="clock" size={17} />{recipe.prepTimeMinutes} min</span><span><Icon name="recipes" size={17} />{recipe.difficulty === 'easy' ? 'Łatwy przepis' : 'Średni poziom'}</span></div>
      <p className="recipe-tags muted">{recipe.tags.map(tag => tagLabels[tag]).join(' · ')}</p>
      <div className="ingredients-heading"><h3>Składniki</h3><div className="portion-stepper"><button className="icon-button" disabled={portions <= 1} onClick={() => setPortions(value => value - 1)} aria-label="Mniej porcji"><Icon name="minus" size={16} /></button><span>{portions} {portionLabel(portions)}</span><button className="icon-button" disabled={portions >= 16} onClick={() => setPortions(value => value + 1)} aria-label="Więcej porcji"><Icon name="plus" size={16} /></button></div></div>
      <ul className="ingredient-list">{recipe.ingredients.map(item => <li key={`${item.id}:${item.unit}`}><span>{item.name}</span><strong>{formatAmount(item.amount * portions / recipe.basePortions)} {unitLabels[item.unit]}</strong></li>)}</ul>
      <h3>Przygotowanie</h3>
      <ol className="instruction-list">{recipe.instructions.map(instruction => <li key={instruction}>{instruction}</li>)}</ol>
      <div className="add-to-plan"><div><label htmlFor="target-day">Dodaj do planu</label><p className="small muted">Ilości w planie wynikają z jego ustawień.</p></div><select id="target-day" value={target} onChange={event => setTarget(Number(event.target.value))} disabled={!availableDays.length}>{availableDays.length ? availableDays.map(day => <option value={day.dayIndex} key={day.dayIndex}>{day.dayLabel}{day.coversDays === 2 ? ' + kolejny dzień' : ''}</option>) : <option value={-1}>Odblokuj dzień w planerze</option>}</select><button className="button primary" disabled={target < 0} onClick={() => onAdd(recipe.id, target)}><Icon name="plus" size={18} />Dodaj</button></div>
    </div>
  </dialog>
}
