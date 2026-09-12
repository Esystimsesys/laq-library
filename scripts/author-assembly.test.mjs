import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { exportWorkspace, guideDigest, initWorkspace, readWorkspace, safeWorkspaceFile, validateAuthorGuide, validateManifest, validateReview, validateWorkspace } from './author-assembly.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixture = path.join(root, 'public/assemblies/metamon/guide.json')
const temporary = []
const put = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
const read = file => JSON.parse(readFileSync(file, 'utf8'))
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function setup({ seeded = true, photos = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'laq-author-')); temporary.push(dir)
  const photo = path.join(dir, 'front.jpg'); writeFileSync(photo, 'local reference photo bytes')
  const options = { slug: 'sample-model', modelId: 'purimatu:sample', title: '試作', article: 'https://example.com/sample/', workspace: path.join(dir, 'work'), photos: photos ? [photo] : [], ...(seeded ? { fromGuide: fixture } : {}) }
  initWorkspace(options)
  return { dir, ...options }
}
function approve(workspace) {
  const { review, guideSha256 } = readWorkspace({ workspace })
  Object.assign(review, { status: 'reviewed', reviewer: 'Human reviewer', reviewedAt: '2026-09-11T01:00:00Z', guideSha256, notes: '写真照合済み。隠れた接続は推測、実物組み立ては未確認。' })
  review.unresolved[0].status = 'resolved'
  put(path.join(workspace, 'review.json'), review)
}

