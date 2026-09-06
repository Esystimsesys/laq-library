import { useEffect, useState, type MouseEventHandler } from 'react'
import styles from './RemoteImage.module.css'

type Props = {
  src: string
  alt: string
  className?: string
  /** 読めなかったときに出す文言。省略すると絵柄だけ */
  fallbackText?: string
  loading?: 'lazy' | 'eager'
  onClick?: MouseEventHandler<HTMLElement>
}

/**
 * 公式サイトから読み込む画像。
 *
 * 写真とつくり方の図はこのアプリに入っていないので、まだ一度も見ていない画像は
 * オフラインだと出せない。そのまま <img> にすると壊れたアイコンが出て
 * 「こわれた」と見えてしまうため、しましまの枠に置きかえる。
 */
export default function RemoteImage({
  src,
  alt,
  className,
  fallbackText,
  loading = 'lazy',
  onClick,
}: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  useEffect(() => {
    const retry = () => setFailedSrc(null)
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [])

  if (failedSrc === src) {
    return (
      <div
        className={`${styles.fallback} ${className ?? ''}`}
        role="img"
        aria-label={alt}
        onClick={onClick}
      >
        {fallbackText && <span className={styles.text}>{fallbackText}</span>}
      </div>
    )
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      onClick={onClick}
      onError={() => {
        void dropFromCache(src)
        setFailedSrc(src)
      }}
    />
  )
}

/**
 * 読めなかった画像を Service Worker のキャッシュから捨てる。
 *
 * 公式サイトの画像は別オリジンなので、キャッシュには中身の見えない
 * レスポンス（opaque）として入る。中身が見えない＝成功か 404 かを区別できないため、
 * 一時的な失敗をそのまま保存してしまうと、公式側が直っても CacheFirst が
 * 壊れたものを返し続ける。表示に失敗した時点で捨てておけば、次に開いたときに
 * 取り直せる。
 *
 * キャッシュ名に依存しないよう、全部のキャッシュから消す（失敗時にしか動かない）。
 */
async function dropFromCache(url: string): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    const names = await caches.keys()
    await Promise.all(
      names.map(async (name) => (await caches.open(name)).delete(url)),
    )
  } catch {
    // キャッシュを触れない環境（プライベートブラウジングなど）では何もしない
  }
}
