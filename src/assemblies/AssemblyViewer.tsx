import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { AssemblyEntry, Guide, JourneyStep } from './types'
import styles from './Assembly.module.css'

type ImageState = Record<string, string>
type Props = { entry: AssemblyEntry; guide: Guide; current: JourneyStep; onShown: (key: string) => void; onImages: Dispatch<SetStateAction<ImageState>> }
export default function AssemblyViewer({ entry, guide, current, onShown, onImages }: Props) {
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
      if (event.data.type === 'guide-request') frame.current?.contentWindow?.postMessage({ channel: 'laq-assembly', command: 'load-guide', guide }, location.origin)
      if (event.data.type === 'ready') { clearTimeout(watchdog.current); setError(false); setReady(true); onImages(event.data.images) }
      if (event.data.type === 'images') onImages(images => ({ ...images, ...event.data.images }))
      if (event.data.type === 'height' && Number.isFinite(event.data.height)) setHeight(Math.max(200, Math.min(1800, event.data.height)))
      if (event.data.type === 'shown') { setShown(event.data.key); onShown(event.data.key) }
      if (event.data.type === 'error') { clearTimeout(watchdog.current); setError(true); onShown('') }
    }
    window.addEventListener('message', receive)
    watchdog.current = window.setTimeout(() => setError(true), 25000)
    return () => { window.removeEventListener('message', receive); clearTimeout(watchdog.current) }
  }, [guide, onImages, onShown, attempt])
  // Once ready, a slow-loading timeout is no longer needed.
  useEffect(() => {
    if (!ready) return
    frame.current?.contentWindow?.postMessage({ channel: 'laq-assembly', command: 'show', ...current }, location.origin)
  }, [ready, current])
  // This separate watchdog only presents errors while no rendering has succeeded.
  const failed = error
  // The model assets load once. Step changes reuse them, so keep the current
  // diagram visible instead of flashing the full loading overlay every time.
  const loading = !failed && (!ready || !shown)
  return <section className={styles.viewer} aria-label="まわせる 組み立て図" aria-busy={loading}>
    {loading && <div className={`${styles.loading} ${styles.loadingState}`} role="status" aria-live="polite">
      <span className={styles.loadingSpinner} aria-hidden="true" />
      <p><strong>3Dモデルを よみこんでいるよ</strong><small>パーツの かたちを じゅんびしているよ。もうすこし まってね。</small></p>
      <span className={styles.loadingBar} aria-hidden="true"><span /></span>
    </div>}
    {failed && <div className={styles.loading} role="alert"><p>図を ひらけなかったよ。</p><button className={styles.secondary} onClick={() => { setReady(false); setError(false); setShown(''); onShown(''); setAttempt(n => n + 1) }}>もういちど ひらく</button><p>元の つくりかたも、ページの 下から 見られるよ。</p></div>}
    <iframe ref={frame} key={attempt} title={`${entry.title}の まわせる組み立て図`}
      src={`${import.meta.env.BASE_URL}assemblies/viewer/index.html?id=${encodeURIComponent(entry.id)}&v=${entry.revision}&embedded=1`}
      style={{ height, display: failed ? 'none' : 'block', visibility: ready ? 'visible' : 'hidden' }} data-shown={shown}
      allow="" />
  </section>
}
