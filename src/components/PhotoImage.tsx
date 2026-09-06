import { useEffect, useRef, useState } from 'react'
import { getPhoto } from '../lib/photos'
import styles from './RemoteImage.module.css'

type Props = {
  /** 冊子エントリの id。写真は IndexedDB にこの id で入っている */
  id: string
  alt: string
  className?: string
  fallbackText?: string
}

/** 自分で撮った写真。端末の IndexedDB にあるので、読み出して表示する。 */
export default function PhotoImage({ id, alt, className, fallbackText }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  // IntersectionObserver が無い環境では待たずに読む（見えたか判定できないため）
  const [near, setNear] = useState(
    () => typeof IntersectionObserver === 'undefined',
  )
  const holder = useRef<HTMLDivElement>(null)

  // 画面に近づくまで IndexedDB を読みにいかない。おきにいりは区切らずに
  // 全部並べるので、見えていないカードのぶんまで読むと開くのが遅くなるうえ、
  // 表示しない写真の Blob URL を抱えつづけることになる。
  useEffect(() => {
    if (near) return
    const el = holder.current
    if (!el) return
    // 少し手前から読み始めて、スクロールしたときに枠のままにならないようにする
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true)
          observer.disconnect()
        }
      },
      { rootMargin: '300px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [near])

  useEffect(() => {
    if (!near) return
    let objectUrl: string | null = null
    let cancelled = false

    void getPhoto(id).then((blob) => {
      if (cancelled) return
      if (!blob) {
        setMissing(true)
        return
      }
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })

    return () => {
      cancelled = true
      // 作った URL は片づける。放っておくと画面を行き来するたびに増える
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id, near])

  if (missing || (!url && !missing)) {
    return (
      <div
        ref={holder}
        className={`${styles.fallback} ${className ?? ''}`}
        role="img"
        aria-label={alt}
      >
        {missing && fallbackText && <span className={styles.text}>{fallbackText}</span>}
      </div>
    )
  }

  return <img className={className} src={url!} alt={alt} decoding="async" />
}
