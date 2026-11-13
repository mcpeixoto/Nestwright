import { useState } from 'react'
import { sendChat, useLive, useToasts } from '../../net/live'
import { T } from '../../i18n/T'
import { useTranslate } from '../../i18n'

export function TogetherChrome() {
  const live = useLive()
  const toasts = useToasts()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const tr = useTranslate()
  return (
    <>
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast" role="status">
            {toast.text}
          </div>
        ))}
      </div>
      {live.role !== 'idle' && (
        <aside className="chat-dock" aria-label={tr('Chat')}>
          <button type="button" onClick={() => setOpen((value) => !value)}>
            {open ? tr('Hide chat') : tr('Chat')}
          </button>
          {open && (
            <>
              <ul>
                {live.chat.length === 0 && (
                  <li className="hint">
                    <T k="Say something to your partner." />
                  </li>
                )}
                {live.chat.map((line) => (
                  <li key={line.id}>
                    <b style={{ color: line.colour }}>{line.name}</b> {line.text}
                  </li>
                ))}
              </ul>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  sendChat(text)
                  setText('')
                }}
              >
                <input aria-label={tr('Message')} value={text} maxLength={500} onChange={(event) => setText(event.target.value)} />
                <button type="submit">
                  <T k="Send" />
                </button>
              </form>
            </>
          )}
        </aside>
      )}
    </>
  )
}
