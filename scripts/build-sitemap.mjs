#!/usr/bin/env node
/**
 * vite build のあとに走らせて dist/sitemap.xml を作る。
 *
 * ■ なぜ既定でトップページしか載せないか
 * いまの GitHub Pages 配信では、トップ以外の URL は **HTTP 404 を返す**
 * （dist/404.html のおかげで画面は出るが、ステータスは 404 のまま）。
 * Google は 404 を返す URL をインデックスしないので、作品ページを載せても
 * Search Console に「見つかりませんでした（404）」が 1,472 件並ぶだけになる。
 *
 * サブパスでも 200 を返せる配信（Cloudflare Pages の SPA フォールバックなど）や、
 * 作品ページを実HTMLとして書き出す作りに移したら SITEMAP_ALL=1 を付けて全件出す。
 *
 *   SITEMAP_ALL=1 npm run build:pages
 *
 * ■ URL の出どころ
 * ビルド済みの dist/index.html にある <link rel="canonical"> を読む。
 * サイトのURLを決めているのは vite.config.ts の siteUrl ひとつだけなので、
 * ここで同じ判定を書き写して食い違うのを避けている。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIST = join(ROOT, 'dist')

const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/)?.[1]
if (!canonical) {
  // ここで落ちるのは index.html から canonical が消えたとき。
  // 黙って相対URLのサイトマップを吐くと Google に丸ごと無視されるので、止める。
  console.error('dist/index.html に <link rel="canonical"> が無い。index.html を確認すること')
  process.exit(1)
}
const siteUrl = canonical.endsWith('/') ? canonical : `${canonical}/`

const sources = ['laq-official', 'purimatu'].map((name) =>
  JSON.parse(readFileSync(join(ROOT, 'src/data/sources', `${name}.json`), 'utf8')),
)

// 取り込んだ日のうち新しいほうを、サイト全体の更新日とする
const lastmod = sources
  .map((s) => s.fetchedAt)
  .filter(Boolean)
  .sort()
  .at(-1)
  ?.slice(0, 10)

const all = process.env.SITEMAP_ALL === '1'

/**
 * おきにいり・つくったきろく・せってい は端末ごとの中身で、他人が検索して
 * たどり着いても空の画面しか出ない。載せる意味がないので入れない。
 */
const urls = [{ loc: siteUrl, priority: '1.0' }]
if (all) {
  for (const source of sources) {
    for (const model of source.models) {
      // 一覧のリンク（ModelCard）と同じ組み立てにする。ずれるとサイトマップが 404 を指す
      urls.push({ loc: `${siteUrl}model/${encodeURIComponent(model.id)}`, priority: '0.7' })
    }
  }
}

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map(({ loc, priority }) =>
    [
      '  <url>',
      `    <loc>${escape(loc)}</loc>`,
      lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
      `    <priority>${priority}</priority>`,
      '  </url>',
    ]
      .filter(Boolean)
      .join('\n'),
  ),
  '</urlset>',
  '',
].join('\n')

writeFileSync(join(DIST, 'sitemap.xml'), xml)
console.log(
  `dist/sitemap.xml  ${urls.length} URL  (${all ? 'SITEMAP_ALL=1 全件' : 'トップのみ / 全件は SITEMAP_ALL=1'})`,
)
