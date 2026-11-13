import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Dialogs must portal to `document.body`. A `backdrop-filter` on an ancestor
 * (the top bar) becomes the containing block for `position: fixed`, which
 * pushes a centred modal off the top of the window.
 */
export function Modal({
  label,
  onClose,
  className,
  children,
}: {
  label: string
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (typeof document === 'undefined') return null
  const host = document.body
  if (!host) return null

  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div
        className={className ? `modal ${className}` : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    host,
  )
}
