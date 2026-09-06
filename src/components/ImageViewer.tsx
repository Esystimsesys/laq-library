import { useEffect, useRef } from 'react'
import { CloseIcon } from './icons'
import RemoteImage from './RemoteImage'
import styles from './ImageViewer.module.css'

type Props = {
  images: string[]
  index: number
  title: string
  onMove: (index: number) => void
  onClose: () => void
}

/**
 * つくり方の図を画面いっぱいに出す。
 * 図は文字が細かいので、閉じる・めくるのボタンは指で押しやすい大きさにしている。
 */
export default function ImageViewer({
  images,
  index,
  title,
  onMove,
  onClose,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 開いたら閉じるボタンに移り、閉じたら開くのに使ったボタンへ戻す。
    // 戻さないとフォーカスが body に落ちて、キーボードだと迷子になる。
    const opener = document.activeElement
    closeRef.current?.focus()
    return () => {
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  // 背後の画面はタブで触れないように、フォーカスをこの中で回す
  useEffect(() => {
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panelRef.current) return
      const targets = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled)',
      )
      if (targets.length === 0) return
      const first = targets[0]
      const last = targets[targets.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onTab)
    return () => window.removeEventListener('keydown', onTab)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && index < images.length - 1) onMove(index + 1)
      if (e.key === 'ArrowLeft' && index > 0) onMove(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, images.length, onMove, onClose])

  // 後ろの一覧がスクロールしてしまわないように止める
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  return (
    <div
      ref={panelRef}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} のつくり方`}
      onClick={onClose}
    >
      <div className={styles.bar}>
        {/* めくったことが読み上げにも伝わるようにする */}
        <span className={styles.counter} aria-live="polite">
          {index + 1} / {images.length}
        </span>
        <button
          ref={closeRef}
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="とじる"
        >
          <CloseIcon size={24} />
        </button>
      </div>

      {/* 画像そのものを押しても閉じないようにして、拡大操作の邪魔をしない */}
      <RemoteImage
        key={images[index]}
        className={styles.image}
        src={images[index]}
        alt={`${title} のつくり方 ${index + 1}まいめ`}
        loading="eager"
        fallbackText="つくり方の図は インターネットに つながると 出ます"
        onClick={(e) => e.stopPropagation()}
      />

      {images.length > 1 && (
        <div className={styles.pager} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={index === 0}
            onClick={() => onMove(index - 1)}
          >
            ← まえ
          </button>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={index === images.length - 1}
            onClick={() => onMove(index + 1)}
          >
            つぎ →
          </button>
        </div>
      )}
    </div>
  )
}
