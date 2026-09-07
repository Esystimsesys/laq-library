import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { models } from '../data'
import { allModels } from '../lib/filter'
import { getBrowseState, setBrowseState } from '../lib/browseState'
import { filterModels } from '../lib/filter'
import { emptyFilters, isFiltering, type Filters } from '../lib/search'
import { useApp } from '../store/useApp'
import EmptyState from '../components/EmptyState'
import FilterBar from '../components/FilterBar'
import ModelGrid from '../components/ModelGrid'
import PageHeader from '../components/PageHeader'
import page from './Page.module.css'

export default function Browse() {
  const { state } = useApp()
  // 作品を見て戻ってきたときに、さっきのしぼりこみのまま続けられるようにする
  const [filters, setFiltersState] = useState<Filters>(
    () => getBrowseState().filters,
  )

  const setFilters = (next: Filters) => {
    setFiltersState(next)
    // しぼりこみを変えたら、見ていた位置と開いている件数は引き継がない
    setBrowseState({ filters: next, shown: 0, scrollY: 0 })
  }

  const hits = useMemo(
    () => filterModels(allModels(state), filters, state),
    [filters, state],
  )

  // 戻ってきたときは、見ていたところまで送り返す。
  // 画面が描かれる前に動かしたいので layout effect を使う
  // （Layout 側の RouteChange は「さがす」画面では先頭に戻さない）。
  useLayoutEffect(() => {
    const { scrollY } = getBrowseState()
    if (scrollY > 0) window.scrollTo(0, scrollY)
  }, [])

  useEffect(() => {
    const onScroll = () => setBrowseState({ scrollY: window.scrollY })
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className={page.page}>
      <PageHeader
        title="LaQライブラリ"
        sub={`ぜんぶで ${models.length + state.booklets.length} こ`}
      />

      <FilterBar filters={filters} onChange={setFilters} hitCount={hits.length} />

      <ModelGrid
        models={hits}
        resetKey={filters}
        shown={getBrowseState().shown}
        onShownChange={(shown) => setBrowseState({ shown })}
        empty={
          <EmptyState
            title="みつかりませんでした"
            hint={
              isFiltering(filters)
                ? 'ことばを みじかくするか、しぼりこみを へらしてみてください。'
                : undefined
            }
            action={
              isFiltering(filters) ? (
                <button
                  type="button"
                  className={page.linkButton}
                  onClick={() => setFilters(emptyFilters)}
                >
                  しぼりこみを ぜんぶ やめる
                </button>
              ) : undefined
            }
          />
        }
      />
    </div>
  )
}
