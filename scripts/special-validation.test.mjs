import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { importAssembly, runtimeGuide, validateGuide } from './import-assembly.mjs'
import { exportWorkspace, guideDigest, initWorkspace, validateAuthorGuide, validateWorkspace } from './author-assembly.mjs'
import { createReviewServer } from './review-assembly.mjs'

const active = guide => guide.variants.draft
const stage = guide => active(guide).units[0].steps[0]
const temporary = []
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const temp = () => { const dir = mkdtempSync(path.join(tmpdir(), 'laq-special-validation-')); temporary.push(dir); return dir }

function fixture() {
  const pieces = [
    { id: 'plate', partNo: 1, pose: { vertices: [[0,0,0],[1,0,0],[1,1,0],[0,1,0]], normal: [0,0,1] } },
    { id: 'shaft', partNo: 'mini-shaft', pose: { center: [0,0,0], axis: [1,0,0], directions: { 0: [0,1,0], 1: [0,-1,0] }, axleDirection: [0,0,1] } },
    { id: 'wheel', partNo: 'mini-wheel', pose: { center: [0,0,1], axis: [0,0,1] } },
  ]
  const pieceIds = pieces.map(piece => piece.id)
  return {
    defaultVariant: 'draft',
    variants: { draft: {
      model: { pieces, connections: [{ joint: 'shaft', ports: [{ port: 0, piece: 'plate', socket: 0 }] }], axleConnections: [{ shaft: 'shaft', wheel: 'wheel' }] },
      units: [{ id: 'u', quantity: 1, pieceIds, steps: [{ id: 'step', title: '足回り', visiblePieces: [...pieceIds], newPieces: [...pieceIds], actions: [{ kind: 'port', joint: 'shaft', port: 0, piece: 'plate', socket: 0 }, { kind: 'axle', shaft: 'shaft', wheel: 'wheel' }] }] }],
      assembly: [], finished: 'u',
    } },
  }
}

