import { Icon } from './Icon.tsx'

interface ToastProps {
  toast: { message: string; id: number } | null
  onClose: () => void
}

export function Toast({ toast, onClose }: ToastProps) {
  if (!toast) return null

  return (
    <div
      className="fixed bottom-5 left-1/2 z-50 w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className="flex items-center gap-2 rounded-md bg-brand-dark py-2 pl-4 pr-2 text-sm leading-normal text-white shadow-lg"
        key={toast.id}
      >
        <span>{toast.message}</span>
        <button
          className="btn-icon text-white hover:bg-white/10"
          aria-label="Zamknij powiadomienie"
          onClick={onClose}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  )
}
