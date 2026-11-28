import { useState, useSyncExternalStore } from 'react'
import { getPlatform } from '../../platform'
import { useSettings } from '../../settings'
import { T } from '../../i18n/T'
import { useTranslate } from '../../i18n'
import { Modal } from '../Modal'
import { registerTopBarAction } from '../topbar/registry'
import { joinSession, lastAddress, leaveSession, notify, startHosting, useLive } from '../../net/live'

let togetherOpen = false
const togetherListeners = new Set<() => void>()

function setTogetherOpen(next: boolean): void {
  if (togetherOpen === next) return
  togetherOpen = next
  for (const listener of togetherListeners) listener()
}

function subscribeTogether(listener: () => void): () => void {
  togetherListeners.add(listener)
  return () => togetherListeners.delete(listener)
}

/** Opens the Together dialog; the top bar's Share menu calls this. */
export function openTogether(): void {
  setTogetherOpen(true)
}

function TogetherHost() {
  const open = useSyncExternalStore(subscribeTogether, () => togetherOpen, () => false)
  return open ? <TogetherDialog onClose={() => setTogetherOpen(false)} /> : null
}

function TogetherDialog({ onClose }: { onClose: () => void }) {
  const live = useLive()
  const electron = getPlatform().isElectron
  const name = useSettings((s) => s.playerName)
  const colour = useSettings((s) => s.playerColor)
  const tr = useTranslate()
  const [address, setAddress] = useState(lastAddress)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const share = live.addresses.map((host) => `${host}:${live.port}`)

  return (
    <Modal label={tr('Play together')} onClose={onClose}>
        <h2>
          <T k="Play together" />
        </h2>
        <p className="hint">
          <T k="Set your name so your partner can tell your pins and cursor apart. It is saved with the other settings." />
        </p>
        <label className="field">
          <T k="Your name" />
          <input
            value={name}
            maxLength={40}
            onChange={(event) => useSettings.getState().setSettings({ playerName: event.target.value })}
          />
        </label>
        <label className="field">
          <T k="Your colour" />
          <input
            type="color"
            aria-label={tr('Your colour')}
            value={colour || '#3FB8AF'}
            onChange={(event) => useSettings.getState().setSettings({ playerColor: event.target.value })}
          />
        </label>
        {!electron && (
          <p className="hint">
            <T k="Hosting runs inside the Nestwright app, so this browser tab cannot start a session. Ask your partner to host, then join with their address and code." />
          </p>
        )}
        {live.role === 'host' && (
          <>
            <p className="coop-code" aria-label={tr('Session code')}>
              {live.code}
            </p>
            <p className="hint">
              <T k="Read the code out. Your partner types the address and the code." />
            </p>
            {live.addresses.length === 1 && live.addresses[0] === '127.0.0.1' && (
              <p className="hint">
                <T k="No other network address — your partner needs to be on this computer." />
              </p>
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
                        notify(tr('Select the address and copy it.'))
                        return
                      }
                      void clip.writeText(item).then(() => notify(tr('Copied'))).catch(() => notify(tr('Select the address and copy it.')))
                    }}
                  >
                    <T k="Copy" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {live.role !== 'host' && (
          <>
            <label className="field">
              <T k="Address" />
              <input
                value={address}
                placeholder="192.168.1.20"
                onChange={(event) => setAddress(event.target.value)}
              />
            </label>
            <label className="field">
              <T k="Code" />
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
            <T k="Host" />
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
              <T k="Join" />
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
              <T k="Leave" />
            </button>
          )}
        </div>
        <h3>
          <T k="Here now" />
        </h3>
        {live.peers.length === 0 && (
          <p className="hint">
            <T k="Nobody is connected." />
          </p>
        )}
        {live.peers.map((peer) => (
          <div className="peer-row" key={peer.id}>
            <span className="peer-dot" style={{ background: peer.colour }} />
            <span>
              {peer.name}
              {peer.id === live.selfId ? ` (${tr('you')})` : ''}
            </span>
          </div>
        ))}
        {live.role === 'host' && live.peers.length < 2 && (
          <p className="hint">
            <T k="Waiting for your partner." />
          </p>
        )}
        {live.role === 'idle' && (
          <p className="hint">
            <T k="Joining replaces the open design with the host's." />
          </p>
        )}
    </Modal>
  )
}

registerTopBarAction({
  id: 'together',
  label: 'Play together',
  order: 50,
  run: openTogether,
  Component: TogetherHost,
})