describe('special part guide validation', () => {
  it('accepts standard plate ports and a separate shaft/wheel connection in source presentation', () => {
    const guide = fixture()
    guide.reading = { unitNames: { u: '車輪' }, steps: { 'unit:u:0': { title: '{{u}}', description: 'ミニシャフトにミニホイールをつける' } } }
    expect(validateAuthorGuide(guide)).toBe(active(guide))
    active(guide).model.connections[0].ports[0].port = 1
    stage(guide).actions[0].port = 1
    expect(() => validateGuide(guide)).not.toThrow()
  })

  it.each([
    ['unknown special part', g => { active(g).model.pieces[2].partNo = 'wheel' }, /invalid partNo/],
    ['numeric string part', g => { active(g).model.pieces[0].partNo = '1' }, /invalid partNo/],
    ['missing shaft directions', g => { delete active(g).model.pieces[1].pose.directions }, /directions/],
    ['missing axle direction', g => { delete active(g).model.pieces[1].pose.axleDirection }, /axleDirection/],
    ['zero shaft axis', g => { active(g).model.pieces[1].pose.axis = [0,0,0] }, /axis direction/],
    ['zero wheel axis', g => { active(g).model.pieces[2].pose.axis = [0,0,0] }, /axis direction/],
    ['parallel plate directions', g => { active(g).model.pieces[1].pose.directions[1] = [0,1,0] }, /oppose/],
    ['axis along plate direction', g => { active(g).model.pieces[1].pose.axis = [0,1,0] }, /perpendicular/],
    ['axle along plate direction', g => { active(g).model.pieces[1].pose.axleDirection = [0,1,0] }, /perpendicular/],
    ['axle along shaft axis', g => { active(g).model.pieces[1].pose.axleDirection = [1,0,0] }, /perpendicular/],
    ['third port toward wheel', g => { active(g).model.pieces[1].pose.directions[2] = [0,0,1] }, /third plate direction/],
    ['wheel as port joint', g => { active(g).model.connections[0].joint = 'wheel' }, /unknown joint/],
    ['shaft as plate', g => { active(g).model.connections[0].ports[0].piece = 'shaft' }, /unknown plate/],
    ['fourth shaft port', g => { active(g).model.connections[0].ports[0].port = 3 }, /invalid port/],
    ['plate as axle shaft', g => { active(g).model.axleConnections[0].shaft = 'plate' }, /unknown shaft/],
    ['shaft as axle wheel', g => { active(g).model.axleConnections[0].wheel = 'shaft' }, /unknown wheel/],
    ['missing wheel reference', g => { active(g).model.axleConnections[0].wheel = 'absent' }, /unknown wheel/],
    ['null axle list', g => { active(g).model.axleConnections = null }, /model.axleConnections/],
    ['duplicate axle pair', g => { active(g).model.axleConnections.push({ shaft: 'shaft', wheel: 'wheel' }) }, /duplicate shaft\/wheel/],
    ['uncovered axle connection', g => { stage(g).actions.pop() }, /cover every connection/],
    ['duplicate axle action', g => { stage(g).actions.push({ kind: 'axle', shaft: 'shaft', wheel: 'wheel' }) }, /duplicate action/],
    ['swapped axle action references', g => { Object.assign(stage(g).actions[1], { shaft: 'wheel', wheel: 'shaft' }) }, /does not match/],
    ['invisible axle reference', g => { stage(g).visiblePieces.pop(); stage(g).newPieces.pop() }, /invisible piece/],
    ['axle action without model connection', g => { delete active(g).model.axleConnections }, /does not match/],
  ])('rejects %s', (_, corrupt, message) => {
    const guide = fixture(); corrupt(guide)
    expect(() => validateGuide(guide)).toThrow(message)
  })

  it.each(['shaft', 'wheel'])('rejects a second mate for an occupied %s', occupied => {
    const guide = fixture(), model = active(guide).model
    const extra = structuredClone(model.pieces.find(piece => piece.id === (occupied === 'shaft' ? 'wheel' : 'shaft')))
    extra.id = 'extra'; model.pieces.push(extra)
    model.axleConnections.push(occupied === 'shaft' ? { shaft: 'shaft', wheel: 'extra' } : { shaft: 'extra', wheel: 'wheel' })
    expect(() => validateGuide(guide)).toThrow(/duplicate shaft\/wheel/)
  })

  it('allows special parts with an unoccupied axle and no axle actions', () => {
    const guide = fixture()
    delete active(guide).model.axleConnections
    stage(guide).actions.pop()
    expect(() => validateGuide(guide)).not.toThrow()
  })

  it('exports a human-reviewed workspace with special parts', () => {
    const dir = temp(), fromGuide = path.join(dir, 'source.json'), workspace = path.join(dir, 'work')
    writeFileSync(fromGuide, JSON.stringify(fixture()))
    initWorkspace({ slug: 'special', modelId: 'local:special', title: '車輪', article: 'https://example.com/special', fromGuide, workspace })
    expect(validateWorkspace({ workspace }).variant.model.axleConnections).toEqual([{ shaft: 'shaft', wheel: 'wheel' }])
    const reviewPath = path.join(workspace, 'review.json')
    const guideBytes = readFileSync(path.join(workspace, 'guide.json'))
    const review = JSON.parse(readFileSync(reviewPath, 'utf8'))
    Object.assign(review, { status: 'reviewed', reviewer: 'test reviewer', reviewedAt: '2026-09-14T00:00:00.000Z', guideSha256: guideDigest(guideBytes), notes: 'reviewed' })
    review.unresolved = []
    writeFileSync(reviewPath, JSON.stringify(review))
    const output = exportWorkspace({ workspace })
    expect(existsSync(output.guidePath)).toBe(true)
  })

  it('preserves special parts in public import and runtime serialization', () => {
    const source = temp(), dir = path.join(source, 'models', 'special'), root = path.join(source, 'library')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'unit-guide.json'), JSON.stringify(fixture()))
    mkdirSync(path.join(root, 'src/data/sources'), { recursive: true })
    writeFileSync(path.join(root, 'src/data/sources/original.json'), JSON.stringify({ models: [{ id: 'original:special', title: '車輪', sourceUrl: '' }] }))
    for (const file of ['vendor/three.min.js', 'vendor/three.LICENSE.txt', 'viewer/realistic-parts.js', 'viewer/unit-instructions.js', 'viewer/unit-instructions.css']) {
      const target = path.join(root, 'public/assemblies', file)
      mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, '')
    }
    const entry = importAssembly({ source, name: 'special', modelId: 'original:special', root })
    expect(entry.pieceCount).toBe(3)
    expect(JSON.parse(readFileSync(path.join(root, 'public', entry.guidePath), 'utf8')).article).toBe('')
    const runtime = runtimeGuide(fixture())
    expect(runtime.variants.draft.model.axleConnections).toEqual([{ shaft: 'shaft', wheel: 'wheel' }])
    expect(runtime.variants.draft.units[0].steps[0].actions[1]).toEqual({ kind: 'axle', shaft: 'shaft', wheel: 'wheel' })
  })

  it('saves special geometry and axle actions through the editor API', async () => {
    const dir = temp(), fromGuide = path.join(dir, 'source.json'), workspace = path.join(dir, 'work')
    writeFileSync(fromGuide, JSON.stringify(fixture()))
    initWorkspace({ slug: 'special', modelId: 'local:special', title: '車輪', article: 'https://example.com/special', fromGuide, workspace })
    const server = createReviewServer({ workspace })
    try {
      server.listen(0, '127.0.0.1'); await once(server, 'listening')
      const origin = `http://127.0.0.1:${server.address().port}`
      const data = await fetch(`${origin}/api/workspace`).then(response => response.json())
      active(data.guide).model.pieces[2].color = 'black'
      const response = await fetch(`${origin}/api/save`, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ baseVersion: data.version, guide: data.guide, review: data.review, photos: [], changes: ['ホイールの色を変更'] }) })
      expect(response.status).toBe(200)
      const saved = validateWorkspace({ workspace })
      expect(saved.variant.model.pieces[2].color).toBe('black')
      expect(saved.variant.model.axleConnections).toEqual([{ shaft: 'shaft', wheel: 'wheel' }])
      expect(saved.variant.units[0].steps[0].actions[1]).toEqual({ kind: 'axle', shaft: 'shaft', wheel: 'wheel' })
    } finally {
      await new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })
    }
  })
})
