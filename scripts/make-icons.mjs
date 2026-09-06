// アプリのアイコンを作る。LaQ の四角パーツと三角パーツを組んだ形にしている。
// PNG 変換ツールを増やしたくないので、Python(Pillow) で描く。
// 使うとき: node scripts/make-icons.mjs
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
execFileSync('python3', [path.join(root, 'scripts/make_icons.py')], {
  cwd: root,
  stdio: 'inherit',
})
