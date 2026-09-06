#!/usr/bin/env node
// LaQ 公式「つくり方ギャラリー」から作品データを取り込み、
// src/data/sources/laq-official.json を生成する。
//
// 画像と PDF は URL を控えるだけで、ファイルは複製しない（表示時に公式サイトを参照する）。
// 詳細ページは直列 + ウェイトで取得し、一度読んだ HTML は .cache/html/ に残して
// 再実行時の負荷をかけない。
//
//   node scripts/fetch-gallery.mjs           キャッシュ（30日以内）を使って再生成
//   node scripts/fetch-gallery.mjs --refresh キャッシュを無視して全部取り直す

import { mkdir, readFile, stat, writeFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as cheerio from 'cheerio'
import { categorize, CATEGORIES, OTHER } from './tag-rules.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = path.join(ROOT, '.cache/html')
const OUT_FILE = path.join(ROOT, 'src/data/sources/laq-official.json')

const INDEX_URL = 'https://www.laq.co.jp/assets/json/gallery.json'
const SOURCE_ID = 'laq-official'
const SOURCE_LABEL = 'LaQ公式 つくり方ギャラリー'
/** 画像・図・PDF の権利者。画面の出典表記に出す */
const RIGHTS_HOLDER = 'ヨシリツ株式会社'
/** 作品ページへ飛ぶボタンの文言 */
const SOURCE_LINK_LABEL = 'LaQ公式のページ'
const USER_AGENT =
  'laq-library/0.1 (personal, non-commercial index of the official gallery)'
const DELAY_MS = 300
/**
 * キャッシュした HTML をそのまま使ってよい日数。
 * 公式は同じ作品 ID のまま説明文や画像を差し替えることがあるので、
 * 古くなったものは黙って使い続けず、取り直す。
 */
const CACHE_MAX_AGE_DAYS = 30

const refresh = process.argv.includes('--refresh')

/** 構造が変わったと判断する欠損の割合。これを超えたらセレクタを疑う */
const BROKEN_RATIO = 0.2

const LEVEL_BY_CODE = {
  137: 'beginner',
  138: 'intermediate',
  139: 'advanced',
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchText(url, fetchImpl = fetch) {
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.text()
}

/** 詳細ページの HTML。取得済みで、まだ古くなっていなければキャッシュから返す。 */
async function loadDetailHtml(id, url, options) {
  const file = path.join(options.cacheDir, `${id}.html`)
  if (!options.refresh) {
    try {
      const { mtimeMs } = await stat(file)
      const ageDays = (Date.now() - mtimeMs) / (1000 * 60 * 60 * 24)
      if (ageDays < CACHE_MAX_AGE_DAYS) return readFile(file, 'utf8')
    } catch {
      // キャッシュが無い。取りに行く
    }
  }
  const html = await fetchText(url, options.fetchImpl)
  await writeFile(file, html)
  await sleep(options.delayMs)
  return html
}

/**
 * 2x 用のサムネイル URL（-thumb-390x390-*.jpg）を優先して使う。
 * 一覧を高精細な画面で見たときに、128px 版だと目に見えて粗い。
 */
function pickThumbnail(entry) {
  return entry.thumbnail3x || entry.thumbnail || null
}

function parseDetail(html) {
  const $ = cheerio.load(html)

  const description = $('.gallery-detail__txt').text().trim()

  const mainImage = $('.gallery-detail__image img').attr('src')?.trim() || null

  const stepImages = $('.gallery-detail__howto__image img')
    .map((_, el) => $(el).attr('src')?.trim())
    .get()
    .filter(Boolean)

  const pdfUrl =
    $('.gallery-detail__howto__pdf a[href$=".pdf"]').attr('href')?.trim() || null

  return { description, mainImage, stepImages, pdfUrl }
}

async function readPrevious(outFile) {
  try {
    return JSON.parse(await readFile(outFile, 'utf8'))
  } catch {
    return null
  }
}

export async function main({
  outFile = OUT_FILE,
  cacheDir = CACHE_DIR,
  fetchImpl = fetch,
  refresh: forceRefresh = refresh,
  delayMs = DELAY_MS,
} = {}) {
  const options = { cacheDir, fetchImpl, refresh: forceRefresh, delayMs }
  await mkdir(cacheDir, { recursive: true })
  await mkdir(path.dirname(outFile), { recursive: true })

  const previous = await readPrevious(outFile)

  console.log(`一覧を取得: ${INDEX_URL}`)
  const index = JSON.parse(await fetchText(INDEX_URL, fetchImpl))
  validateIndex(index)
  console.log(`  ${index.length} 件`)

  const models = []
  const problems = []

  for (const [i, entry] of index.entries()) {
    const paddedId = String(entry.id).padStart(6, '0')
    process.stdout.write(
      `\r詳細を取得: ${i + 1}/${index.length} (${entry.title})          `,
    )

    let detail
    try {
      detail = parseDetail(await loadDetailHtml(paddedId, entry.permalink, options))
    } catch (err) {
      problems.push(`${paddedId} ${entry.title}: 取得失敗 ${err.message}`)
      detail = { description: '', mainImage: null, stepImages: [], pdfUrl: null }
    }

    const levelCode = Number(entry.level_code?.[0])
    const title = String(entry.title ?? '').trim()
    // exp（一覧の説明文）は空のことがあるので、詳細ページ側の本文で補う
    const description = String(entry.exp ?? '').trim() || detail.description

    models.push({
      id: `${SOURCE_ID}:${paddedId}`,
      source: SOURCE_ID,
      sourceUrl: entry.permalink,
      title,
      description,
      level: LEVEL_BY_CODE[levelCode] ?? null,
      categories: categorize(title, description),
      thumbnail: pickThumbnail(entry),
      mainImage: detail.mainImage,
      stepImages: detail.stepImages,
      pdfUrl: detail.pdfUrl,
    })
  }
  process.stdout.write('\n')

  checkSelectors(models, problems)

  report(models, previous, problems)
  if (problems.length > 0) {
    throw new Error('取得・検証に失敗したため既存データを保持しました。')
  }

  const payload = {
    source: SOURCE_ID,
    sourceLabel: SOURCE_LABEL,
    rightsHolder: RIGHTS_HOLDER,
    sourceLinkLabel: SOURCE_LINK_LABEL,
    sourceUrl: 'https://www.laq.co.jp/gallery/',
    fetchedAt: new Date().toISOString(),
    // 画面のカテゴリチップをこの順に並べる
    categoryOrder: [...CATEGORIES, OTHER],
    models,
  }
  const temporaryFile = `${outFile}.${process.pid}.tmp`
  try {
    await writeFile(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`)
    await rename(temporaryFile, outFile)
  } finally {
    await rm(temporaryFile, { force: true })
  }
  console.log(`\n書き出し: ${path.relative(ROOT, outFile)}`)
}


/** 空・不正な一覧を正常な同期結果として保存しない。 */
function validateIndex(index) {
  if (!Array.isArray(index) || index.length === 0) {
    throw new Error('一覧が空か、配列ではありません。既存データを保持しました。')
  }
  const ids = new Set()
  for (const entry of index) {
    if (!entry || !/^\d+$/.test(String(entry.id)) ||
      typeof entry.title !== 'string' || !entry.title.trim() ||
      typeof entry.permalink !== 'string') {
      throw new Error('一覧に不正な作品があります。既存データを保持しました。')
    }
    const url = new URL(entry.permalink)
    if (url.protocol !== 'https:' || url.hostname !== 'www.laq.co.jp') {
      throw new Error(`公式サイト以外の作品 URL: ${entry.permalink}`)
    }
    const id = String(entry.id).padStart(6, '0')
    if (ids.has(id)) throw new Error(`作品 ID が重複しています: ${id}`)
    ids.add(id)
  }
}

/**
 * cheerio はセレクタが 1 件も当たらなくてもエラーにならないので、
 * 公式の HTML 構造が変わると「全件が空データ」のまま静かに通ってしまう。
 * 欠損が多すぎるときはセレクタを疑うよう、ここで問題として立てる。
 */
function checkSelectors(models, problems) {
  const total = models.length
  const checks = [
    ['完成写真 (.gallery-detail__image img)', (m) => !m.mainImage],
    ['つくり方の図 (.gallery-detail__howto__image img)', (m) => m.stepImages.length === 0],
    ['PDF (.gallery-detail__howto__pdf a)', (m) => !m.pdfUrl],
  ]
  for (const [label, isMissing] of checks) {
    const missing = models.filter(isMissing).length
    if (missing > total * BROKEN_RATIO) {
      problems.push(
        `${label} が ${missing}/${total} 件で取れていない。` +
          '公式ページの構造が変わった可能性がある（parseDetail のセレクタを確認）',
      )
    }
  }
}

function report(models, previous, problems) {
  const count = (list, key) => {
    const map = new Map()
    for (const m of list) for (const v of [].concat(key(m))) {
      map.set(v, (map.get(v) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }

  console.log(`\n── 集計 ─────────────────────────`)
  console.log(`総数: ${models.length}`)
  console.log(
    `レベル: ${count(models, (m) => m.level ?? '(なし)')
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`,
  )
  console.log('カテゴリ:')
  const byCategory = new Map(count(models, (m) => m.categories))
  for (const c of [...CATEGORIES, 'その他']) {
    console.log(`  ${c.padEnd(12, '　')} ${byCategory.get(c) ?? 0}`)
  }

  console.log(`\n── 欠損 ─────────────────────────`)
  const missing = (label, fn) => {
    const hits = models.filter(fn)
    console.log(`${label}: ${hits.length}`)
    for (const m of hits.slice(0, 20)) console.log(`  - ${m.id} ${m.title}`)
    if (hits.length > 20) console.log(`  … 他 ${hits.length - 20} 件`)
  }
  missing('title なし', (m) => !m.title)
  missing('thumbnail なし', (m) => !m.thumbnail)
  missing('sourceUrl なし', (m) => !m.sourceUrl)
  missing('手順画像なし', (m) => m.stepImages.length === 0)
  missing('PDF なし', (m) => !m.pdfUrl)

  const other = models.filter((m) => m.categories.includes('その他'))
  if (other.length) {
    console.log(`\n── 「その他」に落ちた作品（辞書を足す候補） ──`)
    console.log(other.map((m) => m.title).join(' / '))
  }

  if (previous) {
    const before = new Set(previous.models.map((m) => m.id))
    const after = new Set(models.map((m) => m.id))
    const added = models.filter((m) => !before.has(m.id))
    const removed = previous.models.filter((m) => !after.has(m.id))
    console.log(`\n── 前回との差分 ─────────────────`)
    console.log(`追加 ${added.length} / 削除 ${removed.length}`)
    for (const m of added) console.log(`  + ${m.title}`)
    for (const m of removed) console.log(`  - ${m.title}`)
  }

  if (problems.length) {
    console.log(`\n── 取得エラー ───────────────────`)
    for (const p of problems) console.log(`  ! ${p}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
