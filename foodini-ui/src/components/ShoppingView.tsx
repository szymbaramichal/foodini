import { useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from './Icon.tsx'
import { categoryLabels, unitLabels } from '../data/recipes.ts'
import { formatAmount } from '../domain.ts'
import type { ShopCategory, ShoppingItem, UnitType } from '../types.ts'

interface ShoppingViewProps {
  items: ShoppingItem[]
  planDuration: number
  onToggleItem: (item: ShoppingItem) => void
  onAddCustomItem: (item: ShoppingItem) => void
  onDeleteCustomItem: (id: string) => void
  onNotify: (message: string) => void
  onNavigateToPlanner: () => void
}

export function ShoppingView({
  items,
  planDuration,
  onToggleItem,
  onAddCustomItem,
  onDeleteCustomItem,
  onNotify,
  onNavigateToPlanner,
}: ShoppingViewProps) {
  const [hideChecked, setHideChecked] = useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const checkedCount = items.filter(item => item.isChecked).length

  function shoppingText() {
    return [
      'FOODINI · LISTA ZAKUPÓW',
      `Plan na ${planDuration} dni (obiady i kolacje)`,
      '',
      ...Object.entries(categoryLabels).flatMap(([category, label]) => {
        const categoryItems = items.filter(item => item.category === category)
        return categoryItems.length
          ? [
              label.toLocaleUpperCase('pl'),
              ...categoryItems.map(
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
      onNotify('Lista skopiowana. Możesz ją teraz wkleić do wiadomości.')
    } catch {
      onNotify(
        'Przeglądarka nie pozwoliła skopiować listy. Skorzystaj z przycisku „Pobierz listę”.',
      )
    }
  }

  async function shareShoppingList() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Foodini · Lista zakupów',
          text: shoppingText(),
        })
        onNotify('Lista zakupów została udostępniona.')
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
    onNotify('Lista zakupów została pobrana.')
  }

  function handleSubmitCustomItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    const amount = Number(data.get('amount'))
    if (!name || name.length > 100 || !Number.isFinite(amount) || amount <= 0) {
      return onNotify('Wpisz nazwę produktu i ilość większą od zera.')
    }

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

    onAddCustomItem(item)
    form.reset()
    onNotify('Produkt dodany do listy.')
  }

  return (
    <section aria-label="Zakupy">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:items-center sm:gap-4">
        <h1 className="text-[23px] font-semibold tracking-tight sm:text-[26px]">Lista zakupów</h1>
        <div className="flex flex-wrap items-center gap-2">
          {canShare && (
            <button
              className="btn-secondary"
              onClick={shareShoppingList}
              disabled={!items.length}
              title="Udostępnij do Google Keep, notatek lub komunikatora"
            >
              <Icon name="share" size={17} />
              Udostępnij
            </button>
          )}
          <button className="btn-secondary" onClick={downloadShoppingList} disabled={!items.length}>
            Pobierz listę
          </button>
          <button className="btn-primary" onClick={copyShoppingList} disabled={!items.length}>
            Kopiuj listę
          </button>
        </div>
      </div>

      <div className="my-4 flex items-center justify-between gap-3 text-sm sm:my-5">
        <p className="text-foodini-muted">
          Kupione: {checkedCount} z {items.length}
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
          onSubmit={handleSubmitCustomItem}
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
          const allCategoryItems = items.filter(item => item.category === category)
          const visibleItems = allCategoryItems.filter(item => !hideChecked || !item.isChecked)
          if (!visibleItems.length) return null
          return (
            <section key={category}>
              <div className="flex items-center justify-between gap-3 border-b border-foodini-border pb-2">
                <h2 className="text-[15px] font-semibold">{label}</h2>
                <span className="text-xs text-foodini-muted">
                  {allCategoryItems.filter(item => item.isChecked).length}/{allCategoryItems.length}
                </span>
              </div>
              {visibleItems.map(item => (
                <div
                  className="flex items-center gap-2 border-b border-foodini-border/60"
                  key={item.id}
                >
                  <label className="flex min-h-[52px] flex-1 cursor-pointer select-none items-center gap-3 py-2.5 text-sm">
                    <input
                      type="checkbox"
                      className="form-checkbox"
                      checked={item.isChecked}
                      onChange={() => onToggleItem(item)}
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
                      onClick={() => onDeleteCustomItem(item.id)}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  )}
                </div>
              ))}
            </section>
          )
        })}
        {(!items.length || (hideChecked && checkedCount === items.length)) && (
          <div className="rounded-md border border-foodini-border bg-white p-9 text-center">
            <h2 className="text-base font-semibold sm:text-[17px]">
              {items.length ? 'Wszystko kupione' : 'Lista jest pusta'}
            </h2>
            <button
              className="btn-secondary mt-4"
              onClick={() => (items.length ? setHideChecked(false) : onNavigateToPlanner())}
            >
              {items.length ? 'Pokaż kupione produkty' : 'Przejdź do planera'}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
