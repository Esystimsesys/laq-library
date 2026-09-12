import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages のプロジェクトページは https://<user>.github.io/laq-library/ に
// 配信されるため、ビルド時のパスをそのサブディレクトリに合わせる。
const base = process.env.GITHUB_PAGES === 'true' ? '/laq-library/' : '/'

// canonical・OGP・サイトマップに要る絶対URL。**このアプリのURLを決めるのはここだけ**。
// index.html の %SITE_URL% はこの値に置きかわり、scripts/build-sitemap.mjs は
// できあがった index.html の canonical を読んで同じ値を使う。
// 配信先を移すときは SITE_URL を渡すか、この既定値を書きかえる。
const siteUrl =
  process.env.SITE_URL ??
  (process.env.GITHUB_PAGES === 'true'
    ? 'https://esystimsesys.github.io/laq-library/'
    : 'http://localhost:5173/')

/** index.html の %SITE_URL% を配信先の絶対URLにする。末尾スラッシュ付きで渡す。 */
function siteUrlPlugin(url: string): Plugin {
  const withSlash = url.endsWith('/') ? url : `${url}/`
  return {
    name: 'laq-site-url',
    transformIndexHtml: (html) => html.split('%SITE_URL%').join(withSlash),
  }
}

export default defineConfig({
  base,
  plugins: [
    react(),
    siteUrlPlugin(siteUrl),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'LaQライブラリ',
        short_name: 'LaQライブラリ',
        description:
          'LaQ公式つくり方ギャラリーの作品をさがして、おきにいりと つくったきろく をのこせるずかん。',
        lang: 'ja',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fff6e5',
        theme_color: '#fff6e5',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The viewer runtime is shared, but each work's model data is downloaded
        // only after that work is opened.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // 検索エンジンの所有権確認ファイルは端末に置く意味がない
        // viewer と vendor は全作品共通。その他の assemblies 配下は作品別データなので
        // 作品数に比例して初回ダウンロードが増えないよう事前キャッシュしない。
        globIgnores: ['**/google*.html', '**/og.png', 'assemblies/!(viewer|vendor)/**'],
        // 画面遷移はすべてクライアント側で行うので、オフラインでは index.html を返す
        navigateFallback: `${base}index.html`,
        // The 3D viewer is a real HTML document, not a React route.
        navigateFallbackDenylist: [/\/assemblies\//],
        // Viewer query selects the JSON model; its static HTML is shared offline.
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^id$/, /^v$/, /^embedded$/],
        runtimeCaching: [
          {
            // Reimports can fix colors/poses without changing the progress revision.
            // Check for updates on opening; use the saved guide offline or on a slow network.
            urlPattern: ({ sameOrigin, url }) => sameOrigin && /\/assemblies\/[^/]+\/guide\.json$/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'laq-assembly-guides',
              networkTimeoutSeconds: 3,
              fetchOptions: { cache: 'no-cache' },
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // 作品の写真とつくり方の図は公式サイトのものをそのまま表示する。
            // 一度見たものは端末に残して、二度目からは通信なしで開けるようにする。
            urlPattern: /^https:\/\/www\.laq\.co\.jp\/.*\.(?:jpg|jpeg|png|gif)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'laq-images',
              // クロスオリジンの画像は opaque レスポンス（status 0）で返るため 0 を許す。
              // opaque では本当の HTTP ステータスが分からないので、404 が返っていても
              // 区別できずに残る。図が出ないときは fetch:gallery --refresh で取り直す。
              cacheableResponse: { statuses: [0, 200] },
              // 作品データが参照する画像は 943 件（サムネ + 完成写真 + 手順の図）。
              // 全作品を見て回っても古いものが押し出されないよう、少し余裕をもたせる。
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
})
