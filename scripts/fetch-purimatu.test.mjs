import { afterEach, describe, expect, it } from 'vitest'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const fixtures = []

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

/** 実際の CLI を隔離したキャッシュで動かし、リポジトリの生成物には触れない。 */
async function runFixture({ count, withoutImages = false }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'laq-purimatu-test-'))
  fixtures.push(dir)
  const cacheDir = path.join(dir, '.cache/purimatu')
  const outputDir = path.join(dir, 'src/data/sources')
  await Promise.all([cacheDir, outputDir, path.join(dir, 'scripts')].map((d) => mkdir(d, { recursive: true })))
  await symlink(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'dir')
  const script = path.join(dir, 'scripts/fetch-purimatu.mjs')
  await copyFile(path.join(ROOT, 'scripts/fetch-purimatu.mjs'), script)
  const output = path.join(outputDir, 'purimatu.json')
  const previous = JSON.stringify({ models: [{ id: 'purimatu:old', title: '以前の作品' }] })
  await writeFile(output, previous)
  const posts = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    slug: `model-${i}`,
    link: `https://purimatu.com/model-${i}/`,
    title: { rendered: `LaQ(ラキュー)でピカチュウ${i}の作り方` },
    excerpt: { rendered: 'ピカチュウの作り方です。' },
    content: { rendered: 'むずかしさ：★★' },
    featured_media: i + 1,
  }))
  const total = Math.max(1, Math.ceil(posts.length / 100))
  for (let page = 1; page <= total; page++) {
    await writeFile(path.join(cacheDir, `posts-p${page}.json`), JSON.stringify({
      total, body: posts.slice((page - 1) * 100, page * 100),
    }))
  }
  await writeFile(path.join(cacheDir, 'media.json'), JSON.stringify(Object.fromEntries(
    posts.map((p) => [p.featured_media, {
      url: withoutImages ? null : `https://purimatu.com/${p.slug}.jpg`, at: Date.now(),
    }]),
  )))
  // キャッシュ漏れがあっても外部サイトにアクセスしない。
  const guard = path.join(dir, 'no-network.mjs')
  await writeFile(guard, 'globalThis.fetch = () => { throw new Error("unexpected network request") }')
  const result = spawnSync(process.execPath, ['--import', guard, script], { encoding: 'utf8' })
  return { result, previous, saved: await readFile(output, 'utf8'), files: await readdir(outputDir) }
}

describe('ぷりまつ取り込みの保存', () => {
  it.each([
    { count: 0 },
    { count: 1 },
    { count: 1000, withoutImages: true },
  ])('検証に失敗したら既存データを保持する: %j', async (options) => {
    const { result, previous, saved, files } = await runFixture(options)
    expect(result.status, result.stderr).toBe(1)
    expect(result.stderr).toContain('既存データを保持しました')
    expect(saved).toBe(previous)
    expect(files).toEqual(['purimatu.json'])
  })

  it('検証に成功したら全作品を保存し、一時ファイルを残さない', async () => {
    const { result, saved, files } = await runFixture({ count: 1000 })
    expect(result.status, result.stderr).toBe(0)
    const data = JSON.parse(saved)
    expect(data.models).toHaveLength(1000)
    expect(data.models[0]).toMatchObject({ id: 'purimatu:model-0', title: 'ピカチュウ0', level: 'intermediate' })
    expect(data.models.at(-1).id).toBe('purimatu:model-999')
    expect(files).toEqual(['purimatu.json'])
  })
})
