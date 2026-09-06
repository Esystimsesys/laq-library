import { useEffect, useState } from 'react'
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

  useEffect(() => {
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
  }, [id])

  if (missing || (!url && !missing)) {
    return (
      <div className={`${styles.fallback} ${className ?? ''}`} role="img" aria-label={alt}>
        {missing && fallbackText && <span className={styles.text}>{fallbackText}</span>}
      </div>
    )
  }

  return <img className={className} src={url!} alt={alt} decoding="async" />
}
