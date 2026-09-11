import { useEffect, useRef, useState } from 'react'
import type { AssemblyEntry, JourneyStep } from './types'
import styles from './Assembly.module.css'

type Props = { entry: AssemblyEntry; current: JourneyStep; onShown: (key: string) => void; onImages: (images: Record<string, string>) => void }
export default function AssemblyViewer({ entry, current, onShown, onImages }: Props) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)
  const [height, setHeight] = useState(450)
  const [attempt, setAttempt] = useState(0)
  const [shown, setShown] = useState('')
  const watchdog = useRef<number | undefined>(undefined)
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow || event.data?.channel !== 'laq-assembly') return
      if (event.data.type === 'ready') { clearTimeout(watchdog.current); setError(false); setReady(true); onImages(event.data.images) }
      if (event.data.type === 'height' && Number.isFinite(event.data.height)) setHeight(Math.max(200, Math.min(1800, event.data.height)))
      if (event.data.type === 'shown') { setShown(event.data.key); onShown(event.data.key) }
      if (event.data.type === 'error') { clearTimeout(watchdog.current); setError(true); onShown('') }
    }
    window.addEventListener('message', receive)
    watchdog.current = window.setTimeout(() => setError(true), 25000)
    return () => { window.removeEventListener('message', receive); clearTimeout(watchdog.current) }
  }, [onImages, onShown, attempt])
  // Once ready, a slow-loading timeout is no longer needed.
  useEffect(() => {
    if (!ready) return
    frame.current?.contentWindow?.postMessage({ channel: 'laq-assembly', command: 'show', ...current }, location.origin)
  }, [ready, current])
  // This separate watchdog only presents errors while no rendering has succeeded.
  const failed = error
  return <section className={styles.viewer} aria-label="まわせる 組み立て図">
    {!ready && !failed && <p className={styles.loading} role="status">図を よみこんでいるよ…</p>}
    {failed && <div className={styles.loading} role="alert"><p>図を ひらけなかったよ。</p><button className={styles.secondary} onClick={() => { setReady(false); setError(false); setShown(''); onShown(''); setAttempt(n => n + 1) }}>もういちど ひらく</button><p>元の つくりかたも、ページの 下から 見られるよ。</p></div>}
    <iframe ref={frame} key={attempt} title={`${entry.title}の まわせる組み立て図`}
      src={`${import.meta.env.BASE_URL}assemblies/viewer/index.html?id=${encodeURIComponent(entry.id)}&v=${entry.revision}`}
      style={{ height, display: failed ? 'none' : 'block' }} data-shown={shown}
      allow="" />
  </section>
}
