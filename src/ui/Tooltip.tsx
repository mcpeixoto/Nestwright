import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const HOVER_MS = 400
const GAP = 8

/**
 * Hover (after a short delay) or keyboard-focus hint. Portaled so a panel
 * with overflow hidden cannot clip it, then nudged back inside the window.
 * The anchor is `display: contents`, so it does not change the rail layout.
 */
export function Tooltip({ label, children }: { label: string; children: ReactElement }) {
  const id = useId()
  const host = useRef<HTMLSpanElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  useEffect(() => {
    const button = host.current?.querySelector<HTMLElement>('button')
    if (!button) return
    let timer: number | null = null
    const clear = () => {
      if (timer === null) return
      window.clearTimeout(timer)
      timer = null
    }
    const openNow = () => {
      clear()
      const rect = button.getBoundingClientRect()
      setCoords({ top: rect.top, left: rect.right + GAP })
      setOpen(true)
    }
    const onEnter = () => {
      clear()
      timer = window.setTimeout(openNow, HOVER_MS)
    }
    const onLeave = () => {
      clear()
      setOpen(false)
    }
    const onFocus = () => {
      try {
        if (button.matches(':focus-visible')) openNow()
      } catch {
        /* :focus-visible is missing in this document */
      }
    }
    button.addEventListener('mouseenter', onEnter)
    button.addEventListener('mouseleave', onLeave)
    button.addEventListener('focus', onFocus)
    button.addEventListener('blur', onLeave)
    return () => {
      clear()
      button.removeEventListener('mouseenter', onEnter)
      button.removeEventListener('mouseleave', onLeave)
      button.removeEventListener('focus', onFocus)
      button.removeEventListener('blur', onLeave)
    }
  }, [])

  useEffect(() => {
    const button = host.current?.querySelector<HTMLElement>('button')
    if (!button) return
    if (open) button.setAttribute('aria-describedby', id)
    else button.removeAttribute('aria-describedby')
  }, [open, id])

  useLayoutEffect(() => {
    if (!open) return
    const button = host.current?.querySelector<HTMLElement>('button')
    const node = tip.current
    if (!button || !node) return
    const rect = button.getBoundingClientRect()
    const width = node.offsetWidth
    const height = node.offsetHeight
    let left = rect.right + GAP
    let top = rect.top
    if (left + width > window.innerWidth - GAP) {
      const flipped = rect.left - GAP - width
      left = flipped >= GAP ? flipped : Math.max(GAP, window.innerWidth - GAP - width)
    }
    if (top + height > window.innerHeight - GAP) top = Math.max(GAP, window.innerHeight - height - GAP)
    if (top < GAP) top = GAP
    setCoords((prev) => (prev.top === top && prev.left === left ? prev : { top, left }))
  }, [open, label])

  return (
    <span className="tip-anchor" ref={host}>
      {children}
      {open ? <TooltipLayer tip={tip} id={id} label={label} top={coords.top} left={coords.left} /> : null}
    </span>
  )
}

function TooltipLayer({
  tip,
  id,
  label,
  top,
  left,
}: {
  tip: RefObject<HTMLDivElement | null>
  id: string
  label: ReactNode
  top: number
  left: number
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div ref={tip} id={id} role="tooltip" className="nw-tooltip" style={{ top, left }}>
      {label}
    </div>,
    document.body,
  )
}
