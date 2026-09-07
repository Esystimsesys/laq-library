import { useEffect } from 'react'
import { useLocation } from 'react-router'

/**
 * 画面が変わったときの後始末。
 *
 * - 先頭から見せる。一覧を下までスクロールしてから作品を開くと、
 *   詳細も同じ位置から始まってしまうため。
 * - 見出しにフォーカスを移す。読み上げを使っていると、タブを切り替えても
 *   「いま何の画面か」が伝わらないため。輪郭線は global.css で消してある
 *   （まだ指で触っていない画面では、プログラムからの focus でも
 *   :focus-visible が成り立ち、題に青い枠がついて見えるため）。
 */
export default function RouteChange() {
  const { pathname } = useLocation()

  useEffect(() => {
    // 「さがす」画面は、戻ってきたときに前の位置へ送り返したいので
    // Browse 側が自分でスクロール位置を持っている。ここでは触らない。
    if (pathname !== '/') window.scrollTo(0, 0)

    const heading = document.querySelector('h1')
    if (heading) {
      heading.tabIndex = -1
      heading.focus({ preventScroll: true })
    }
  }, [pathname])

  return null
}
