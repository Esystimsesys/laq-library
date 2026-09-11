import { listReturnTo } from '../lib/returnTo'
import { assemblyForModel } from '../assemblies/catalog'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { LEVEL_KANA, LEVEL_LABELS, sourceOf } from '../data'
import { useLookup } from '../lib/lookup'
import { isMyBooklet } from '../lib/myModels'
import { photoKeys } from '../lib/photos'
import { today } from '../store/reducer'
import { useApp } from '../store/useApp'
import ImageViewer from '../components/ImageViewer'
import PhotoImage from '../components/PhotoImage'
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
  const returnTo = listReturnTo(useLocation().state)
  const { state, actions } = useApp()
  const lookup = useLookup()
  const [zoomIndex, setZoomIndex] = useState<number | null>(null)
  const [confirmingUnmake, setConfirmingUnmake] = useState(false)

  // react-router が URL をデコードしてから params に入れるので、ここでは戻さない
  // （もう一度 decodeURIComponent すると、% を含む id で URIError になる）
  const model = lookup(modelId)

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

  const source = sourceOf(model)
  const mine = isMyBooklet(model)
  // つくり方の図を持っているのは公式ぶんだけ。ぷりまつラボは本家の記事へ送る
  const hasSteps = model.stepImages.length > 0
  const assembly = assemblyForModel(model.id)
  const bookletEntry = mine
    ? state.booklets.find((b) => b.id === model.id)
    : undefined
  // 自分で撮った冊子のページ。公式の手順の図と同じように並べて、拡大して読む
  const pagePhotos = bookletEntry
    ? photoKeys(bookletEntry.id, bookletEntry.photoCount)
    : []
  const isFavorite = state.favorites.includes(model.id)
  const made = state.made[model.id]

  // Return to the originating list, even after a round trip through the 3D guide.
  const goBack = () => navigate(returnTo, { replace: true })

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

        {/* 自分の作品の写真は冊子のページなので、下の「つくりかた」に順に並べる */}
        {!mine && model.mainImage && (
          <RemoteImage
            className={styles.main}
            src={model.mainImage}
            alt={`${model.title} の かんせいひん`}
            loading="eager"
            fallbackText="しゃしんは インターネットに つながると 出ます"
          />
        )}

        {bookletEntry && (
          <dl className={styles.bookletInfo}>
            {bookletEntry.booklet && (
              <>
                <dt>さっし</dt>
                <dd>{bookletEntry.booklet}</dd>
              </>
            )}
            {bookletEntry.page && (
              <>
                <dt>ページ</dt>
                <dd>{bookletEntry.page}</dd>
              </>
            )}
          </dl>
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

        {/* 自分の作品は、冊子名とページを上の枠で出しているので、メモだけを見せる
            （説明文には検索のために冊子名も混ぜてあり、そのまま出すと重複する） */}
        {mine
          ? bookletEntry?.note && <p className={styles.desc}>{bookletEntry.note}</p>
          : model.description && <p className={styles.desc}>{model.description}</p>}

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
              // 一押しで「前に作った日」を消さない。もう一度押し直しても
              // 今日の日付になるだけで、元の日には戻せないため。
              const hasSomethingToLose = made && made.madeAt !== today()
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
              「つくった」を とりけすと、{made.madeAt} に つくった きろくが
              きえます。とりけしますか？
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
          <label className={styles.record}>
            <span className={styles.recordLabel}>つくった日</span>
            <input
              type="date"
              className={styles.recordDate}
              value={made.madeAt}
              onChange={(e) => actions.setMadeAt(model.id, e.target.value)}
            />
          </label>
        )}

        {mine ? (
          <section className={styles.howto}>
            <h2 className={styles.h2}>つくりかた</h2>
            {pagePhotos.length > 0 ? (
              <ol className={styles.steps}>
                {pagePhotos.map((key, i) => (
                  <li key={key} className={styles.step}>
                    <span className={styles.stepNo}>{i + 1}</span>
                    <PhotoImage
                      className={styles.stepImage}
                      id={key}
                      alt={`${model.title} のつくり方 ${i + 1}まいめ`}
                      fallbackText="しゃしんが 見つかりません"
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
                つくり方は、手元の
                {bookletEntry?.booklet ? `「${bookletEntry.booklet}」` : 'さっし'}
                {bookletEntry?.page ? ` の ${bookletEntry.page}ページ` : ''}を 見てね。
                「とうろくを なおす」で さっしの ページを しゃしんに とると、
                ここで 見られます。
              </p>
            )}
            <div className={styles.links}>
              <Link
                className={styles.linkBtn}
                to={`/booklet/${encodeURIComponent(model.id)}`}
              >
                とうろくを なおす
              </Link>
            </div>
          </section>
        ) : (
        <section className={styles.howto}>
          <h2 className={styles.h2}>つくりかた</h2>

          {hasSteps ? (
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
          ) : assembly ? null : (
            <p className={styles.note}>
              つくり方は 下の「{source.sourceLinkLabel}」で 見てね。
            </p>
          )}

          <div className={`${styles.links} ${assembly ? styles.assemblyLinks : ''}`}>
            {assembly && <Link to={`/assembly/${assembly.id}`} state={{ returnTo }} className={styles.linkBtn}>3Dで 作る</Link>}
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
              {source.sourceLinkLabel}
            </a>
          </div>

          {/* 出しどころの断りは、まずリンクへ行けるようにしてから最後に置く */}
          <p className={styles.note}>
            {hasSteps ? 'しゃしんと 図は' : 'しゃしんは'} {source.sourceLabel} から
            よみこんでいます。インターネットに つながっていないと
            出ないことがあります。
          </p>
        </section>
        )}

        <p className={styles.credit}>
          {mine ? (
            <>
              これは じぶんで とうろくした さくひんです。
              しゃしんも きろくも この たんまつの なかだけに あります。
            </>
          ) : (
            <>
              出典: {source.sourceLabel}（{source.rightsHolder}）。
              写真・つくり方の図・PDF の 著作権は 権利者に あります。
              このアプリは 出典の ページを 見つけやすくするための ものです。
            </>
          )}
        </p>
      </div>

      {zoomIndex !== null && (
        <ImageViewer
          images={mine ? pagePhotos : model.stepImages}
          local={mine}
          index={zoomIndex}
          title={model.title}
          onMove={setZoomIndex}
          onClose={() => setZoomIndex(null)}
        />
      )}
    </div>
  )
}
