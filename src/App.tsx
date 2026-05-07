import { useState, useEffect, useRef, useMemo } from 'react'
import './App.css'

interface Entry {
  id: number
  name: string
  marchSeconds: number
  offset: number
}

interface Snapshot {
  id: number
  name: string
  total: number
  sendAt: number
}

type Phase = 'idle' | 'countdown' | 'active' | 'done'

const COUNTDOWN_SECONDS = 3
const STORAGE_KEY = 'rallytimer-entries'

function loadEntries(): Entry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return [{ id: 1, name: '', marchSeconds: 0, offset: 0 }]
}

function App() {
  const [entries, setEntries] = useState<Entry[]>(loadEntries)
  const [phase, setPhase] = useState<Phase>('idle')
  const [countdownValue, setCountdownValue] = useState(COUNTDOWN_SECONDS)
  const [elapsed, setElapsed] = useState(0)
  const nextId = useRef(Math.max(...entries.map(e => e.id), 0) + 1)
  const startTimeRef = useRef<number>(0)
  const snapshotRef = useRef<Snapshot[]>([])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  }, [entries])

  const exportCsv = () => {
    const header = 'Name,March (s),Offset (s),Total (s)'
    const rows = entries.map(e =>
      `"${e.name.replace(/"/g, '""')}",${e.marchSeconds},${e.offset},${e.marchSeconds + e.offset}`
    )
    const csv = [header, ...rows].join('\n')
    navigator.clipboard.writeText(csv)
  }

  const addEntry = () => {
    setEntries(prev => [
      ...prev,
      { id: nextId.current++, name: '', marchSeconds: 0, offset: 0 },
    ])
  }

  const removeEntry = (id: number) => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const updateEntry = (id: number, field: keyof Entry, value: string | number) => {
    setEntries(prev =>
      prev.map(e => (e.id === id ? { ...e, [field]: value } : e))
    )
  }

  const handleStart = () => {
    const maxTotal = Math.max(...entries.map(e => e.marchSeconds + e.offset), 0)
    const snaps: Snapshot[] = entries.map(e => {
      const total = e.marchSeconds + e.offset
      return {
        id: e.id,
        name: e.name || `Rally ${e.id}`,
        total,
        sendAt: maxTotal - total,
      }
    })
    snaps.sort((a, b) => a.sendAt - b.sendAt)
    snapshotRef.current = snaps

    setCountdownValue(COUNTDOWN_SECONDS)
    setPhase('countdown')
    startTimeRef.current = Date.now()
  }

  const handleStop = () => {
    setPhase('idle')
    setElapsed(0)
    setCountdownValue(COUNTDOWN_SECONDS)
    snapshotRef.current = []
  }

  useEffect(() => {
    if (phase === 'countdown') {
      const tick = () => {
        const ms = Date.now() - startTimeRef.current
        const remaining = COUNTDOWN_SECONDS - Math.floor(ms / 1000)
        if (remaining <= 0) {
          startTimeRef.current = Date.now()
          setElapsed(0)
          setPhase('active')
        } else {
          setCountdownValue(remaining)
        }
      }
      tick()
      const id = setInterval(tick, 100)
      return () => clearInterval(id)
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'active') return

    const tick = () => {
      const sec = Math.floor((Date.now() - startTimeRef.current) / 1000)
      setElapsed(sec)

      const maxTotal = Math.max(...snapshotRef.current.map(s => s.total), 0)
      if (sec >= maxTotal) {
        setPhase('done')
      }
    }
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [phase])

  const sendOrder = useMemo(() => snapshotRef.current, [phase, elapsed])

  const sent = sendOrder.filter(s => elapsed >= s.sendAt)
  const upcoming = sendOrder.filter(s => elapsed < s.sendAt)
  const currentSend = sendOrder.find(s => elapsed === s.sendAt && elapsed >= 0)
  const nextUp = upcoming[0] ?? null
  const timeToNext = nextUp ? nextUp.sendAt - elapsed : null

  const maxTotal = sendOrder.length > 0 ? Math.max(...sendOrder.map(s => s.total)) : 0
  const landingIn = phase === 'active' ? maxTotal - elapsed : null

  const running = phase !== 'idle'

  return (
    <div className="app">
      <h1>RallyTimer</h1>

      {phase === 'countdown' && (
        <div className="banner countdown-banner">
          <div className="banner-big">{countdownValue}</div>
          <div className="banner-label">Get ready...</div>
        </div>
      )}

      {phase === 'active' && currentSend && (
        <div className="banner send-banner">
          <div className="banner-label">SEND NOW</div>
          <div className="banner-big">{currentSend.name}</div>
        </div>
      )}

      {phase === 'active' && !currentSend && nextUp && (
        <div className="banner next-banner">
          <div className="banner-label">Next: {nextUp.name}</div>
          <div className="banner-big">{timeToNext}s</div>
        </div>
      )}

      {phase === 'active' && !currentSend && !nextUp && (
        <div className="banner waiting-banner">
          <div className="banner-label">All sent — landing in</div>
          <div className="banner-big">{landingIn}s</div>
        </div>
      )}

      {phase === 'done' && (
        <div className="banner done-banner">
          <div className="banner-big">All rallies landed</div>
        </div>
      )}

      {phase === 'active' && landingIn !== null && (nextUp || currentSend) && (
        <div className="landing-timer">All land in {landingIn}s</div>
      )}

      <div className="top-controls">
        {!running ? (
          <button className="btn start" onClick={handleStart} disabled={entries.length === 0}>
            Start
          </button>
        ) : (
          <>
            <button className="btn restart" onClick={handleStart}>
              Restart
            </button>
            <button className="btn stop" onClick={handleStop}>
              Stop
            </button>
          </>
        )}
      </div>

      {!running && (
        <>
          <div className="entries-header">
            <span className="col-name">Name</span>
            <span className="col-march">March (s)</span>
            <span className="col-offset">Offset (s)</span>
            <span className="col-total">Total</span>
            <span className="col-actions"></span>
          </div>

          <div className="entries">
            {entries.map(entry => {
              const total = entry.marchSeconds + entry.offset
              return (
                <div className="entry-row" key={entry.id}>
                  <input
                    className="col-name"
                    type="text"
                    placeholder="Name"
                    value={entry.name}
                    onChange={e => updateEntry(entry.id, 'name', e.target.value)}
                  />
                  <input
                    className="col-march num-input"
                    type="number"
                    min={0}
                    value={entry.marchSeconds}
                    onChange={e => updateEntry(entry.id, 'marchSeconds', Math.max(0, parseInt(e.target.value) || 0))}
                  />
                  <input
                    className="col-offset num-input"
                    type="number"
                    value={entry.offset}
                    onChange={e => updateEntry(entry.id, 'offset', parseInt(e.target.value) || 0)}
                  />
                  <span className="col-total total-display">{total}s</span>
                  <button
                    className="col-actions btn-remove"
                    onClick={() => removeEntry(entry.id)}
                    title="Remove"
                  >
                    x
                  </button>
                </div>
              )
            })}
          </div>

          <div className="bottom-controls">
            <button className="btn add" onClick={addEntry}>
              + Add Entry
            </button>
            <button className="btn export" onClick={exportCsv}>
              Export CSV
            </button>
          </div>
        </>
      )}

      {running && (
        <div className="send-list">
          <div className="send-list-header">Send Order</div>
          {sendOrder.map(s => {
            const isCountdown = phase === 'countdown'
            const isSent = !isCountdown && elapsed >= s.sendAt
            const isSending = !isCountdown && elapsed === s.sendAt
            const secsUntil = isCountdown ? s.sendAt + countdownValue : s.sendAt - elapsed
            return (
              <div
                key={s.id}
                className={`send-row ${isSending ? 'sending' : ''} ${isSent && !isSending ? 'sent' : ''}`}
              >
                <span className="send-name">{s.name}</span>
                <span className="send-status">
                  {isSending
                    ? 'SEND!'
                    : isSent
                      ? 'Sent'
                      : `in ${secsUntil}s`}
                </span>
                <span className="send-march">{s.total}s march</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default App
