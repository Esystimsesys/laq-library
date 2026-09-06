import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { LEVEL_KANA, LEVEL_LABELS, modelById } from '../data'
import { today } from '../store/reducer'
import { useApp } from '../store/useApp'
import ImageViewer from '../components/ImageViewer'
import RemoteImage from '../components/RemoteImage'
import {
  BackIcon,
  CheckIcon,
  LinkIcon,
  PdfIcon,
  StarIcon,
  ZoomIcon,
} from '../components/icons'
import styles from './Detail.module.css'
import page from './Page.module.css'

export default function Detail() {
  const { modelId = '' } = useParams()
  // URL の作品が変わったら、拡大中のページや取り消し確認も新しくする。
  return <DetailContent key={modelId} modelId={modelId} />
}

function DetailContent({ modelId }: { modelId: string }) {
  const navigate = useNavigate()
  const { state, actions } = useApp()
  const [zoomIndex, setZoomIndex] = useState<number | null>(null)
  const [confirmingUnmake, setConfirmingUnmake] = useState(false)

  // react-router が URL をデコードしてから params に入れるので、ここでは戻さない
  // （もう一度 decodeURIComponent すると、% を含む id で URIError になる）
  const model = modelById.get(modelId)

  if (!model) {
    return (
      <div className={page.page}>
        <h1>さくひんが みつかりません</h1>
        <p>
          <Link to="/" className={page.linkButton}>
            ずかんに もどる
          </Link>
        </p>
      </div>
    )
  }

  const isFavorite = state.favorites.includes(model.id)
  const made = state.made[model.id]

  /** この画面を直接開いたときは戻り先が無いので、ずかんへ帰す。 */
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate('/')
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.topBar} inert={zoomIndex !== null}>
        <button type="button" className={styles.back} onClick={goBack}>
          <BackIcon size={22} />
          もどる
        </button>
      </div>

      {/* 図を大きく出している間は、後ろの画面をタブでも触れないようにする */}
      <div className={page.page} inert={zoomIndex !== null}>
        <div className={styles.head}>
          {model.level && (
            <span className={`${styles.level} ${styles[model.level]}`}>
              {LEVEL_KANA[model.level]}
              <span className={styles.levelSub}>{LEVEL_LABELS[model.level]}</span>
            </span>
          )}
          <h1 className={styles.title}>{model.title}</h1>
        </div>

        {model.mainImage && (
          <RemoteImage
            className={styles.main}
            src={model.mainImage}
            alt={`${model.title} の かんせいひん`}
            loading="eager"
            fallbackText="しゃしんは インターネットに つながると 出ます"
          />
        )}

        {model.categories.length > 0 && (
          <ul className={styles.tags}>
            {model.categories.map((c) => (
              <li key={c} className={styles.tag}>
                {c}
              </li>
            ))}
          </ul>
        )}

        {model.description && <p className={styles.desc}>{model.description}</p>}

        {/* 記録のボタンは、図より先に押せる位置に置く */}
        <div className={styles.actions}>
          <button
            type="button"
            className={isFavorite ? `${styles.big} ${styles.favOn}` : styles.big}
            aria-pressed={isFavorite}
            onClick={() => actions.toggleFavorite(model.id)}
          >
            <StarIcon size={26} filled={isFavorite} />
            {isFavorite ? 'おきにいり' : 'おきにいりに いれる'}
          </button>
          <button
            type="button"
            className={made ? `${styles.big} ${styles.madeOn}` : styles.big}
            aria-pressed={Boolean(made)}
            onClick={() => {
              // 一押しで記録を消さない。メモだけでなく「前に作った日」も守る。
              // もう一度押し直しても今日の日付になるだけで、元の日には戻せないため。
              const hasSomethingToLose =
                made && (made.note.trim() !== '' || made.madeAt !== today())
              if (hasSomethingToLose) setConfirmingUnmake(true)
              else actions.toggleMade(model.id)
            }}
          >
            <CheckIcon size={26} />
            {made ? 'つくった！' : 'つくった！を きろく'}
          </button>
        </div>

        {confirmingUnmake && made && (
          <div className={styles.confirm}>
            <p className={styles.confirmText}>
              「つくった」を とりけすと、{made.madeAt} に つくった きろく
              {made.note.trim() !== '' && 'と メモ'}が きえます。とりけしますか？
            </p>
            <div className={styles.confirmRow}>
              <button
                type="button"
                className={`${styles.confirmBtn} ${styles.confirmDanger}`}
                onClick={() => {
                  actions.toggleMade(model.id)
                  setConfirmingUnmake(false)
                }}
              >
                とりけす
              </button>
              <button
                type="button"
                className={styles.confirmBtn}
                onClick={() => setConfirmingUnmake(false)}
              >
                やめる
              </button>
            </div>
          </div>
        )}

        {made && (
          <div className={styles.record}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>つくった日</span>
              <input
                type="date"
                className={styles.input}
                value={made.madeAt}
                onChange={(e) => actions.setMadeAt(model.id, e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>ひとこと メモ</span>
              <textarea
                className={styles.textarea}
                rows={2}
                placeholder="むずかしかったところ、くふうしたところ など"
                value={made.note}
                onChange={(e) => actions.setMadeNote(model.id, e.target.value)}
              />
            </label>
          </div>
        )}

        <section className={styles.howto}>
          <h2 className={styles.h2}>つくりかた</h2>

          {model.stepImages.length > 0 ? (
            <ol className={styles.steps}>
              {model.stepImages.map((src, i) => (
                <li key={src} className={styles.step}>
                  <span className={styles.stepNo}>{i + 1}</span>
                  <RemoteImage
                    className={styles.stepImage}
                    src={src}
                    alt={`${model.title} のつくり方 ${i + 1}まいめ`}
                    fallbackText="つくり方の図は インターネットに つながると 出ます"
                  />
                  <button
                    type="button"
                    className={styles.zoom}
                    onClick={() => setZoomIndex(i)}
                  >
                    <ZoomIcon size={20} />
                    大きく見る
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.note}>
              この さくひんの つくり方の 図は とりこめていません。
              下の「{model.sourceLinkLabel}」で 見てください。
            </p>
          )}

          <p className={styles.note}>
            つくり方の 図は LaQ公式サイトから よみこんでいます。
            インターネットに つながっていないと 出ないことがあります。
          </p>

          <div className={styles.links}>
            {model.pdfUrl && (
              <a
                className={styles.linkBtn}
                href={model.pdfUrl}
                target="_blank"
                rel="noreferrer"
              >
                <PdfIcon size={22} />
                つくり方PDF（印刷用）
              </a>
            )}
            <a
              className={styles.linkBtn}
              href={model.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              <LinkIcon size={22} />
              {model.sourceLinkLabel}
            </a>
          </div>
        </section>

        <p className={styles.credit}>
          出典: {model.sourceLabel}（{model.rightsHolder}）。
          写真・つくり方の図・PDF の 著作権は 権利者に あります。
          このアプリは 出典の ページを 見つけやすくするための ものです。
        </p>
      </div>

      {zoomIndex !== null && (
        <ImageViewer
          images={model.stepImages}
          index={zoomIndex}
          title={model.title}
          onMove={setZoomIndex}
          onClose={() => setZoomIndex(null)}
        />
      )}
    </div>
  )
}
