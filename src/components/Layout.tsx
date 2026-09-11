import { NavLink, Outlet, useLocation } from 'react-router'
import { useApp } from '../store/useApp'
import RouteChange from './RouteChange'
import { BookIcon, GearIcon, StarIcon } from './icons'
import styles from './Layout.module.css'

const TABS = [
  { to: '/', label: 'さがす', Icon: BookIcon },
  { to: '/favorites', label: 'マイライブラリ', Icon: StarIcon },
  { to: '/settings', label: 'せってい', Icon: GearIcon },
]

export default function Layout() {
  const { pathname } = useLocation()
  const { saveFailed, dataBusy } = useApp()
  // 作品の詳細と、自分で登録する画面はタブの外側なので、下のナビは出さない
  const isDetail =
    pathname.startsWith('/model/') || pathname.startsWith('/booklet/') || pathname.startsWith('/assembly/')

  return (
    <div className="app">
      <RouteChange />
      {/* 保存できていないのに画面だけ増えていくと、あとで消えて驚くことになる */}
      {saveFailed && (
        <p className={styles.saveWarning} role="alert">
          きろくを この たんまつに ほぞんできていません。
          「せってい」から ファイルに ほぞんして ください。
        </p>
      )}
      {dataBusy && (
        <p className={styles.saveWarning} role="status">
          きろくを せいりしています。すこし まってね。
        </p>
      )}
      <main className={styles.main} inert={dataBusy}>
        <Outlet />
      </main>
      {!isDetail && (
        <nav className={styles.nav} aria-label="メインメニュー" inert={dataBusy}>
          {TABS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                isActive ? `${styles.tab} ${styles.active}` : styles.tab
              }
            >
              {({ isActive }) => (
                <>
                  <span className={styles.tabIcon}>
                    <Icon size={26} filled={isActive} />
                  </span>
                  <span className={styles.tabLabel}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
