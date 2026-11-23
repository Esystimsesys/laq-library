import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { categories as CATEGORY_ORDER, sourceOf } from '../data'
import type { Model } from '../data/types'
import { collectionModels } from '../lib/collection'
import { useLookup } from '../lib/lookup'
import { useApp } from '../store/useApp'
import EmptyState from '../components/EmptyState'
import { FilterGroup, FilterPanel, FilterResult } from '../components/FilterPanel'
import ModelGrid from '../components/ModelGrid'
import PageHeader from '../components/PageHeader'
import StatusChips, { type StatusOption } from '../components/StatusChips'
import page from './Page.module.css'

type Status = 'all' | 'notMade' | 'made'
const ALL = 'all'

/**
 * マイライブラリにある作品の なかま だけを、「さがす」と同じ並びで出す。
 * 1 件も無い なかま を出しても、押すと から になるだけなので出さない。
 * 自分で登録した作品には、取り込んだ作品に無い なかま が付いていることがあるので後ろに足す。
 */
function categoryOptions(list: { categories: string[] }[]): StatusOption<string>[] {
  const count = new Map<string, number>()
  for (const m of list) for (const c of m.categories) count.set(c, (count.get(c) ?? 0) + 1)
  const ordered = [...CATEGORY_ORDER.filter((c) => count.has(c)), ...[...count.keys()].filter((c) => !CATEGORY_ORDER.includes(c))]
  return [{ value: ALL, label: 'ぜんぶ' }, ...ordered.map((c) => ({ value: c, label: `${c} ${count.get(c)}` }))]
}

/**
 * どこの作品か も同じく、記録にあるものだけを件数つきで出す。
 * 並びは自分で登録した作品を先頭に、あとは一覧に出てくる順（collectionModels の順）。
 */
function sourceOptions(list: Model[]): StatusOption<string>[] {
  const count = new Map<string, { label: string; n: number }>()
  for (const m of [...list].sort((a, b) => Number(b.source === 'my-booklet') - Number(a.source === 'my-booklet'))) {
    const entry = count.get(m.source) ?? { label: sourceOf(m).shortLabel, n: 0 }
    entry.n += 1
    count.set(m.source, entry)
  }
  return [{ value: ALL, label: 'ぜんぶ' }, ...[...count].map(([value, { label, n }]) => ({ value, label: `${label} ${n}` }))]
}

const STATUSES: StatusOption<Status>[] = [
  { value: 'all', label: 'ぜんぶ' },
  { value: 'notMade', label: 'つくってない' },
  { value: 'made', label: 'つくった' },
]

export default function Favorites() {
  const { state } = useApp()
  const lookup = useLookup()
  const [params, setParams] = useSearchParams()
  const status: Status = params.get('status') === 'made' ? 'made' : params.get('status') === 'notMade' ? 'notMade' : 'all'
  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key); else next.set(key, value)
    setParams(next, { replace: true })
  }
  const list = useMemo(() => collectionModels(state, lookup), [state, lookup])
  const categoryChoices = useMemo(() => categoryOptions(list), [list])
  // ★を外して その なかま が 1 件も無くなったときは、ぜんぶ に戻して から の画面を出さない
  const requested = params.get('nakama')
  const category = requested && categoryChoices.some(o => o.value === requested) ? requested : ALL
  const sourceChoices = useMemo(() => sourceOptions(list), [list])
  const requestedSource = params.get('source')
  const source = requestedSource && sourceChoices.some(o => o.value === requestedSource) ? requestedSource : ALL
  const madeCount = list.filter(m => Boolean(state.made[m.id])).length
  const shown = list.filter(m =>
    (status === 'all' || (status === 'made' ? Boolean(state.made[m.id]) : !state.made[m.id])) &&
    (category === ALL || m.categories.includes(category)) &&
    (source === ALL || m.source === source))
  const filtering = status !== 'all' || category !== ALL || source !== ALL
  const showAll = () => setParams({}, { replace: true })

  return <div className={page.page}>
    <PageHeader title="マイライブラリ" sub={`つくった ${madeCount} こ`} />
    <p className={page.note}>おきにいりと つくった さくひんが、ここに ならぶよ。</p>
    {list.length > 0 && <FilterPanel>
      {/* 「ぜんぶ」が 2 列に並ぶので、どちらの列かを見出しで分ける */}
      <FilterGroup legend="つくったかどうか">
        <StatusChips label="つくったかどうかで しぼる" options={STATUSES} value={status} onChange={value => update('status', value === 'all' ? null : value)} />
      </FilterGroup>
      {/* なかまが 1 つしか無ければ、しぼっても同じ一覧になるので出さない */}
      {categoryChoices.length > 2 && <FilterGroup legend="なかま">
        <StatusChips label="なかまで しぼる" options={categoryChoices} value={category} onChange={value => update('nakama', value === ALL ? null : value)} wrap />
      </FilterGroup>}
      {sourceChoices.length > 2 && <FilterGroup legend="どこの さくひん">
        <StatusChips label="どこの さくひんかで しぼる" options={sourceChoices} value={source} onChange={value => update('source', value === ALL ? null : value)} wrap />
      </FilterGroup>}
      <FilterResult hitCount={shown.length} totalCount={list.length} filtering={filtering} onReset={showAll} />
    </FilterPanel>}
    <ModelGrid models={shown} favoriteButton={false} paged={false} empty={list.length === 0 ?
      <EmptyState title="まだ さくひんが ありません" hint="きになる さくひんに ★ をつけたり、「つくった！」を きろくすると、ここに たまります。" action={<Link to="/" className={page.linkButton}>さくひんを さがす</Link>} /> :
      <EmptyState
        title={status === 'notMade' ? 'ここにある さくひんは ぜんぶ つくったね！' : status === 'made' ? 'つくった きろくは まだ ありません' : 'あてはまる さくひんが ありません'}
        hint={status === 'notMade' ? 'あたらしい さくひんを さがしてみよう。' : status === 'made' ? 'つくれたら、さくひんの ページで「つくった！」を おしてね。' : 'なかまと どこの さくひんの くみあわせを かえてみてね。'}
        action={<button type="button" className={page.linkButton} onClick={showAll}>マイライブラリを ぜんぶ みる</button>}
      />
    } />
  </div>
}
