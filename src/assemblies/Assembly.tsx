import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { listReturnTo } from '../lib/returnTo'
import { assemblyById } from './catalog'
import { colorWords, groupLabel, inventory, journey, routeIndex } from './journey'
import { loadProgress, saveProgress, type Progress } from './progress'
import type { AssemblyEntry, Guide } from './types'
import AssemblyViewer from './AssemblyViewer'
import { useApp } from '../store/useApp'
import styles from './Assembly.module.css'

export default function Assembly() {
  const { assemblyId = '' } = useParams()
  const entry = assemblyById(assemblyId)
  return entry ? <LoadAssembly key={entry.id} entry={entry} /> : <div className={styles.page}><h1>つくりかたが みつからないよ</h1><Link to="/">ずかんに もどる</Link></div>
}
function LoadAssembly({ entry }: { entry: AssemblyEntry }) {
  const returnTo = listReturnTo(useLocation().state)
  const [guide, setGuide] = useState<Guide | null>(null), [error, setError] = useState(false), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${import.meta.env.BASE_URL}${entry.guidePath}`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('missing guide'); return response.json() })
      .then((data: Guide) => { if (!data.variants?.[data.defaultVariant]?.units?.length) throw new Error('invalid guide'); setGuide(data) })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [entry, attempt])
  if (guide) return <Journey entry={entry} guide={guide} />
  return <div className={styles.page}><Link to={`/model/${encodeURIComponent(entry.modelId)}`} state={{ returnTo }}>← さくひんに もどる</Link><h1>{entry.title}</h1><p role={error ? 'alert' : 'status'}>{error ? 'つくりかたを よみこめなかったよ。' : 'つくりかたを よみこんでいるよ…'}</p>{error && <button className={styles.primary} onClick={() => { setError(false); setAttempt(n => n + 1) }}>もういちど ひらく</button>}</div>
}
function Journey({ entry, guide }: { entry: AssemblyEntry; guide: Guide }) {
  const steps = useMemo(() => journey(guide), [guide]), variant = guide.variants[guide.defaultVariant]
  const returnTo = listReturnTo(useLocation().state)
  const [params, setParams] = useSearchParams()
  const at = routeIndex(params, guide, steps), current = steps[at]
  const [progress, setProgress] = useState<Progress>(() => loadProgress(entry, steps.map(s => s.key)))
  const [saveFailed, setSaveFailed] = useState(false), [images, setImages] = useState<Record<string, string>>({})
  const [renderedKey, setRenderedKey] = useState(''), [returnStack, setReturnStack] = useState<number[]>([])
  const [mapOpen, setMapOpen] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const { state, actions } = useApp()
  const label = (id: string) => groupLabel(guide, id)
  const unitName = (id: string) => guide.reading?.unitNames?.[id] ?? variant.units.find(u => u.id === id)?.label ?? 'ここまでの からだ'
  const counts = useMemo(() => inventory(variant.model.pieces), [variant])
  const checked = new Set(progress.checked)
  const totalTasks = steps.filter(s => s.phase === 'unit' || s.phase === 'assembly').length
  const doneTasks = steps.filter(s => (s.phase === 'unit' || s.phase === 'assembly') && checked.has(s.key)).length
  const stageUnits = current.phase === 'unit' ? variant.units.find(u => u.id === current.unit) : null
  const stageInventory = current.phase === 'unit' ? inventory(variant.model.pieces.filter(p => current.source?.visiblePieces.includes(p.id))) : null
  useEffect(() => {
    if (at === 0) return
    const next = { ...loadProgress(entry, steps.map(s => s.key)), at }
    // URL back/forward navigation also updates the resume point.
    // oxlint-disable-next-line react/set-state-in-effect
    setProgress(next)
    setSaveFailed(!saveProgress(entry, next, steps.map(s => s.key)))
  }, [at, entry, steps])
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo(0, 0) }, [at])
  function persist(next: Progress) { setProgress(next); setSaveFailed(!saveProgress(entry, next, steps.map(s => s.key))) }
  function go(index: number, complete = false) {
    const next = Math.max(0, Math.min(steps.length - 1, index))
    persist({ at: next === 0 ? progress.at : next, checked: complete ? [...new Set([...progress.checked, current.key])] : progress.checked })
    setMapOpen(false);setParams({ step: steps[next].key }, { state: { returnTo } })
  }
  function reference(id: string) {
    const target = steps.findIndex(s => s.unit === id || s.source?.result === id)
    if (target >= 0) { setReturnStack(stack => [...stack, at]);go(target) }
  }
  const tasks = steps.filter(s => s.source)
  const taskIndex = tasks.findIndex(s => s.key === current.key)
  const flowText = taskIndex >= 0 ? `てじゅん ${taskIndex + 1} / ${totalTasks}`
    : current.phase === 'done' ? 'さいごの かたちを たしかめよう' : `パーツ ${entry.pieceCount}こで つくるよ`
  return <div className={styles.page}>
    <header className={styles.header}><Link to={`/model/${encodeURIComponent(entry.modelId)}`} state={{ returnTo }} className={styles.back}>← さくひん</Link><span>{entry.title} / 3Dでつくる</span><button className={styles.mapButton} aria-expanded={mapOpen} onClick={() => setMapOpen(!mapOpen)}>ぜんたいの ながれ</button></header>
    <nav className={styles.quickNav} aria-label="図を えらぶ"><button onClick={() => go(0)}>かんせいの図</button></nav>
    <div className={styles.progressLine}><progress max={totalTasks} value={doneTasks} aria-label="できた 手順" /><span>{doneTasks} / {totalTasks} できた</span></div>
    {saveFailed && <p role="alert" className={styles.note}>つづきを ほぞんできなかったよ。このページを とじると きえることがあるよ。</p>}
    {mapOpen && <section className={styles.map} aria-label="ぜんたいの ながれ">
      <h2>この じゅんばんで つくるよ</h2><p>つくる図も、つなぐ図も、この じゅんばんで 見てね。</p>
      <ol className={styles.instructionMap}>{tasks.map((item, i) => {
        const id = item.unit ?? item.source?.result ?? ''
        return <li key={item.key}><button onClick={() => go(steps.indexOf(item))} aria-current={item.key === current.key ? 'step' : undefined} aria-label={`てじゅん ${i + 1} ${item.title}`}>
          <b className={styles.taskNumber}>{i + 1}</b>{images[id] && <img src={images[id]} alt="" />}
          <span><strong>{item.title}</strong><small>{item.source?.inputs ? `${item.source.inputs.map(label).join(' ＋ ')} → ${label(id)}` : label(id)}</small></span><em>{checked.has(item.key) ? '✓' : ''}</em>
        </button></li>
      })}</ol>
      <button className={styles.secondary} onClick={() => setMapOpen(false)}>いまの てじゅんに もどる</button>
    </section>}
    <div className={styles.heading}><p className={styles.eyebrow}>{flowText}</p><h1 ref={heading} tabIndex={-1}>{current.unit && <span className={styles.badge}>{label(current.unit)}</span>}{current.title}</h1><p>{current.description}</p>
      {stageUnits && stageUnits.steps.length > 1 && <p className={styles.small}>この まとまりは {stageUnits.steps.length} まいの 図で つくるよ。いまは {current.step + 1} まいめ。</p>}
    </div>
    {returnStack.length > 0 && <button className={styles.returnButton} onClick={() => { const target = returnStack[returnStack.length - 1];setReturnStack(stack => stack.slice(0, -1));go(target) }}>← さっきの てじゅんに もどる</button>}
    {current.phase === 'welcome' && <div className={styles.welcomeFlow}><span>パーツ <b>{entry.pieceCount}こ</b></span><span>てじゅん <b>{totalTasks}</b></span></div>}
    {current.phase === 'assembly' && <div className={styles.formula} aria-label="つかう まとまり">{current.source?.inputs?.map((id, i) => <div className={styles.formulaItem} key={id}>{i > 0 && <span className={styles.operator}>＋</span>}<button onClick={() => reference(id)}>{images[id] && <img src={images[id]} alt="" />}<b>{label(id)}</b><small>{unitName(id)}</small></button></div>)}<span className={styles.operator}>→</span><strong>{label(current.source?.result ?? '')}</strong></div>}
    <AssemblyViewer entry={entry} current={current} onImages={setImages} onShown={setRenderedKey} />
    {current.phase === 'welcome' && <section className={styles.partsReference} aria-label="つかう パーツの めやす">
      <h2>つかう パーツの めやす</h2><p>ぜんぶで {entry.pieceCount}こ。つくりながら、ひつような パーツを えらんでね。</p>
      <ul className={styles.parts}>{counts.map(p => <li key={`${p.partNo}:${p.color}`} aria-label={`No.${p.partNo} ${colorWords[p.color] ?? p.color} ${p.count}こ`}>
        {images[`part:${p.partNo}:${p.color}`] && <img src={images[`part:${p.partNo}:${p.color}`]} alt="" />}<b>No.{p.partNo}</b><span>{colorWords[p.color] ?? p.color}</span><strong>{p.count}こ</strong>
      </li>)}</ul>
    </section>}
    {stageInventory && <details className={styles.stageParts}><summary>この図の パーツを見る（{current.source?.visiblePieces.length}こ）</summary><ul>{stageInventory.map(p => <li key={`${p.partNo}:${p.color}`}>No.{p.partNo} / {colorWords[p.color] ?? p.color} <b>{p.count}こ</b></li>)}</ul></details>}

    {current.phase === 'done' && <section className={styles.finish}><h2>つくれたら、きろくしよう！</h2><p>{doneTasks < totalTasks ? 'まだ「できた」を おしていない 手順が あるよ。つくりおわったら きろくしてね。' : 'さいごまで よく がんばったね。'}</p><button className={styles.primary} disabled={Boolean(state.made[entry.modelId])} onClick={() => { if (!state.made[entry.modelId]) actions.toggleMade(entry.modelId) }}>{state.made[entry.modelId] ? '✓ つくった！ きろくずみ' : '★ つくった！を きろく'}</button><Link to={`/model/${encodeURIComponent(entry.modelId)}`} state={{ returnTo }}>さくひんの ページへ</Link></section>}
    <footer className={styles.source}><a href={guide.article} target="_blank" rel="noreferrer">ぷりまつラボの 元のつくりかた ↗</a><p role="note" aria-label="この図について">写真から作った おためしの3D組み立て図です。実物での差し込み・組みやすさは確認中です。うまく はまらないときは、むりに おさず おとなと 見てね。</p></footer>
    <nav className={styles.bottom} aria-label="てじゅんを すすめる">
      {at > 0 && <button className={styles.secondary} onClick={() => go(at - 1)}>← もどる</button>}
      {current.phase === 'welcome' && progress.at > 0 && <button className={styles.secondary} onClick={() => go(progress.at)}>つづきから</button>}
      {current.phase !== 'done' && <button className={styles.primary} disabled={renderedKey !== current.key} onClick={() => go(at + 1, true)}>{current.phase === 'welcome' ? 'つくりはじめる →' : at === steps.length - 2 ? 'できた！ かんせいへ →' : 'できた！ つぎへ →'}</button>}
      {current.phase === 'done' && <button className={styles.secondary} onClick={() => setMapOpen(true)}>ぜんたいを ふりかえる</button>}
    </nav>
  </div>
}
