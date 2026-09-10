import { useEffect, useId, useState, type ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { categories as ALL_CATEGORIES, LEVEL_KANA } from '../data'
import type { Level } from '../data/types'
import { MAX_PHOTOS, deletePhotos, getPhotos, savePhotos, shrink } from '../lib/photos'
import { useApp } from '../store/useApp'
import type { BookletEntry } from '../store/types'
import PageHeader from '../components/PageHeader'
import { BackIcon } from '../components/icons'
import styles from './BookletForm.module.css'
import page from './Page.module.css'

const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced']

/** 並べかえても表示が入れ替わらないよう、写真ごとに key を持たせる */
type DraftPhoto = { key: string; blob: Blob }

function newEntry(): BookletEntry {
  return {
    id: `my-booklet:${crypto.randomUUID()}`,
    title: '',
    booklet: '',
    page: '',
    level: null,
    categories: [],
    note: '',
    photoCount: 0,
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
    直すときは保存済みの写真を読み出して並べ、足す・けす・並べかえをこの中で済ませてから、
    確定のときにまとめて書き直す。null は読み出している途中。
  */
  const [photos, setPhotos] = useState<DraftPhoto[] | null>(() =>
    existing && existing.photoCount > 0 ? null : [],
  )
  const [photosChanged, setPhotosChanged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (entry.photoCount === 0) return
    let cancelled = false
    void getPhotos(entry.id, entry.photoCount).then((blobs) => {
      if (cancelled) return
      setPhotos(blobs.flatMap((blob) => (blob ? [{ key: crypto.randomUUID(), blob }] : [])))
    })
    return () => {
      cancelled = true
    }
  }, [entry.id, entry.photoCount])

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

  const addPhotos = async (files: File[]) => {
    if (!photos) return
    const room = MAX_PHOTOS - photos.length
    setBusy(true)
    const added: DraftPhoto[] = []
    let failed = 0
    // 1 枚ずつ縮める。まとめて展開すると、大きな写真を何枚も同時に抱えてメモリが足りなくなる
    for (const file of files.slice(0, room)) {
      try {
        added.push({ key: crypto.randomUUID(), blob: await shrink(file) })
      } catch {
        failed += 1
      }
    }
    if (added.length > 0) {
      setPhotos((old) => [...(old ?? []), ...added])
      setPhotosChanged(true)
    }
    setError(
      failed > 0
        ? `しゃしんが ${failed} まい よみこめませんでした。`
        : files.length > room
          ? `しゃしんは ${MAX_PHOTOS} まいまでです。`
          : '',
    )
    setBusy(false)
  }

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length > 0) void addPhotos(files)
  }

  const movePhoto = (from: number, to: number) => {
    setPhotos((old) => {
      if (!old) return old
      const next = [...old]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    setPhotosChanged(true)
  }

  const removePhoto = (index: number) => {
    setPhotos((old) => old && old.filter((_, i) => i !== index))
    setPhotosChanged(true)
  }

  const save = async () => {
    if (entry.title.trim() === '') {
      setError('なまえを 入れてください。')
      return
    }
    setBusy(true)
    let photoCount = entry.photoCount
    if (photosChanged && photos) {
      try {
        // 写真は確定のここで初めて書き込む。書けなければ登録も止める
        await savePhotos(entry.id, photos.map((p) => p.blob), entry.photoCount)
        photoCount = photos.length
      } catch {
        setError(
          'しゃしんを ほぞんできませんでした。たんまつの あきが たりないかもしれません。もういちど おしてください。',
        )
        setBusy(false)
        return
      }
    }
    const saved = { ...entry, title: entry.title.trim(), photoCount }
    if (isEdit) actions.updateBooklet(saved)
    else actions.addBooklet(saved)
    navigate(`/model/${encodeURIComponent(saved.id)}`)
  }

  const photoAlt = entry.title || 'とうろくした さくひん'

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
        <span className={styles.label}>しゃしん（ページの じゅんに {MAX_PHOTOS} まいまで）</span>
        {photos === null ? (
          <p className={styles.note}>しゃしんを よみこんでいます…</p>
        ) : (
          photos.length > 0 && (
            <ol className={styles.photos}>
              {photos.map((photo, i) => (
                <li key={photo.key} className={styles.photoItem}>
                  <span className={styles.photoNo}>{i + 1}</span>
                  <BlobImage
                    className={styles.photo}
                    blob={photo.blob}
                    alt={`${photoAlt} の しゃしん ${i + 1}まいめ`}
                  />
                  <div className={styles.photoTools}>
                    <button
                      type="button"
                      className={styles.tool}
                      aria-label={`${i + 1}まいめを まえへ`}
                      disabled={busy || i === 0}
                      onClick={() => movePhoto(i, i - 1)}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className={styles.tool}
                      aria-label={`${i + 1}まいめを うしろへ`}
                      disabled={busy || i === photos.length - 1}
                      onClick={() => movePhoto(i, i + 1)}
                    >
                      →
                    </button>
                    <button
                      type="button"
                      className={`${styles.tool} ${styles.toolDanger}`}
                      aria-label={`${i + 1}まいめを けす`}
                      disabled={busy}
                      onClick={() => removePhoto(i)}
                    >
                      けす
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )
        )}
        {/*
          ページを続けて撮るときはカメラを直接開き、撮りためた写真はまとめて選べるようにする。
          capture を付けると iOS はアルバムを出さなくなるので、入口を 2 つに分けている。
        */}
        <div className={styles.photoButtons}>
          <label className={styles.photoButton}>
            カメラで とる
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="visually-hidden"
              disabled={photos === null || busy}
              onChange={onFiles}
            />
          </label>
          <label className={styles.photoButton}>
            アルバムから えらぶ
            <input
              type="file"
              accept="image/*"
              multiple
              className="visually-hidden"
              disabled={photos === null || busy}
              onChange={onFiles}
            />
          </label>
        </div>
        <p className={styles.note}>
          さっしの ページを 1ページずつ とってね。1まいめが いちらんの しゃしんに なります。
          しゃしんは 字が よめる 大きさの まま この たんまつに ほぞんします。
          どこにも おくられません。
          {photosChanged && ' したの ボタンを おすまで ほぞんされません。'}
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
                  void deletePhotos(entry.id, entry.photoCount)
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

/** 保存前の写真を見せる。URL は表示している間だけ持ち、外れたら片づける */
function BlobImage({ blob, alt, className }: { blob: Blob; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    // URL の作成と破棄を対にするには effect で作るしかない（描画中に作ると、
    // StrictMode の付け外しで破棄済みの URL を表示に使ってしまう）。
    const objectUrl = URL.createObjectURL(blob)
    // oxlint-disable-next-line react/set-state-in-effect
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])
  return url ? <img className={className} src={url} alt={alt} decoding="async" /> : null
}
