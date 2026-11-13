import { diffVariants, summariseDiff, variantFrom } from '../../model/variants'
import { useStore } from '../../store'
import { T } from '../../i18n/T'
import { useTranslate } from '../../i18n'
import { setCompareVariant, useCompareVariant } from './compare'

export function CompareBanner() {
  const tr = useTranslate()
  const variantId = useCompareVariant()
  const project = useStore((s) => s.project)
  const variant = project.variants?.find((item) => item.id === variantId) ?? null
  if (!variantId || !variant) return null
  let summary: string
  try {
    summary = summariseDiff(diffVariants(variantFrom(project, 'Current', 'current', 0), variant, project.budget))
  } catch {
    summary = ''
  }
  return (
    <div className="compare-banner">
      <span>
        <T k="Current" />
      </span>
      <span>{tr(variant.name)}</span>
      <button type="button" onClick={() => setCompareVariant(null)}>
        <T k="Close" />
      </button>
      <p>{summary || tr('Nothing to compare yet.')}</p>
    </div>
  )
}
