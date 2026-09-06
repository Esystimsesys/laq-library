/*
  アイコンは絵文字ではなく手描きの SVG にしている。
  絵文字は端末ごとに絵柄も大きさも変わってしまい、線の太さをそろえられないため。
  すべて 24x24 の座標系・太さ 2.2 の丸い線で統一している。
*/
type Props = {
  size?: number
  /** 塗りつぶし（お気に入りの ON など） */
  filled?: boolean
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function Svg({ size = 24, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function SearchIcon(props: Props) {
  return (
    <Svg {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" {...stroke} />
      <path d="M15.5 15.5 L20.5 20.5" {...stroke} />
    </Svg>
  )
}

export function StarIcon({ filled, ...props }: Props) {
  return (
    <Svg {...props}>
      <path
        d="M12 3.2 14.6 9 21 9.7 16.3 14 17.6 20.3 12 17.1 6.4 20.3 7.7 14 3 9.7 9.4 9Z"
        {...stroke}
        fill={filled ? 'currentColor' : 'none'}
      />
    </Svg>
  )
}

export function CheckIcon(props: Props) {
  return (
    <Svg {...props}>
      <path d="M4.5 12.8 9.5 17.8 19.5 6.5" {...stroke} strokeWidth={3} />
    </Svg>
  )
}

/** 「つくった」タブ。丸のなかにチェックを入れたスタンプ風 */
export function StampIcon({ filled, ...props }: Props) {
  return (
    <Svg {...props}>
      <circle
        cx="12"
        cy="12"
        r="8.6"
        {...stroke}
        fill={filled ? 'currentColor' : 'none'}
      />
      <path
        d="M7.8 12.3 10.8 15.3 16.2 8.9"
        {...stroke}
        stroke={filled ? 'var(--card)' : 'currentColor'}
      />
    </Svg>
  )
}

export function BookIcon(props: Props) {
  return (
    <Svg {...props}>
      <path d="M4 5.2C6.6 3.9 9.3 3.9 12 5.2c2.7-1.3 5.4-1.3 8 0v13c-2.6-1.3-5.3-1.3-8 0-2.7-1.3-5.4-1.3-8 0Z" {...stroke} />
      <path d="M12 5.2v13" {...stroke} />
    </Svg>
  )
}

export function GearIcon({ filled, ...props }: Props) {
  // 歯を 8 枚もつ歯車の輪郭。線だけだと太陽に見えるので、外周を歯の形で閉じる
  const teeth = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4
    const x = 12 + Math.cos(a) * 9.4
    const y = 12 + Math.sin(a) * 9.4
    return `M${(12 + Math.cos(a) * 6.4).toFixed(1)} ${(12 + Math.sin(a) * 6.4).toFixed(1)} L${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')

  return (
    <Svg {...props}>
      <circle
        cx="12"
        cy="12"
        r="7"
        {...stroke}
        fill={filled ? 'currentColor' : 'none'}
      />
      <path d={teeth} {...stroke} strokeWidth={3.2} />
      <circle cx="12" cy="12" r="2.8" {...stroke} stroke={filled ? 'var(--card)' : 'currentColor'} />
    </Svg>
  )
}

export function BackIcon(props: Props) {
  return (
    <Svg {...props}>
      <path d="M14.5 5 7.5 12l7 7" {...stroke} strokeWidth={2.8} />
    </Svg>
  )
}

export function CloseIcon(props: Props) {
  return (
    <Svg {...props}>
      <path d="M6 6 18 18M18 6 6 18" {...stroke} strokeWidth={2.8} />
    </Svg>
  )
}

export function ZoomIcon(props: Props) {
  return (
    <Svg {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" {...stroke} />
      <path d="M15.5 15.5 20.5 20.5M8 10.5h5M10.5 8v5" {...stroke} />
    </Svg>
  )
}

export function PdfIcon(props: Props) {
  return (
    <Svg {...props}>
      <path d="M6 3.2h7.5L18.5 8v12.8H6Z" {...stroke} />
      <path d="M13.5 3.2V8h5" {...stroke} />
      <path d="M12 10.8v6.4M9.4 14.6 12 17.2l2.6-2.6" {...stroke} />
    </Svg>
  )
}

export function LinkIcon(props: Props) {
  return (
    <Svg {...props}>
      <path d="M13.5 5.5h5v5" {...stroke} />
      <path d="M18.5 5.5 11 13" {...stroke} />
      <path d="M16.5 14v4.5H5.5V7.5H10" {...stroke} />
    </Svg>
  )
}
