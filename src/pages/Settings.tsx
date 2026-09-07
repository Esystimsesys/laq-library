import { useRef, useState } from 'react'
import { Link } from 'react-router'
import type { UserState } from '../store/types'
import { models, sources } from '../data'
import { clearPhotos, exportPhotos, importPhotos } from '../lib/photos'
import { hasAnyRecord, parseState } from '../store/storage'
import { useApp } from '../store/useApp'
import PageHeader from '../components/PageHeader'
import styles from './Settings.module.css'
import page from './Page.module.css'

/** 書き出したファイルの photos を、文字列の組だけ受け入れて取り出す。 */
function readPhotos(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null) return {}
  const photos = (raw as { photos?: unknown }).photos
  if (typeof photos !== 'object' || photos === null) return {}
  const out: Record<string, string> = {}
  for (const [id, value] of Object.entries(photos)) {
    if (typeof value === 'string' && value.startsWith('data:image/')) out[id] = value
  }
  return out
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

export default function Settings() {
  const { state, actions } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const importRequest = useRef(0)
  const [message, setMessage] = useState('')
  const [confirmingReset, setConfirmingReset] = useState(false)
  // 読み込みは今の記録をまるごと置きかえるので、中身を見せてから確かめる
  const [pendingImport, setPendingImport] = useState<UserState | null>(null)
  const [pendingPhotos, setPendingPhotos] = useState<Record<string, string>>({})

  const madeCount = Object.keys(state.made).length

  const handleExport = async () => {
    // 写真は IndexedDB にあるので、書き出しのときだけ JSON に混ぜる。
    // これをしないと、端末を替えたときに写真だけ置き去りになる。
    const { photos, missing } = await exportPhotos(
      state.booklets.filter((b) => b.hasPhoto).map((b) => b.id),
    )
    const blob = new Blob([JSON.stringify({ ...state, photos }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `laq-library-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMessage(
      missing.length > 0
        ? `きろくを ファイルに ほぞんしました。ただし しゃしん ${missing.length} まいは とりだせませんでした。`
        : 'きろくを ファイルに ほぞんしました。',
    )
  }

  /** ファイルの写真を確定して入れる。前の写真は、参照が消えるので先に捨てる。 */
  const applyImport = async () => {
    if (!pendingImport) return
    const incoming = pendingImport
    const photos = pendingPhotos
    setPendingImport(null)
    setPendingPhotos({})
    await clearPhotos()
    const failed = await importPhotos(photos)
    actions.importState(incoming)
    setMessage(
      failed.length > 0
        ? `よみこみました。ただし しゃしん ${failed.length} まいは よみこめませんでした。`
        : 'よみこみました。',
    )
  }

  const handleImport = async (file: File) => {
    const request = ++importRequest.current
    setPendingImport(null)
    setConfirmingReset(false)
    setMessage('')
    try {
      const text = await file.text()
      if (request !== importRequest.current) return
      const raw: unknown = JSON.parse(text)
      const parsed = parseState(raw)
      setPendingPhotos(readPhotos(raw))
      // parseState は形が違うものを空の記録に変える。空を読み込んで
      // 今の記録を消してしまわないよう、中身があるときだけ受けつける
      if (!hasAnyRecord(parsed)) {
        setMessage('このファイルには きろくが 入っていませんでした。')
        return
      }
      setMessage('')
      setPendingImport(parsed)
    } catch {
      if (request !== importRequest.current) return
      setMessage('ファイルを よみこめませんでした。')
    }
  }

  return (
    <div className={page.page}>
      <PageHeader title="せってい" />

      <section className={styles.card}>
        <h2 className={styles.h2}>いまの きろく</h2>
        <ul className={styles.stats}>
          <li>
            <strong>{state.favorites.length}</strong> おきにいり
          </li>
          <li>
            <strong>{madeCount}</strong> つくった
          </li>
          <li>
            <strong>{state.booklets.length}</strong> じぶんで とうろく
          </li>
        </ul>
        <p className={styles.note}>
          きろくは この たんまつの なかだけに ほぞんされます。
          サーバーには おくられません。
        </p>
      </section>

      {/*
        めったに使わない入口なので、一覧のじゃまにならない「せってい」に置く。
        とうろくした数のすぐ下だと、いまいくつあるかを見てから足せる。
      */}
      <section className={styles.card}>
        <h2 className={styles.h2}>手元の さっしから とうろく</h2>
        <p className={styles.note}>
          しょうひんに ついてくる さっしの さくひんを、なまえ・さっし・ページ・
          しゃしん つきで じぶんで ふやせます。ふやした さくひんは、
          とりこんだ さくひんと おなじように さがせます。
        </p>
        <div className={styles.row}>
          <Link to="/booklet/new" className={page.linkButton}>
            ＋ じぶんで とうろく
          </Link>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.h2}>きろくの ひっこし</h2>
        <p className={styles.note}>
          べつの たんまつに うつしたいとき や、けす まえの ひかえに つかいます。
        </p>
        <div className={styles.row}>
          <button
            type="button"
            className={styles.button}
            onClick={() => void handleExport()}
          >
            ファイルに ほぞん
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() => fileRef.current?.click()}
          >
            ファイルから よみこみ
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleImport(file)
            e.target.value = ''
          }}
        />
        {pendingImport && (
          <div className={styles.confirm}>
            <p className={styles.confirmText}>
              いまの きろく（おきにいり {state.favorites.length} こ / つくった{' '}
              {madeCount} こ / とうろく {state.booklets.length} こ）は きえて、
              ファイルの きろく（おきにいり {pendingImport.favorites.length} こ /
              つくった {Object.keys(pendingImport.made).length} こ / とうろく{' '}
              {pendingImport.booklets.length} こ）に なります。よみこみますか？
            </p>
            <div className={styles.row}>
              <button
                type="button"
                className={`${styles.button} ${styles.dangerButton}`}
                onClick={() => void applyImport()}
              >
                よみこむ
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => setPendingImport(null)}
              >
                やめる
              </button>
            </div>
          </div>
        )}
        {message && <p className={styles.message}>{message}</p>}
      </section>

      <section className={styles.card}>
        <h2 className={styles.h2}>さくひんデータ</h2>
        <ul className={styles.sources}>
          {sources.map((s) => (
            <li key={s.source} className={styles.source}>
              <a href={s.sourceUrl} target="_blank" rel="noreferrer">
                {s.sourceLabel}
              </a>
              <span className={styles.note}>
                {s.count} こ / とりこみ日 {formatDate(s.fetchedAt)}
              </span>
            </li>
          ))}
        </ul>
        <p className={styles.note}>
          ぜんぶで {models.length} この さくひんを のせています。
          しゃしん・つくり方の図・PDF は 出典サイトの ものを そのまま
          よみこんで います（このアプリには ふくまれていません）。
          著作権は {sources.map((s) => s.rightsHolder).join('・')}に あります。
        </p>
      </section>

      <section className={`${styles.card} ${styles.danger}`}>
        <h2 className={styles.h2}>きろくを ぜんぶ けす</h2>
        <p className={styles.note}>
          おきにいり（{state.favorites.length}）、つくったきろく（{madeCount}）、
          じぶんで とうろくした さくひん（{state.booklets.length}）と その しゃしんが
          すべて きえます。もとに もどせません。
        </p>
        {confirmingReset ? (
          <div className={styles.row}>
            <button
              type="button"
              className={`${styles.button} ${styles.dangerButton}`}
              onClick={() => {
                importRequest.current += 1
                setPendingImport(null)
                actions.resetAll()
                setConfirmingReset(false)
                setMessage('きろくを けしました。')
              }}
            >
              ほんとうに けす
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={() => setConfirmingReset(false)}
            >
              やめる
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.button}
            onClick={() => setConfirmingReset(true)}
          >
            きろくを けす
          </button>
        )}
      </section>
    </div>
  )
}
