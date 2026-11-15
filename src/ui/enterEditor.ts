/** Lets project actions open the editor without importing the session module (that boots a preview). */
let enter: () => void = () => {}

export function registerEnterEditor(fn: () => void): void {
  enter = fn
}

export function requestEnterEditor(): void {
  enter()
}
