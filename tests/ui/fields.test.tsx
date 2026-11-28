/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
import { useStore } from '../../src/store'
import { AngleField, LengthField, PercentField } from '../../src/ui/inspector/fields'
import { InspectorCard } from '../../src/ui/inspector/InspectorCard'
import { resetCollapsedCache } from '../../src/ui/inspector/collapsed'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = (node: ReactNode) => act(() => root.render(node))
const input = () => host.querySelector('input')!

function type(text: string) {
  const el = input()
  act(() => el.focus())
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}

describe('AngleField', () => {
  it('shows degrees, commits a number, rejects a negative', () => {
    const onCommit = vi.fn()
    render(<AngleField label="Rotation" value={45} onCommit={onCommit} />)
    expect(input().value).toBe('45°')
    type('90')
    expect(onCommit).toHaveBeenLastCalledWith(90)
    onCommit.mockClear()
    type('-10')
    expect(onCommit).not.toHaveBeenCalled()
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Not a valid angle')
  })
})

describe('PercentField', () => {
  it('shows a percentage and commits a fraction', () => {
    const onCommit = vi.fn()
    render(<PercentField label="Ivy" value={0.35} onCommit={onCommit} />)
    expect(input().value).toBe('35 %')
    type('50')
    expect(onCommit).toHaveBeenLastCalledWith(0.5)
    onCommit.mockClear()
    type('120')
    expect(onCommit).not.toHaveBeenCalled()
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Not a valid percentage')
  })
})

describe('LengthField', () => {
  it('shows feet and inches in an imperial project', () => {
    const project = useStore.getState().project
    useStore.setState({ project: { ...project, units: 'imperial' } })
    render(<LengthField label="Width" value={1} onCommit={() => {}} />)
    expect(input().value).toBe(`3' 3 3/8"`)
    useStore.setState({ project })
  })
})

describe('InspectorCard', () => {
  it('collapses and remembers it across a re-render', () => {
    localStorage.clear()
    resetCollapsedCache()
    render(<InspectorCard id="t" heading="Test"><p className="body">Body</p></InspectorCard>)
    const button = () => host.querySelector('h2 button')!
    act(() => (button() as HTMLButtonElement).click())
    expect(button().getAttribute('aria-expanded')).toBe('false')
    expect(host.querySelector('.body')).toBeNull()
    expect(localStorage.getItem('nestwright:inspector-collapsed')).toBe('["t"]')
    act(() => root.unmount())
    resetCollapsedCache()
    root = createRoot(host)
    render(<InspectorCard id="t" heading="Test"><p className="body">Body</p></InspectorCard>)
    expect(button().getAttribute('aria-expanded')).toBe('false')
  })
})
