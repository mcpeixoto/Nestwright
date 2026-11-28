import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslate } from '../../i18n'
import { Tooltip } from '../Tooltip'

export interface DropMenuItem {
  id: string
  label: string
  run: () => void
  checked?: boolean
  disabled?: boolean
}

/**
 * A top-bar menu (`☰` glyph for `icon="menu"`, `+` for `icon="plus"`): a `tb-btn` trigger and a popover of menu items. Closes on an
 * outside pointerdown, Escape, and after any item runs. Arrow keys move focus.
 */
export function DropMenu({
  label,
  text,
  icon,
  items,
  align = 'right',
}: {
  label: string
  /** Visible trigger text when it differs from the accessible label. */
  text?: string
  icon?: 'menu' | 'plus'
  items: DropMenuItem[]
  align?: 'left' | 'right'
}) {
  const tr = useTranslate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const name = tr(label)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    pop.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const buttons = [...(pop.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])]
    if (buttons.length === 0) return
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    const next = at < 0 ? 0 : (at + step + buttons.length) % buttons.length
    buttons[next]?.focus()
  }

  const glyph = icon === 'menu' && label === 'Menu'
  return (
    <div className="menu" ref={ref}>
      <Tooltip label={name}>
        <button
          ref={trigger}
          type="button"
          className={open ? 'tb-btn on' : 'tb-btn'}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={name}
          onClick={() => setOpen((value) => !value)}
        >
          {glyph ? (
            '☰'
          ) : icon === 'plus' ? (
            '+'
          ) : (
            <>
              {text ? tr(text) : name}
              <span className="caret">▾</span>
            </>
          )}
        </button>
      </Tooltip>
      {open && (
        <div ref={pop} className={align === 'left' ? 'menu-pop left' : 'menu-pop'} role="menu" aria-label={name} onKeyDown={onMenuKey}>
          {items.map((item) => (
            <button
              type="button"
              key={item.id}
              role="menuitem"
              className={item.checked ? 'on' : ''}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.run()
              }}
            >
              {tr(item.label)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
