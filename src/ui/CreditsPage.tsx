import { useEffect, useState } from 'react'
import { loadContentCredits } from '../catalog/models'
import { useTranslate } from '../i18n'
import type { ContentCredit } from '../materials/pbrTextures'

/** Help → Credits: every third-party asset in the installed content pack, CC0 ones too. */
export function CreditsPage() {
  const tr = useTranslate()
  const [credits, setCredits] = useState<readonly ContentCredit[] | null>(null)
  useEffect(() => {
    let live = true
    void loadContentCredits().then((list) => {
      if (live) setCredits(list)
    })
    return () => {
      live = false
    }
  }, [])
  if (credits === null) return null
  if (credits.length === 0) return <p className="readout">{tr('No content pack installed: everything you see is built in code.')}</p>
  const groups: { title: string; list: ContentCredit[] }[] = [
    { title: tr('Models'), list: credits.filter((c) => c.kind === 'model') },
    { title: tr('Textures'), list: credits.filter((c) => c.kind === 'texture') },
  ]
  return (
    <div className="credits">
      <p className="readout">{tr('Third-party textures and models in the content pack. Thank you to their authors.')}</p>
      {groups
        .filter((group) => group.list.length > 0)
        .map((group) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            <ul className="credit-list">
              {group.list.map((credit) => (
                <li key={credit.key}>
                  <span className="credit-name">{credit.name}</span>
                  {credit.author && <span className="credit-author"> {tr('by {author}', { author: credit.author })}</span>}
                  <span className="credit-meta">
                    {' · '}
                    {credit.licence}
                    {credit.sourceUrl && (
                      <>
                        {' · '}
                        {/* Plain text: the packaged app has no external-link handler. */}
                        <span className="credit-url">{credit.sourceUrl.replace(/^https?:\/\//, '')}</span>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  )
}
