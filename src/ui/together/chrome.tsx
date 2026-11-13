import { useState } from 'react'
import { sendChat, useLive, useToasts } from '../../net/live'

export function TogetherChrome() {
  const live = useLive()
  const toasts = useToasts()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
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
        <aside className="chat-dock" aria-label="Chat">
          <button type="button" onClick={() => setOpen((value) => !value)}>
            {open ? 'Hide chat' : 'Chat'}
          </button>
          {open && (
            <>
              <ul>
                {live.chat.length === 0 && <li className="hint">Say something to your partner.</li>}
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
                <input aria-label="Message" value={text} maxLength={500} onChange={(event) => setText(event.target.value)} />
                <button type="submit">Send</button>
              </form>
            </>
          )}
        </aside>
      )}
    </>
  )
}
