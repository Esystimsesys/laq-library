import { defineConfig } from 'vitest/config'

// アプリのビルド設定（vite.config.ts）には PWA プラグインが入っていて
// テストには不要なので、テストは独立した設定で動かす。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
})
