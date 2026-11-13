/** Currency with grouping separators for the active locale. */
export function formatMoney(amount: number, currency: string, locale: string): string {
  const value = Number.isFinite(amount) ? amount : 0
  const code = /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : 'EUR'
  const tag = locale === 'pt-PT' || locale === 'pt' ? 'pt-PT' : 'en'
  try {
    return new Intl.NumberFormat(tag, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${code} ${Math.round(value)}`
  }
}