describe('local assembly authoring', () => {
  it('creates an incomplete draft, preserves photos privately and supplies AI handoff instructions', () => {
    const { workspace, photos } = setup({ seeded: false })
    const draft = readWorkspace({ workspace })
    expect(draft.manifest).toMatchObject({ slug: 'sample-model', units: { edgeMm: 17, thicknessMm: 3.5 }, photos: [{ id: 'photo-1', originalPath: realpathSync(photos[0]), path: 'photos/photo-1.jpg' }] })
    expect(readFileSync(safeWorkspaceFile(workspace, draft.manifest.photos[0].path), 'utf8')).toBe('local reference photo bytes')
    expect(draft.review.status).toBe('draft')
    expect(draft.guide).not.toHaveProperty('notice')
    expect(readFileSync(path.join(workspace, 'AI-PROMPT.md'), 'utf8')).toContain('見えない面や接続を観測済みと書かない')
    expect(() => validateWorkspace({ workspace })).toThrow(/model.pieces/)
  })

  it('validates a structurally complete draft without claiming human or physical review', () => {
    const { workspace } = setup()
    const data = validateWorkspace({ workspace })
    expect(data.variant.model.pieces).toHaveLength(53)
    expect(data.review.physicalCheck).toBe('not-performed')
    expect(() => exportWorkspace({ workspace })).toThrow(/human reviewed/)
    expect(existsSync(path.join(workspace, 'export'))).toBe(false)
  })

  it('exports unchanged guide bytes, reading metadata, evidence, history and photos as private sidecars', () => {
    const { workspace } = setup()
    const data = readWorkspace({ workspace })
    data.manifest.extra = { referenceNote: 'Private metadata stays in sidecar' }
    data.manifest.photos[0].view = 'front'
    data.manifest.photos[0].evidence = '正面の輪郭'
    put(path.join(workspace, 'manifest.json'), data.manifest)
    data.review.evidence.push({ id: 'e1', photoId: 'photo-1', pieceIds: [data.guide.variants[data.guide.defaultVariant].model.pieces[0].id], observation: '三角が見える', interpretation: '奥行きは推測', confidence: 'inferred' })
    put(path.join(workspace, 'review.json'), data.review)
    put(path.join(workspace, 'changes.json'), [{ change: 'review only' }])
    approve(workspace)
    const result = exportWorkspace({ workspace })
    expect(result).toMatchObject({ name: 'sample-model', modelId: 'purimatu:sample', title: '試作', article: 'https://example.com/sample/' })
    expect(readFileSync(result.guidePath, 'utf8')).toBe(readFileSync(path.join(workspace, 'guide.json'), 'utf8'))
    const folder = path.dirname(result.guidePath)
    expect(read(path.join(folder, 'manifest.json'))).toEqual(read(path.join(workspace, 'manifest.json')))
    expect(read(path.join(folder, 'review.json'))).toEqual(read(path.join(workspace, 'review.json')))
    expect(read(path.join(folder, 'changes.json'))).toEqual([{ change: 'review only' }])
    expect(readFileSync(path.join(folder, 'photos/photo-1.jpg'), 'utf8')).toBe('local reference photo bytes')
    expect(() => exportWorkspace({ workspace })).toThrow(/Export already exists/)
  })

  it('requires review of the exact current guide, resolves outstanding issues and rejects failed physical checks', () => {
    const { workspace } = setup(); approve(workspace)
    expect(validateWorkspace({ workspace, forExport: true }).review.status).toBe('reviewed')
    const file = path.join(workspace, 'guide.json')
    writeFileSync(file, readFileSync(file, 'utf8') + ' ')
    expect(() => exportWorkspace({ workspace })).toThrow(/changed since review/)
    approve(workspace)
    const reviewFile = path.join(workspace, 'review.json'), review = read(reviewFile)
    review.unresolved.push({ id: 'hidden', description: '背面の接続を調べる', status: 'open' }); put(reviewFile, review)
    expect(() => exportWorkspace({ workspace })).toThrow(/open unresolved/)
    review.unresolved.pop(); review.comments = [{ id: 'c1', author: 'human', createdAt: '2026-09-12T00:00:00Z', text: '色を確認', status: 'open' }]; put(reviewFile, review)
    expect(() => exportWorkspace({ workspace })).toThrow(/open review comments/)
    review.comments[0].status = 'resolved'; review.physicalCheck = 'failed'; put(reviewFile, review)
    expect(() => exportWorkspace({ workspace })).toThrow(/failed physical/)
  })

  it('never overwrites a workspace and rejects invalid source inputs before creating it', () => {
    const options = setup(), before = readFileSync(path.join(options.workspace, 'guide.json'), 'utf8')
    expect(() => initWorkspace(options)).toThrow(/already exists/)
    expect(readFileSync(path.join(options.workspace, 'guide.json'), 'utf8')).toBe(before)
    const workspace = path.join(options.dir, 'new')
    for (const invalid of [{ slug: '../bad' }, { article: 'file:///etc/passwd' }, { photos: [path.join(options.dir, 'absent.jpg')] }, { photos: [fixture] }, { modelId: '' }]) {
      expect(() => initWorkspace({ ...options, workspace, ...invalid })).toThrow()
      expect(existsSync(workspace)).toBe(false)
    }
    const badGuide = path.join(options.dir, 'bad.json'); put(badGuide, { defaultVariant: 'missing' })
    expect(() => initWorkspace({ ...options, workspace, fromGuide: badGuide })).toThrow(/does not exist/)
    expect(existsSync(workspace)).toBe(false)
  })

  it('rejects public outputs, path traversal and symlink escapes', () => {
    const options = setup(), fakeRoot = path.join(options.dir, 'repo')
    mkdirSync(path.join(fakeRoot, 'public'), { recursive: true })
    expect(() => initWorkspace({ ...options, root: fakeRoot, workspace: path.join(fakeRoot, 'public/private-work') })).toThrow(/outside public/)
    symlinkSync(path.join(fakeRoot, 'public'), path.join(options.dir, 'linked-public'))
    expect(() => initWorkspace({ ...options, root: fakeRoot, workspace: path.join(options.dir, 'linked-public/private-work') })).toThrow(/outside public/)
    expect(() => safeWorkspaceFile(options.workspace, '../front.jpg')).toThrow(/relative path/)
    expect(() => safeWorkspaceFile(options.workspace, options.photos[0])).toThrow(/relative path/)
    symlinkSync(options.photos[0], path.join(options.workspace, 'photos/escaped.jpg'))
    expect(() => safeWorkspaceFile(options.workspace, 'photos/escaped.jpg')).toThrow(/escapes/)
    approve(options.workspace)
    expect(() => exportWorkspace({ workspace: options.workspace, root: fakeRoot, out: path.join(fakeRoot, 'public/export') })).toThrow(/outside public/)
    const linkedExport = path.join(options.dir, 'linked-export')
    mkdirSync(linkedExport)
    symlinkSync(path.join(fakeRoot, 'public'), path.join(linkedExport, 'models'))
    expect(() => exportWorkspace({ workspace: options.workspace, root: fakeRoot, out: linkedExport })).toThrow(/outside public/)
    const manifest = read(path.join(options.workspace, 'manifest.json'))
    manifest.photos[0].path = 'photos/../../front.jpg'; put(path.join(options.workspace, 'manifest.json'), manifest)
    expect(() => exportWorkspace({ workspace: options.workspace })).toThrow(/relative path/)
  })

  it.each([
    ['reading null', g => { g.reading = null }],
    ['nested reading array', g => { g.reading.steps = [] }],
    ['unknown reading step', g => { g.reading.steps = { 'unit:missing:0': { title: '見出し', description: '説明' } } }],
    ['empty reading title', g => { g.reading.steps = { 'unit:C1:0': { title: '', description: '説明' } } }],
    ['unknown unit name', g => { g.reading.unitNames = { missing: '名前' } }],
    ['invalid reading order', g => { g.reading.sequence = [] }],
    ['unknown combined unit', g => { g.reading.combineUnits = ['missing'] }],
    ['unknown label family', g => { g.reading.labelFamilies = [['A1', 'missing']] }],
    ['unknown old URL reference', g => { g.legacyAtKeys.push('unit:missing:0') }],
    ['invalid display label', g => { g.displayLabels.A1 = 42 }],
    ['unknown display label', g => { g.displayLabels.missing = 'Z1' }],
    ['unknown display token', g => { g.reading.steps = { 'unit:C1:0': { title: '見出し', description: '{{missing}}をつなぐ' } } }],
    ['prototype property display token', g => { g.reading.steps = { 'unit:C1:0': { title: '見出し', description: '{{toString}}をつなぐ' } } }],
    ['invalid fallback description', g => { g.variants[g.defaultVariant].assembly[0].description = { text: 'bad type' } }],
    ['unknown fallback token', g => { g.variants[g.defaultVariant].assembly[0].description = '{{missing}}をつなぐ' }],
  ])('rejects %s before author review/export instead of deferring failure to import', (_, corrupt) => {
    const { workspace } = setup(), file = path.join(workspace, 'guide.json'), guide = read(file)
    corrupt(guide); put(file, guide); approve(workspace)
    expect(() => validateAuthorGuide(guide)).toThrow()
    expect(() => validateWorkspace({ workspace })).toThrow()
    expect(() => exportWorkspace({ workspace })).toThrow()
    expect(existsSync(path.join(workspace, 'export'))).toBe(false)
  })

  it('author presentation validation is read-only and accepts the published fixture', () => {
    const guide = read(fixture), before = JSON.stringify(guide)
    expect(validateAuthorGuide(guide).model.pieces).toHaveLength(53)
    expect(JSON.stringify(guide)).toBe(before)
  })

  it('checks malformed review and photo records and dangling evidence references', () => {
    const { workspace } = setup(), { manifest, review, guide } = readWorkspace({ workspace })
    for (const mutate of [m => { m.photos.push(m.photos[0]) }, m => { m.units.edgeMm = 1 }, m => { m.photos[0].path = 'photo.jpg' }]) {
      const copy = structuredClone(manifest); mutate(copy)
      expect(() => validateManifest(copy, workspace)).toThrow()
    }
    for (const mutate of [r => { r.status = 'auto-verified' }, r => { r.reviewedAt = 'nonsense' }, r => { r.guideSha256 = '123' }, r => { r.unresolved[0].status = 'ignored' }, r => { r.evidence = [{ id: 'e1', photoId: 'unknown' }] }, r => { r.evidence = [{ id: 'e1', photoId: 'photo-1', pieceIds: ['unknown'] }] }]) {
      const copy = structuredClone(review); mutate(copy)
      expect(() => validateReview(copy, manifest, guide)).toThrow()
    }
    const comment = { id: 'c1', author: 'human', createdAt: '2026-09-12T00:00:00Z', text: 'あたまの ふちに No.6 が足りない', status: 'open', stepKey: 'unit:A1:0', photoId: 'photo-1' }
    const aiEvidence = { id: 'e1', author: 'ai', photoId: 'photo-1', pieceIds: [], observation: '輪郭', interpretation: '推測', confidence: 'inferred' }
    expect(validateReview({ ...structuredClone(review), comments: [comment], evidence: [aiEvidence] }, manifest, guide).comments).toHaveLength(1)
    for (const bad of [{ author: 'robot' }, { text: '' }, { status: 'done' }, { createdAt: 'nonsense' }, { photoId: 'unknown' }, { pieceIds: 'j1' }, { reply: 1 }]) {
      expect(() => validateReview({ ...structuredClone(review), comments: [{ ...comment, ...bad }] }, manifest, guide)).toThrow()
    }
    expect(() => validateReview({ ...structuredClone(review), comments: [comment, comment] }, manifest, guide)).toThrow(/duplicate comment/)
    expect(() => validateReview({ ...structuredClone(review), evidence: [{ ...aiEvidence, author: 'robot' }] }, manifest, guide)).toThrow(/author/)
    expect(guideDigest(Buffer.from('same'))).toBe(guideDigest('same'))
    const invalidGuide = structuredClone(guide)
    invalidGuide.variants[invalidGuide.defaultVariant].model.pieces[0].pose.vertices[0][0] = null
    put(path.join(workspace, 'guide.json'), invalidGuide)
    expect(() => validateWorkspace({ workspace })).toThrow(/invalid geometry/)
  })
})
