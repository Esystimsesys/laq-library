#!/usr/bin/env node
// LaQ の作り方を載せている個人ブログ（WordPress）を取り込み、
// src/data/sources/<id>.json を生成する。ぷりまつラボと同じ考え方で、
//
// - 記事は WordPress の REST API でまとめて読む（1 サイト数リクエスト）
// - 完成写真は記事のアイキャッチ（featured_media）だけを URL で控える
// - 手順の写真・本文・動画は持たず、詳細画面から本家の記事へ送る
//
// サイトごとの違い（どの記事が作り方か、作品名の取り出し方、難易度の書き方）は
// SITES の parse に閉じこめる。サイトを足すときは SITES に 1 件足して、
// src/data/types.ts の SourceId と src/data/index.ts の SOURCE_FILES に足す。
//
//   node scripts/fetch-blogs.mjs                 全サイト（キャッシュ 30 日）
//   node scripts/fetch-blogs.mjs --site <id>     1 サイトだけ
//   node scripts/fetch-blogs.mjs --refresh       キャッシュを無視して取り直す

import { mkdir, readFile, stat, writeFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cheerio from 'cheerio'
import { CATEGORIES, OTHER, categorize } from './tag-rules.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PER_PAGE = 100
const USER_AGENT =
  'laq-library/0.1 (personal, non-commercial index; contact via github.com/Esystimsesys/laq-library)'
const DELAY_MS = 1000
const CACHE_MAX_AGE_DAYS = 30
const POKEMON = 'ポケモン'

const LEVEL_WORDS = {
  簡単: 'beginner',
  かんたん: 'beginner',
  普通: 'intermediate',
  ふつう: 'intermediate',
  難しい: 'advanced',
  むずかしい: 'advanced',
}

/** 作品名・説明文から なかま を決める。ポケモンはソース側で分かるので先に決める。 */
function categoriesOf(name, description, { pokemon = false, fallback } = {}) {
  if (pokemon) return [POKEMON]
  const found = categorize(name, description)
  if (found.includes(OTHER) && fallback) return [fallback]
  return found
}

export const SITES = [
  {
    id: 'laq-pokemon',
    api: 'https://laq-pokemon.com/wp-json/wp/v2/posts',
    sourceLabel: 'ラキューポケモン.com',
    shortLabel: 'ラキュポケ',
    rightsHolder: 'ラキューポケモン.com',
    sourceLinkLabel: 'ラキューポケモン.com の ページ',
    sourceUrl: 'https://laq-pokemon.com/',
    minCount: 200,
    // slug が日本語の URL エンコードで長いので、記事 URL と同じ投稿番号を ID にする
    idOf: (post) => String(post.id),
    /**
     * 記事タイトルは「0006G リザードン キョダイマックス Charizard G-Max」のように
     * 図鑑番号・日本語名・英語名の順。番号と英語名を落として日本語名だけにする。
     * 本文は YouTube の作り方動画とパーツ表で、動画の説明に【たねポケモン】［簡単］がある。
     */
    parse(post, text) {
      const title = stripTags(post.title?.rendered).normalize('NFKC')
      const m = /^\s*(\d{3,4})[A-Za-z]*\s+(.+?)\s+[A-Za-z][^぀-ヿ一-鿿]*$/.exec(title)
      if (!m) return null
      const name = m[2].replace(/\s+/g, ' ').trim()
      const kind = /【([^】]*ポケモン)】/.exec(text)?.[1]
      const levelWord = /[［[](簡単|普通|難しい)[］\]]/.exec(text)?.[1]
      const description = `${kind ? `${kind}、` : ''}${name}の つくりかた。どうがと パーツの かずが のっています（ずかん No.${m[1]}）。`
      return {
        title: name,
        description,
        level: LEVEL_WORDS[levelWord] ?? null,
        categories: [POKEMON],
      }
    },
  },
  {
    id: 'warabar',
    api: 'https://www.warabar-kids.com/wp-json/wp/v2/posts',
    // LaQ(ラキュー) カテゴリ。知育アプリなど他の話題の記事を読まない
    query: 'categories=2',
    sourceLabel: 'わらばあ',
    shortLabel: 'わらばあ',
    rightsHolder: 'わらばあ（子供と楽しむLaQと知育情報ブログ）',
    sourceLinkLabel: 'わらばあの ページ',
    sourceUrl: 'https://www.warabar-kids.com/',
    minCount: 25,
    /**
     * 「LaQ(ラキュー)でイーブイの作り方【人気のポケモン】」
     * 「LaQ(ラキュー)で恐竜「ティーレックス」の作り方」
     * 「LaQ(ラキュー)アラジンのジャスミン作り方」（の が無いこともある）
     */
    parse(post, text) {
      const title = stripTags(post.title?.rendered).normalize('NFKC')
      const m = /^LaQ\(ラキュー\)\s*で?\s*(.+?)の?(?:作り方|つくり方)(?:【(.+)】)?$/.exec(title)
      if (!m) return null
      let name = m[1].trim()
      const tag = m[2] ?? ''
      if (/本|まとめ|パーツ表/.test(name)) return null
      // 「恐竜「ティーレックス」」→ 作品名は かぎかっこの中、外側は説明へまわす
      let group = ''
      const quoted = /^(.*?)「(.+)」$/.exec(name)
      if (quoted) {
        group = quoted[1]
        name = quoted[2]
      }
      // 「新幹線(しんかんせん)」のよみがなは、検索に効くよう説明へまわす
      const reading = /^(.+?)\((.+)\)$/.exec(name)
      if (reading) name = reading[1]
      const intro = /本記事では\s*([^。]+。)/.exec(text)?.[1]?.replace(/\s+/g, '') ?? ''
      const description = [group, reading?.[2], tag, intro].filter(Boolean).join(' ')
      const pokemon = /ポケモン|ポケットモンスター/.test(`${tag} ${intro}`)
      // 辞書で決まらず、キャラクターでもないもの
      if (name === 'ハート') return { title: name, description, level: null, categories: ['こもの・アクセサリー'] }
      return {
        title: name,
        description,
        level: null,
        categories: categoriesOf(name, description, {
          pokemon,
          fallback: 'キャラクター・くうそう',
        }),
      }
    },
  },
  {
    id: 'chiiku365',
    // 作り方の記事は 投稿 ではなく「laq」という独自の投稿タイプに入っている
    api: 'https://365chiiku.com/wp-json/wp/v2/laq',
    sourceLabel: '365日の知育・学習プリント',
    shortLabel: '365ちいく',
    rightsHolder: '365日の知育・学習プリント',
    sourceLinkLabel: '365日の知育の ページ',
    sourceUrl: 'https://365chiiku.com/',
    minCount: 5,
    /** 「【LaQ昆虫】カブトムシの作り方（普通・立体モデル）」。完成写真とパーツ表の記事 */
    parse(post, text) {
      const title = stripTags(post.title?.rendered).normalize('NFKC')
      const m = /^【LaQ(.+?)】(.+?)の(?:作り方|つくり方)(?:\((.+)\))?$/.exec(title)
      if (!m) return null
      const [, group, name, note = ''] = m
      const levelWord = /(簡単|普通|難しい)/.exec(note)?.[1]
      const intro = text.split(/(?<=[。！!])/)[0]?.trim() ?? ''
      const description = [group, note, intro].filter(Boolean).join(' ')
      return {
        title: name.trim(),
        description,
        level: LEVEL_WORDS[levelWord] ?? null,
        categories: categoriesOf(name, `${group} ${intro}`, {
          pokemon: group === POKEMON,
          // 「両生類」「キオビヤドクガエル」は辞書の語（かえる）に当たらない
          fallback: 'どうぶつ',
        }),
      }
    },
  },
]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function stripTags(html) {
  const $ = cheerio.load(`<div>${html ?? ''}</div>`)
  // 吹き出しプラグインなどが本文に style を書き込むので、文字にする前に捨てる
  $('style, script').remove()
  return $('div').text().replace(/\s+/g, ' ').trim()
}

/**
 * REST API を 1 回叩く。次を叩くまで DELAY_MS 待つ。
 * PHP の警告が JSON の前に混ざって返るサイトがある（わらばあ）ので、
 * 本文の先頭の [ か { から読む。
 */
async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  const totalPages = Number(res.headers.get('x-wp-totalpages') ?? 0)
  const raw = await res.text()
  const start = raw.search(/[[{]/)
  if (start < 0) throw new Error(`JSON ではない応答: ${url}`)
  const body = JSON.parse(raw.slice(start))
  await sleep(DELAY_MS)
  return { totalPages, body }
}

async function loadCached(file, url, refresh) {
  if (!refresh) {
    try {
      const { mtimeMs } = await stat(file)
      const ageDays = (Date.now() - mtimeMs) / (1000 * 60 * 60 * 24)
      if (ageDays < CACHE_MAX_AGE_DAYS) return JSON.parse(await readFile(file, 'utf8'))
    } catch {
      // キャッシュが無い
    }
  }
  const result = await fetchJson(url)
  await writeFile(file, JSON.stringify(result))
  return result
}

async function loadPosts(site, cacheDir, refresh) {
  const fields = 'id,slug,link,title,content,featured_media'
  const extra = site.query ? `&${site.query}` : ''
  const page = (n) =>
    loadCached(
      path.join(cacheDir, `posts-p${n}.json`),
      `${site.api}?per_page=${PER_PAGE}&page=${n}${extra}&_fields=${fields}`,
      refresh,
    )
  const first = await page(1)
  const posts = [...first.body]
  for (let n = 2; n <= first.totalPages; n++) posts.push(...(await page(n)).body)
  return posts
}

/** アイキャッチの URL を 100 件ずつまとめて引く。一覧にも詳細にも足りる large を選ぶ。 */
async function loadFeaturedImages(site, ids, cacheDir, refresh) {
  const mediaApi = site.api.replace(/\/[^/]+$/, '/media')
  const file = path.join(cacheDir, 'media.json')
  let cache = {}
  if (!refresh) {
    try {
      const saved = JSON.parse(await readFile(file, 'utf8'))
      const limit = Date.now() - CACHE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
      for (const [id, entry] of Object.entries(saved)) if (entry?.at > limit) cache[id] = entry
    } catch {
      cache = {}
    }
  }
  const missing = [...new Set(ids)].filter((id) => !(id in cache))
  for (let i = 0; i < missing.length; i += PER_PAGE) {
    const batch = missing.slice(i, i + PER_PAGE)
    const url = `${mediaApi}?include=${batch.join(',')}&per_page=${PER_PAGE}&_fields=id,source_url,media_details`
    const { body } = await fetchJson(url)
    const at = Date.now()
    for (const m of body) {
      const sizes = m.media_details?.sizes ?? {}
      const source = sizes.large?.source_url ?? sizes.medium_large?.source_url ?? m.source_url ?? null
      cache[m.id] = { url: source, at }
    }
    for (const id of batch) if (!(id in cache)) cache[id] = { url: null, at }
    await writeFile(file, JSON.stringify(cache))
  }
  return Object.fromEntries(Object.entries(cache).map(([id, e]) => [id, e.url]))
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

/** 取り込んだ記事を Model にそろえる。ネットワークを使わないので単体テストできる。 */
export function toModels(site, posts, featured) {
  const models = []
  const skipped = []
  const seen = new Set()
  for (const post of posts) {
    const text = stripTags(post.content?.rendered)
    const parsed = site.parse(post, text)
    if (!parsed) {
      skipped.push(stripTags(post.title?.rendered))
      continue
    }
    const id = `${site.id}:${site.idOf ? site.idOf(post) : post.slug}`
    if (seen.has(id)) continue
    seen.add(id)
    const photo = featured[post.featured_media] ?? null
    models.push({
      id,
      source: site.id,
      sourceUrl: post.link,
      ...parsed,
      thumbnail: photo,
      mainImage: photo,
      // 手順の写真・動画は取り込まない。本文の説明とセットで意味を持ち、
      // 持ってくると複製になる。つくり方は本家の記事で見てもらう。
      stepImages: [],
      pdfUrl: null,
    })
  }
  return { models, skipped }
}

function validate(site, models, skipped, previous) {
  const problems = []
  const noPhoto = models.filter((m) => !m.thumbnail).length
  const byLevel = {}
  for (const m of models) byLevel[m.level ?? '(なし)'] = (byLevel[m.level ?? '(なし)'] ?? 0) + 1
  console.log(`  作品: ${models.length} / 外した記事: ${skipped.length} / 写真なし: ${noPhoto}`)
  console.log(`  むずかしさ: ${Object.entries(byLevel).map(([k, v]) => `${k}=${v}`).join(' ')}`)
  for (const t of skipped.slice(0, 8)) console.log(`    - ${t}`)
  if (skipped.length > 8) console.log(`    … 他 ${skipped.length - 8} 件`)

  if (models.length < site.minCount) {
    problems.push(`取り込めたのが ${models.length} 件しかない（${site.minCount} 件以上のはず）。parse を確認`)
  }
  if (noPhoto > models.length * 0.2) problems.push(`完成写真が ${noPhoto}/${models.length} 件で取れていない`)
  const dirty = models.filter((m) => /ラキュー|LaQ|作り方|^[（(【]/.test(m.title))
  if (dirty.length) problems.push(`作品名に飾りが残っている: ${dirty.slice(0, 3).map((m) => m.title).join(' / ')}`)
  const other = models.filter((m) => m.categories.includes(OTHER))
  if (other.length) problems.push(`なかまを決められない: ${other.map((m) => m.title).join(' / ')}`)
  const host = new URL(site.sourceUrl).host
  const foreign = models.filter((m) => m.thumbnail && new URL(m.thumbnail).host !== host)
  if (foreign.length) problems.push(`写真が出典と別のホストにある: ${foreign[0].thumbnail}`)

  if (previous) {
    const before = new Set(previous.models.map((m) => m.id))
    const after = new Set(models.map((m) => m.id))
    const added = models.filter((m) => !before.has(m.id))
    const removed = previous.models.filter((m) => !after.has(m.id))
    console.log(`  前回との差分: 追加 ${added.length} / 削除 ${removed.length}`)
    for (const m of added.slice(0, 10)) console.log(`    + ${m.title}`)
    for (const m of removed.slice(0, 10)) console.log(`    - ${m.title}`)
  }
  return problems
}

async function fetchSite(site, refresh) {
  const cacheDir = path.join(ROOT, '.cache', site.id)
  const outFile = path.join(ROOT, 'src/data/sources', `${site.id}.json`)
  await mkdir(cacheDir, { recursive: true })
  console.log(`\n■ ${site.sourceLabel}（${site.api}）`)

  const posts = await loadPosts(site, cacheDir, refresh)
  const candidates = posts.filter((p) => site.parse(p, '') && p.featured_media)
  const featured = await loadFeaturedImages(
    site,
    candidates.map((p) => p.featured_media),
    cacheDir,
    refresh,
  )
  const { models, skipped } = toModels(site, posts, featured)
  const previous = await readJson(outFile)
  const problems = validate(site, models, skipped, previous)
  if (problems.length) {
    for (const p of problems) console.log(`  ! ${p}`)
    throw new Error(`${site.id}: 検証に失敗したため既存データを保持しました。`)
  }

  const used = new Set(models.flatMap((m) => m.categories))
  const payload = {
    source: site.id,
    sourceLabel: site.sourceLabel,
    shortLabel: site.shortLabel,
    rightsHolder: site.rightsHolder,
    sourceLinkLabel: site.sourceLinkLabel,
    sourceUrl: site.sourceUrl,
    fetchedAt: new Date().toISOString(),
    categoryOrder: [POKEMON, ...CATEGORIES].filter((c) => used.has(c)),
    models,
  }
  const temporaryFile = `${outFile}.${process.pid}.tmp`
  try {
    await writeFile(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`)
    await rename(temporaryFile, outFile)
  } finally {
    await rm(temporaryFile, { force: true })
  }
  console.log(`  書き出し: ${path.relative(ROOT, outFile)}`)
}

async function main() {
  const refresh = process.argv.includes('--refresh')
  const only = process.argv.includes('--site') ? process.argv[process.argv.indexOf('--site') + 1] : null
  const targets = only ? SITES.filter((s) => s.id === only) : SITES
  if (targets.length === 0) throw new Error(`知らないサイトです: ${only}（${SITES.map((s) => s.id).join(', ')}）`)
  let failed = 0
  for (const site of targets) {
    try {
      await fetchSite(site, refresh)
    } catch (err) {
      failed += 1
      console.error(err instanceof Error ? err.message : err)
    }
  }
  if (failed) process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
