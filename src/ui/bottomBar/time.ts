/** `HH:MM` for an hour of day (0..24); minutes round and carry, 24 wraps to `00:00`. */
export function formatHour(hours: number): string {
  let hour = Math.floor(hours)
  let minutes = Math.round((hours % 1) * 60)
  if (minutes >= 60) {
    minutes -= 60
    hour += 1
  }
  hour = ((hour % 24) + 24) % 24
  return `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
