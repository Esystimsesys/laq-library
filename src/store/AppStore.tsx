import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { AppContext, type Actions, type ContextValue } from './context'
import { reducer } from './reducer'
import { STORAGE_KEY, emptyState, loadState, parseState, saveState } from './storage'
import { clearAssemblyProgress } from '../assemblies/progress'
import { clearPhotos, importPhotos } from '../lib/photos'

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, loadState)
  const [saveFailed, setSaveFailed] = useState(false)
  const [dataBusy, setDataBusy] = useState(false)
  const dataLock = useRef(false)

  useEffect(() => {
    // 保存できたかは、実際に localStorage へ書いてみないと分からない。
    // 「効果を実行した結果」なので、描画中に導出することはできない。
    // oxlint-disable-next-line react/set-state-in-effect
    setSaveFailed(!saveState(state))
  }, [state])

  /*
    同じ端末で 2 つのタブを開いていると、あとから保存したタブが
    「自分が起動したときの状態」ごと上書きして、もう一方のタブで付けた
    おきにいりを消してしまう。別のタブが書いたら、その内容を取り込む。
    取り込んだ側は同じ内容を書き戻さない（saveState が差分を見て弾く）。
  */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      // 別タブが「ぜんぶ消す」をしたときは newValue が null になる
      const incoming = e.newValue === null ? null : safeParse(e.newValue)
      dispatch({ type: 'data/external', state: incoming ?? loadState() })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // dispatch は変わらないので、actions も作り直さない。
  // ここが毎回新しくなると、カードに渡すコールバックの参照も変わって
  // ModelCard の memo が効かなくなる。
  const actions = useMemo<Actions>(() => {
    // 設定画面を離れて戻っても、進行中の復元と全削除を重ねない。
    async function exclusive<T>(run: () => Promise<T>): Promise<T | null> {
      if (dataLock.current) return null
      dataLock.current = true
      setDataBusy(true)
      try {
        return await run()
      } finally {
        dataLock.current = false
        setDataBusy(false)
      }
    }
    return {
      toggleFavorite: (id) => dispatch({ type: 'favorite/toggle', id }),
      toggleMade: (id) => dispatch({ type: 'made/toggle', id }),
      setMadeAt: (id, madeAt) => dispatch({ type: 'made/setDate', id, madeAt }),
      addBooklet: (entry) => dispatch({ type: 'booklet/add', entry }),
      updateBooklet: (entry) => dispatch({ type: 'booklet/update', entry }),
      deleteBooklet: (id) => dispatch({ type: 'booklet/delete', id }),
      importState: (next, photos) => exclusive(async () => {
        await clearPhotos()
        const failed = await importPhotos(photos)
        dispatch({ type: 'data/import', state: next })
        return failed
      }),
      resetAll: () => exclusive(async () => {
        await clearPhotos()
        if (!saveState(emptyState)) throw new Error('記録を削除できませんでした')
        clearAssemblyProgress()
        dispatch({ type: 'data/reset' })
        return true
      }),
    }
  }, [])

  const value = useMemo<ContextValue>(
    () => ({ state, saveFailed, dataBusy, actions }),
    [state, saveFailed, dataBusy, actions],
  )

  return <AppContext value={value}>{children}</AppContext>
}

function safeParse(raw: string) {
  try {
    return parseState(JSON.parse(raw))
  } catch {
    return null
  }
}
