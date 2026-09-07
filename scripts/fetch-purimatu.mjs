#!/usr/bin/env node
// ぷりまつラボ（https://purimatu.com/）の「LaQでポケモンの作り方」記事を取り込み、
// src/data/sources/purimatu.json を生成する。
//
// 記事ページを 1 件ずつ読むと 1200 回以上のアクセスになるので、WordPress の
// REST API を使う。per_page=100 なら 13 リクエストで全記事の本文まで取れる。
// 個人ブログなので、この差は大きい。
//
// 完成写真は記事のアイキャッチ（featured_media）を使う。本文の 1 枚目は
// 「つくるパーツ」＝バラしたパーツを並べた写真なので、完成形にならない。
// アイキャッチの URL は media API でまとめて引く（100 件ずつ）。
//
// 画像は公式ソースと同じく URL を控えるだけで、ファイルは複製しない。
//
//   node scripts/fetch-purimatu.mjs           キャッシュ（30日以内）を使って再生成
//   node scripts/fetch-purimatu.mjs --refresh キャッシュを無視して取り直す

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cheerio from 'cheerio'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = path.join(ROOT, '.cache/purimatu')
const OUT_FILE = path.join(ROOT, 'src/data/sources/purimatu.json')

const API = 'https://purimatu.com/wp-json/wp/v2/posts'
const MEDIA_API = 'https://purimatu.com/wp-json/wp/v2/media'
const PER_PAGE = 100
const SOURCE_ID = 'purimatu'
const SOURCE_LABEL = 'ぷりまつラボ'
/** 一覧のカードに出す短い呼び方 */
const SHORT_LABEL = 'ぷりまつ'
const RIGHTS_HOLDER = 'ぷりまつラボ'
const SOURCE_LINK_LABEL = 'ぷりまつラボの ページ'
const SITE_URL = 'https://purimatu.com/'
const CATEGORY = 'ポケモン'
/**
 * このブログは本文に「むずかしさ：★★★」と書いている。★の数を、公式ギャラリーと
 * 同じ 3 段階に寄せる。★4 は数が少ない（25 件）ので、いちばん上と同じ扱いにする。
 */
const LEVEL_BY_STARS = {
  1: 'beginner',
  2: 'intermediate',
  3: 'advanced',
  4: 'advanced',
}
const USER_AGENT =
  'laq-library/0.1 (personal, non-commercial index; contact via github.com/Esystimsesys/laq-library)'
const DELAY_MS = 1000
const CACHE_MAX_AGE_DAYS = 30

const refresh = process.argv.includes('--refresh')

/**
 * 取り込む記事の見分け方。タイトルが「〜の作り方」で終わるものだけを作品として扱う。
 * このブログには商品レビューやまとめ記事も混ざっていて、それらは作り方ではない。
 * 表記は「作り方」「つくり方」「つくりかた」、綴りも LaQ / Laq が混在している
 * （時期によって違う）ので、大文字小文字は無視し、助詞も省略されうるものとして扱う。
 */
const HOWTO = '(?:作り方|つくり方|つくりかた)'
const TITLE_PATTERNS = [
  // ふつうはこの形:「LaQ(ラキュー)でピカチュウの作り方」
  new RegExp(`^LaQ.*?[でのを](.+?)の${HOWTO}`, 'i'),
  // まれに助詞が抜ける:「LaQ(ラキュー)ピカチュウの作り方②」
  new RegExp(`^LaQ[（(].*?[)）](.+?)の${HOWTO}`, 'i'),
]
/** まとめ記事は個別の作り方ではないので外す */
const EXCLUDE_TITLE = /まとめ|一覧|図鑑|とは|レビュー|口コミ|セット/

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** REST API を 1 回叩く。次を叩くまで DELAY_MS 待つ。 */
async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  const total = Number(res.headers.get('x-wp-totalpages') ?? 0)
  const body = await res.json()
  await sleep(DELAY_MS)
  return { total, body }
}

