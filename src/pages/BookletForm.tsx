import { useEffect, useId, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { categories as ALL_CATEGORIES, LEVEL_KANA } from '../data'
import type { Level } from '../data/types'
import { deletePhoto, putPhoto, shrink } from '../lib/photos'
import { useApp } from '../store/useApp'
import type { BookletEntry } from '../store/types'
import PageHeader from '../components/PageHeader'
import PhotoImage from '../components/PhotoImage'
import { BackIcon } from '../components/icons'
import styles from './BookletForm.module.css'
import page from './Page.module.css'

const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced']

function newEntry(): BookletEntry {
  return {
    id: `my-booklet:${crypto.randomUUID()}`,
    title: '',
    booklet: '',
    page: '',
    level: null,
    categories: [],
    note: '',
    hasPhoto: false,
    createdAt: new Date().toISOString(),
  }
}

/** 手元の冊子にある作品を、自分で登録する画面。 */
export default function BookletForm() {
  const { entryId } = useParams()
  const navigate = useNavigate()
  const { state, actions } = useApp()
  const ids = useId()

  const existing = entryId
    ? state.booklets.find((b) => b.id === decodeURIComponent(entryId))
    : undefined
  const isEdit = Boolean(existing)

  const [entry, setEntry] = useState<BookletEntry>(() => existing ?? newEntry())
  /*
    選んだ写真は、登録を確定するまで保存しない。
    選んだ時点で書き込むと、「もどる」でやめたのに写真だけ端末に残ったり、
    直しかけの写真が元の写真を上書きしてしまう。
  */
  const [draft, setDraft] = useState<{ blob: Blob; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState('')

  // 下書きのプレビュー用に作った URL は、画面を離れるときに片づける
  useEffect(() => () => {
    if (draft) URL.revokeObjectURL(draft.url)
  }, [draft])

  if (entryId && !existing) {
    return (
      <div className={page.page}>
        <h1>その とうろくは ありません</h1>
        <button type="button" className={page.linkButton} onClick={() => navigate('/')}>
          ずかんに もどる
        </button>
      </div>
    )
  }

  const set = <K extends keyof BookletEntry>(key: K, value: BookletEntry[K]) =>
    setEntry((e) => ({ ...e, [key]: value }))

  const toggleCategory = (c: string) =>
    set(
      'categories',
      entry.categories.includes(c)
        ? entry.categories.filter((x) => x !== c)
        : [...entry.categories, c],
    )

  const handlePhoto = async (file: File) => {
    setBusy(true)
    try {
      const blob = await shrink(file)
      setDraft((old) => {
        if (old) URL.revokeObjectURL(old.url)
        return { blob, url: URL.createObjectURL(blob) }
      })
      setError('')
    } catch {
      setError('しゃしんを よみこめませんでした。')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (entry.title.trim() === '') {
      setError('なまえを 入れてください。')
      return
    }
    setBusy(true)
    let hasPhoto = entry.hasPhoto
    if (draft) {
      try {
        // 写真は確定のここで初めて書き込む。書けなければ登録も止める
        await putPhoto(entry.id, draft.blob)
        hasPhoto = true
      } catch {
        setError('しゃしんを ほぞんできませんでした。もういちど おしてください。')
        setBusy(false)
        return
      }
    }
    const saved = { ...entry, title: entry.title.trim(), hasPhoto }
    if (isEdit) actions.updateBooklet(saved)
    else actions.addBooklet(saved)
    navigate(`/model/${encodeURIComponent(saved.id)}`)
  }

  return (
    <div className={page.page}>
      <button type="button" className={styles.back} onClick={() => navigate(-1)}>
        <BackIcon size={22} />
        もどる
      </button>

      <PageHeader title={isEdit ? 'とうろくを なおす' : 'じぶんで とうろく'} />

      <p className={styles.lead}>
        手元の LaQ の冊子に のっている さくひんを、じぶんで ふやせます。
        きろくは この たんまつの なかだけに のこります。
      </p>

      <div className={styles.card}>
        <label className={styles.field} htmlFor={`${ids}-title`}>
          <span className={styles.label}>なまえ（かならず）</span>
          <input
            id={`${ids}-title`}
            className={styles.input}
            value={entry.title}
            placeholder="例: きょうりゅうの ロボット"
            onChange={(e) => set('title', e.target.value)}
          />
        </label>

        <label className={styles.field} htmlFor={`${ids}-booklet`}>
          <span className={styles.label}>どの さっし？</span>
          <input
            id={`${ids}-booklet`}
            className={styles.input}
            value={entry.booklet}
            placeholder="例: ベーシック401"
            onChange={(e) => set('booklet', e.target.value)}
          />
        </label>

        <label className={styles.field} htmlFor={`${ids}-page`}>
          <span className={styles.label}>なんページ？</span>
          <input
            id={`${ids}-page`}
            className={styles.input}
            inputMode="numeric"
            value={entry.page}
            placeholder="例: 12"
            onChange={(e) => set('page', e.target.value)}
          />
        </label>
      </div>

      <fieldset className={styles.card}>
        <legend className={styles.label}>むずかしさ</legend>
        <div className={styles.chips} role="radiogroup" aria-label="むずかしさ">
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={entry.level === level}
              className={`${styles.chip} ${entry.level === level ? styles.on : ''}`}
              onClick={() => set('level', entry.level === level ? null : level)}
            >
              {LEVEL_KANA[level]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.card}>
        <legend className={styles.label}>なかま（いくつでも）</legend>
        <div className={styles.chips}>
          {ALL_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={entry.categories.includes(c)}
              className={`${styles.chip} ${entry.categories.includes(c) ? styles.on : ''}`}
              onClick={() => toggleCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </fieldset>

      <div className={styles.card}>
        <span className={styles.label}>しゃしん</span>
        {draft ? (
          <img
            className={styles.photo}
            src={draft.url}
            alt={`${entry.title || 'とうろくした さくひん'} のしゃしん`}
          />
        ) : (
          entry.hasPhoto && (
            <PhotoImage
              id={entry.id}
              alt={`${entry.title || 'とうろくした さくひん'} のしゃしん`}
              className={styles.photo}
              fallbackText="しゃしんが 見つかりません"
            />
          )
        )}
        <label className={styles.photoButton}>
          {draft || entry.hasPhoto ? 'しゃしんを とりなおす' : 'しゃしんを えらぶ'}
          <input
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handlePhoto(file)
              e.target.value = ''
            }}
          />
        </label>
        <p className={styles.note}>
          しゃしんは 小さくしてから この たんまつに ほぞんします。
          どこにも おくられません。
          {draft && ' したの ボタンを おすまで ほぞんされません。'}
        </p>
      </div>

      <label className={styles.card} htmlFor={`${ids}-note`}>
        <span className={styles.label}>メモ</span>
        <textarea
          id={`${ids}-note`}
          className={styles.textarea}
          rows={3}
          value={entry.note}
          placeholder="つかったセット、むずかしかったところ など"
          onChange={(e) => set('note', e.target.value)}
        />
      </label>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className={styles.save}
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? 'ほぞんちゅう…' : isEdit ? 'なおす' : 'とうろくする'}
      </button>

      {isEdit &&
        (confirmingDelete ? (
          <div className={styles.confirm}>
            <p className={styles.confirmText}>
              この とうろくを けしますか？ しゃしんも いっしょに きえます。
            </p>
            <div className={styles.chips}>
              <button
                type="button"
                className={`${styles.chip} ${styles.danger}`}
                disabled={busy}
                onClick={() => {
                  void deletePhoto(entry.id)
                  actions.deleteBooklet(entry.id)
                  navigate('/')
                }}
              >
                けす
              </button>
              <button
                type="button"
                className={styles.chip}
                onClick={() => setConfirmingDelete(false)}
              >
                やめる
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={styles.delete}
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
          >
            この とうろくを けす
          </button>
        ))}
    </div>
  )
}
