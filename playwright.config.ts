import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:4279/laq-library/',
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    /*
      iOS でだけ出る崩れ（フレックスの最小幅の決まり方が Blink と違う）を
      捕まえるための 1 つ。操作をともなう確認は chromium 側で見ているので、
      ここは画面の幅の検査だけ走らせて、CI の時間を増やしすぎない。
    */
    { name: 'webkit', use: { browserName: 'webkit' }, testMatch: /layout\.spec\.ts/ },
  ],
  webServer: {
    // preview 側にも GITHUB_PAGES=true が要る。付け忘れると base が '/' に戻り、
    // index.html が指す /laq-library/assets/*.js が 404 になって真っ白になる。
    command:
      'npm run build:pages && npm run preview:pages -- --host 127.0.0.1 --port 4279 --strictPort',
    url: 'http://127.0.0.1:4279/laq-library/',
  },
})