/** 取得済みで古くなっていなければキャッシュを使う。 */
async function loadCached(file, url) {
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

/**
 * 記事一覧の 1 ページぶん。
 * キャッシュのファイル名を `posts-p<n>` にしてあるのは、取ってくる項目
 * （_fields）を増やしたときに、項目の足りない古いキャッシュを読まないため。
 */
function loadPage(page) {
  const fields = 'id,slug,link,title,excerpt,content,featured_media'
  return loadCached(
    path.join(CACHE_DIR, `posts-p${page}.json`),
    `${API}?per_page=${PER_PAGE}&page=${page}&_fields=${fields}`,
  )
}

/**
 * media.json を読む。項目ごとの取得時刻を見て、古いものは無かったことにする。
 *
 * ファイルの更新時刻で期限を見ると、新しい ID を 1 つ足して書き直すたびに
 * 全体の期限が延びてしまい、古い URL や「引けなかった（null）」がいつまでも
 * 残りつづける。だからキャッシュの単位ごとに時刻を持たせる。
 */
async function readMediaCache(file) {
  let saved
  try {
    saved = JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return {}
  }
  const limit = Date.now() - CACHE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  const fresh = {}
  for (const [id, entry] of Object.entries(saved)) {
    // 取得時刻を持たない古い形式は、いつのものか分からないので捨てる
    if (entry && typeof entry === 'object' && entry.at > limit) fresh[id] = entry
  }
  return fresh
}

/**
 * アイキャッチ画像の URL を、添付 ID から引けるようにする。
 * 1 件ずつ引くと 1200 回になるので、100 件ずつまとめて取る（13 リクエスト）。
 * 原寸は 1 枚 200KB 前後あるので、一覧にも詳細にも十分な large（長辺 1024）を選ぶ。
 */
async function loadFeaturedImages(ids) {
  const file = path.join(CACHE_DIR, 'media.json')
  const cache = refresh ? {} : await readMediaCache(file)
  const missing = [...new Set(ids)].filter((id) => !(id in cache))
  for (let i = 0; i < missing.length; i += PER_PAGE) {
    const batch = missing.slice(i, i + PER_PAGE)
    process.stdout.write(`\r  アイキャッチ ${i + batch.length}/${missing.length} 件`)
    const url = `${MEDIA_API}?include=${batch.join(',')}&per_page=${PER_PAGE}&_fields=id,source_url,media_details`
    const { body } = await fetchJson(url)
    const at = Date.now()
    for (const m of body) {
      const source = m.media_details?.sizes?.large?.source_url ?? m.source_url ?? null
      cache[m.id] = { url: source, at }
    }
    // 引けなかった ID も覚えておく。覚えないと毎回引きにいくことになる
    for (const id of batch) if (!(id in cache)) cache[id] = { url: null, at }
    await writeFile(file, JSON.stringify(cache))
  }
  if (missing.length) process.stdout.write('\n')
  return Object.fromEntries(Object.entries(cache).map(([id, e]) => [id, e.url]))
}

function stripTags(html) {
  return cheerio.load(`<div>${html ?? ''}</div>`)('div').text().replace(/\s+/g, ' ').trim()
}

/** 本文の「むずかしさ：★★★」から難易度を読む。書いていない記事もある。 */
function levelOf(contentText) {
  const m = /むずかしさ[：:]\s*(★+)/.exec(contentText)
  return m ? (LEVEL_BY_STARS[m[1].length] ?? null) : null
}

/**
 * 説明文。抜粋は記事の頭をそのまま切っただけで、パーツの列挙まで入っていて長い。
 * 一覧と検索に効くのは最初の一文なので、そこまでにする。
 */
function shortDescription(excerptText) {
  const first = excerptText.split(/(?<=。)/)[0] ?? excerptText
  return first.replace(/\s*\[…\]\s*$/, '').trim()
}

/**
 * 作品名を取り出す。記事タイトルは
 * 「LaQ(ラキュー)でピカチュウの作り方」のように定型なので、飾りを落として名前だけにする。
 */
function modelName(title) {
  for (const pattern of TITLE_PATTERNS) {
    const m = pattern.exec(title)
    if (m) return m[1].trim()
  }
  return null
}

async function readPrevious() {
  try {
    return JSON.parse(await readFile(OUT_FILE, 'utf8'))
  } catch {
    return null
  }
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true })
  await mkdir(path.dirname(OUT_FILE), { recursive: true })

  const previous = await readPrevious()

  console.log(`記事一覧を取得: ${API}`)
  const first = await loadPage(1)
  const totalPages = first.total
  const posts = [...first.body]
  for (let page = 2; page <= totalPages; page++) {
    process.stdout.write(`\r  ${page}/${totalPages} ページ`)
    posts.push(...(await loadPage(page)).body)
  }
  process.stdout.write(`\r  ${posts.length} 記事                \n`)

  const works = posts.filter((post) => {
    const name = modelName(stripTags(post.title?.rendered))
    return name && !EXCLUDE_TITLE.test(name)
  })
  const featured = await loadFeaturedImages(works.map((p) => p.featured_media).filter(Boolean))

  const models = []
  const skipped = []
  // 「作り方の記事として拾ったが、完成写真が取れなかった」件数。
  // これを models に入れずに skipped へ混ぜてしまうと、抽出が全滅しても
  // 「作り方でない記事」と見分けがつかず、欠損に気づけない。
  let matchedButNoImage = 0

  for (const post of posts) {
    const title = stripTags(post.title?.rendered)
    const name = modelName(title)
    if (!name || EXCLUDE_TITLE.test(name)) {
      skipped.push(title)
      continue
    }

    const contentText = stripTags(post.content?.rendered)
    // 完成写真はアイキャッチ。本文の 1 枚目は「つくるパーツ」＝バラした
    // パーツを並べた写真で、その作品がどんな形になるのかは分からない。
    const photo = featured[post.featured_media] ?? null
    if (!photo) matchedButNoImage += 1

    models.push({
      id: `${SOURCE_ID}:${post.slug}`,
      source: SOURCE_ID,
      sourceUrl: post.link,
      title: name,
      description: shortDescription(stripTags(post.excerpt?.rendered)),
      level: levelOf(contentText),
      categories: [CATEGORY],
      thumbnail: photo,
      mainImage: photo,
      // 手順の写真は取り込まない。理由は 2 つある。
      // 1. このブログの手順は写真のあいだの日本語の説明とセットで意味を持つ。
      //    写真だけ 25 枚並べても読めないし、本文を持ってくるのは複製にあたる。
      // 2. 全 1220 件ぶんの URL を同梱すると JSON が 2.5MB になり、
      //    子どものスマホで最初に開くときの負担が大きい（完成写真だけなら 300KB）。
      // 詳しいつくり方は本家の記事へ送る。
      stepImages: [],
      pdfUrl: null,
    })
  }

  const payload = {
    source: SOURCE_ID,
    sourceLabel: SOURCE_LABEL,
    shortLabel: SHORT_LABEL,
    rightsHolder: RIGHTS_HOLDER,
    sourceLinkLabel: SOURCE_LINK_LABEL,
    sourceUrl: SITE_URL,
    fetchedAt: new Date().toISOString(),
    categoryOrder: [CATEGORY],
    models,
  }
  await writeFile(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`)
  console.log(`書き出し: ${path.relative(ROOT, OUT_FILE)}`)

  report(models, skipped, previous, matchedButNoImage)
}

function report(models, skipped, previous, matchedButNoImage) {
  console.log(`\n── 集計 ─────────────────────────`)
  console.log(`作品として取り込んだ: ${models.length}`)
  console.log(`作り方でないとして外した: ${skipped.length}`)
  const problems = []
  // 作り方の記事として拾えたもののうち、何割で完成写真が取れなかったか。
  // 写真が無くても作品としては出す（本家の記事へは飛べる）ので、models には入っている。
  // この 2 割というしきい値は src/data/data.test.ts の
  // 「完成写真は、ほとんどの作品にある」と同じ値。片方だけ変えない。
  console.log(`うち 完成写真（アイキャッチ）が無い: ${matchedButNoImage}`)
  if (models.length === 0) {
    problems.push('作り方の記事を 1 件も拾えていない（TITLE_PATTERNS を確認）')
  } else if (matchedButNoImage > models.length * 0.2) {
    problems.push(
      `完成写真が ${matchedButNoImage}/${models.length} 件で取れていない。` +
        'ブログの作りが変わった可能性がある（loadFeaturedImages を確認）',
    )
  }
  if (models.length > 0 && models.length < 1000) {
    problems.push(
      `取り込めたのが ${models.length} 件しかない（前は 1227 件）。` +
        'タイトルの取り出しが外れていないか確認',
    )
  }

  // 作品名に飾りが残っていたら、タイトルの取り出しが外れている
  const dirty = models.filter((m) => /ラキュー|^[（(]/.test(m.title))
  if (dirty.length > 0) {
    problems.push(
      `作品名に飾りが残っている ${dirty.length} 件（例: ${dirty
        .slice(0, 3)
        .map((m) => m.title)
        .join(' / ')}）。TITLE_PATTERNS を確認`,
    )
  }
  const byLevel = {}
  for (const m of models) byLevel[m.level ?? '(なし)'] = (byLevel[m.level ?? '(なし)'] ?? 0) + 1
  console.log(
    `むずかしさ: ${Object.entries(byLevel)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`,
  )

  console.log(`\n外したものの例:`)
  for (const t of skipped.slice(0, 10)) console.log(`  - ${t}`)
  if (skipped.length > 10) console.log(`  … 他 ${skipped.length - 10} 件`)

  if (previous) {
    const before = new Set(previous.models.map((m) => m.id))
    const after = new Set(models.map((m) => m.id))
    const added = models.filter((m) => !before.has(m.id))
    const removed = previous.models.filter((m) => !after.has(m.id))
    console.log(`\n── 前回との差分 ─────────────────`)
    console.log(`追加 ${added.length} / 削除 ${removed.length}`)
    for (const m of added.slice(0, 20)) console.log(`  + ${m.title}`)
    for (const m of removed.slice(0, 20)) console.log(`  - ${m.title}`)
  }

  if (problems.length) {
    console.log(`\n── 問題 ─────────────────────────`)
    for (const p of problems) console.log(`  ! ${p}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
