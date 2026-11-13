import { useState } from 'react'
import { getPlatform } from '../../platform'
import { useSettings } from '../../settings'
import { registerTopBarAction } from '../topbar/registry'
import { joinSession, lastAddress, leaveSession, notify, startHosting, useLive } from '../../net/live'

function TogetherButton() {
  const [open, setOpen] = useState(false)
  const live = useLive()
  const on = open || live.role !== 'idle'
  return (
    <>
      <button type="button" className={on ? 'on' : ''} onClick={() => setOpen((value) => !value)}>
        Together
      </button>
      {open && <TogetherDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function TogetherDialog({ onClose }: { onClose: () => void }) {
  const live = useLive()
  const electron = getPlatform().isElectron
  const name = useSettings((s) => s.playerName)
  const colour = useSettings((s) => s.playerColor)
  const [address, setAddress] = useState(lastAddress)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const share = live.addresses.map((host) => `${host}:${live.port}`)

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Together" onClick={(event) => event.stopPropagation()}>
        <h2>Together</h2>
        <p className="hint">Set your name so your partner can tell your pins and cursor apart. It is saved with the other settings.</p>
        <label className="field">
          Your name
          <input
            value={name}
            maxLength={40}
            onChange={(event) => useSettings.getState().setSettings({ playerName: event.target.value })}
          />
        </label>
        <label className="field">
          Your colour
          <input
            type="color"
            aria-label="Your colour"
            value={colour || '#3FB8AF'}
            onChange={(event) => useSettings.getState().setSettings({ playerColor: event.target.value })}
          />
        </label>
        {!electron && (
          <p className="hint">
            Hosting runs inside the Nestwright app, so this browser tab cannot start a session. Ask your partner to host, then join with their address and code.
          </p>
        )}
        {live.role === 'host' && (
          <>
            <p className="coop-code" aria-label="Session code">
              {live.code}
            </p>
            <p className="hint">Read the code out. Your partner types the address and the code.</p>
            {live.addresses.length === 1 && live.addresses[0] === '127.0.0.1' && (
              <p className="hint">No other network address — your partner needs to be on this computer.</p>
            )}
            <ul className="shortcut-list">
              {share.map((item) => (
                <li key={item}>
                  <span>{item}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const clip = navigator.clipboard
                      if (!clip) {
                        notify('Select the address and copy it.')
                        return
                      }
                      void clip.writeText(item).then(() => notify('Copied')).catch(() => notify('Select the address and copy it.'))
                    }}
                  >
                    Copy
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {live.role !== 'host' && (
          <>
            <label className="field">
              Address
              <input
                value={address}
                placeholder="192.168.1.20"
                onChange={(event) => setAddress(event.target.value)}
              />
            </label>
            <label className="field">
              Code
              <input
                value={code}
                maxLength={4}
                autoCapitalize="characters"
                onChange={(event) => setCode(event.target.value.toUpperCase())}
              />
            </label>
          </>
        )}
        {live.error && live.error !== 'browser' && <p className="over">{live.error}</p>}
        <div className="together-row">
          <button
            type="button"
            disabled={!electron || busy || live.role !== 'idle'}
            onClick={() => {
              setBusy(true)
              void startHosting().finally(() => setBusy(false))
            }}
          >
            Host
          </button>
          {live.role !== 'host' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void joinSession(address, code).finally(() => setBusy(false))
              }}
            >
              Join
            </button>
          )}
          {live.role !== 'idle' && (
            <button
              type="button"
              onClick={() => {
                setBusy(true)
                void leaveSession().finally(() => setBusy(false))
              }}
            >
              Leave
            </button>
          )}
        </div>
        <h3>Here now</h3>
        {live.peers.length === 0 && <p className="hint">Nobody is connected.</p>}
        {live.peers.map((peer) => (
          <div className="peer-row" key={peer.id}>
            <span className="peer-dot" style={{ background: peer.colour }} />
            <span>
              {peer.name}
              {peer.id === live.selfId ? ' (you)' : ''}
            </span>
          </div>
        ))}
        {live.role === 'host' && live.peers.length < 2 && <p className="hint">Waiting for your partner.</p>}
        {live.role === 'idle' && <p className="hint">Joining replaces the open design with the host&apos;s.</p>}
      </div>
    </div>
  )
}

registerTopBarAction({
  id: 'together',
  label: 'Together',
  order: 50,
  Component: TogetherButton,
})
