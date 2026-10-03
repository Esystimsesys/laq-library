import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateSourceGuide } from './import-assembly.mjs'
import { attachPiece, availableSlots, pieceConnections, reattachPiece, relinkConnection } from '../tools/assembly-review/pieces.js'
import { jointOrientations } from '../tools/assembly-review/orientations.js'

const active = guide => guide.variants[guide.defaultVariant]
const piece = (guide, id) => active(guide).model.pieces.find(piece => piece.id === id)
const points = item => item.pose.vertices ?? [item.pose.center]
const closeVector = (actual, expected) => expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 8))
const forkDirection = (guide, id, port) => jointOrientations(guide, id).options.find(option => option.current).pose.directions[port]
const square = id => ({ id, partNo: 1, color: 'lavender', pose: { vertices: [[0,0,0],[1,0,0],[1,1,0],[0,1,0]], normal: [0,0,1] } })
const link = (guide, id, partnerId) => pieceConnections(guide, id).find(link => link.partner === partnerId)
// A released joint keeps its fork directions frozen, so compare where a piece sits, not how it was stored.
const placement = item => JSON.stringify([item.pose.vertices, item.pose.center, item.pose.axis, item.pose.normal])

/** Two plates in separate units, so a relink has to place its action in the assembly step. */
function fixture() {
  return { defaultVariant: 'test', variants: { test: { model: { pieces: [square('p'), square('q')], connections: [] }, units: [
    { id: 'A', quantity: 1, pieceIds: ['p'], steps: [{ id: 'a', title: 'A', visiblePieces: ['p'], newPieces: ['p'], actions: [] }] },
    { id: 'B', quantity: 1, pieceIds: ['q'], steps: [{ id: 'b', title: 'B', visiblePieces: ['q'], newPieces: ['q'], actions: [] }] },
  ], assembly: [{ id: 'ab', title: '組み合わせる', inputs: ['A','B'], result: 'AB', visiblePieces: ['p','q'], newPieces: ['q'], actions: [] }], finished: 'AB' } } }
}
// p — j1 — m — j2 — tip, with a spare No.5 on q to relink onto.
function chain() {
  const guide = fixture()
  attachPiece(guide, { targetId: 'p', targetSlot: 0, partNo: 6, id: 'j1' })
  attachPiece(guide, { targetId: 'j1', targetSlot: 1, partNo: 1, id: 'm' })
  attachPiece(guide, { targetId: 'm', targetSlot: 2, partNo: 7, id: 'j2' })
  attachPiece(guide, { targetId: 'j2', targetSlot: 2, partNo: 2, id: 'tip' })
  attachPiece(guide, { targetId: 'q', targetSlot: 0, partNo: 5, id: 'j3' })
  expect(() => validateSourceGuide(guide)).not.toThrow()
  return guide
}
function distances(guide, ids) {
  const all = ids.flatMap(id => points(piece(guide, id)))
  return all.flatMap((a, i) => all.slice(i + 1).map(b => Math.hypot(...a.map((value, axis) => value - b[axis]))))
}

describe('moving one existing connection', () => {
  it('keeps the remaining connections by carrying everything still attached', () => {
    const guide = chain(), before = structuredClone(guide)
    const branch = ['m','j2','tip'], spread = distances(guide, branch)
    const result = relinkConnection(guide, { pieceId: 'm', releaseKey: link(guide,'m','j1').key, targetId: 'j3', targetSlot: 1 })
    expect(new Set(result.moved)).toEqual(new Set(branch))
    for (const id of ['p','q','j1','j3']) expect(placement(piece(guide, id))).toEqual(placement(piece(before, id)))
    closeVector(forkDirection(guide,'j1',1), forkDirection(before,'j1',1))
    distances(guide, branch).forEach((value, i) => expect(value).toBeCloseTo(spread[i], 8))
    expect(pieceConnections(guide,'m').map(item => item.partner).sort()).toEqual(['j2','j3'])
    expect(pieceConnections(guide,'j2').map(item => item.partner).sort()).toEqual(['m','tip'])
    expect(link(guide,'m','j3')).toMatchObject({ joint: 'j3', port: 1, piece: 'm', socket: 0 })
    expect(active(guide).assembly[0].actions).toEqual([{ kind: 'port', joint: 'j3', port: 1, piece: 'm', socket: 0 }])
    expect(() => validateSourceGuide(guide)).not.toThrow()
    // The new connection has to be seated, or the joint could not name its own orientation.
    for (const id of ['j1','j2','j3']) expect(jointOrientations(guide, id).options.some(option => option.current)).toBe(true)
  })

  it('connects through an edge other than the first one', () => {
    const guide = chain()
    relinkConnection(guide, { pieceId: 'm', releaseKey: link(guide,'m','j1').key, targetId: 'j3', targetSlot: 1, pieceSlot: 1 })
    expect(link(guide,'m','j3')).toMatchObject({ port: 1, socket: 1 })
    expect(() => validateSourceGuide(guide)).not.toThrow()
    expect(jointOrientations(guide,'j3').options.some(option => option.current)).toBe(true)
    const before = structuredClone(guide)
    // Edge 3 still holds j2, so it cannot take a second joint.
    expect(() => relinkConnection(guide, { pieceId: 'm', releaseKey: link(guide,'m','j3').key, targetId: 'j1', targetSlot: 1, pieceSlot: 2 })).toThrow('使用中')
    expect(guide).toEqual(before)
  })

  it('refuses a target that stays on the same side of the released connection', () => {
    const guide = chain(), before = structuredClone(guide)
    expect(() => relinkConnection(guide, { pieceId: 'm', releaseKey: link(guide,'m','j1').key, targetId: 'j2', targetSlot: 1 })).toThrow('同じ側')
    expect(() => relinkConnection(guide, { pieceId: 'm', targetId: 'j3', targetSlot: 1 })).toThrow('外す接続')
    expect(() => relinkConnection(guide, { pieceId: 'm', releaseKey: 'port:nothing', targetId: 'j3', targetSlot: 1 })).toThrow('見つかりません')
    expect(guide).toEqual(before)
  })

  it('still supports releasing every connection and moving the piece alone', () => {
    const guide = chain(), before = structuredClone(guide)
    reattachPiece(guide, { pieceId: 'm', targetId: 'j3', targetSlot: 1 })
    for (const id of ['p','q','j1','j2','j3','tip']) expect(placement(piece(guide, id))).toEqual(placement(piece(before, id)))
    for (const [id, port] of [['j1',1],['j2',0]]) closeVector(forkDirection(guide,id,port), forkDirection(before,id,port))
    expect(pieceConnections(guide,'m').map(item => item.partner)).toEqual(['j3'])
    expect(pieceConnections(guide,'j2').map(item => item.partner)).toEqual(['tip'])
    expect(() => validateSourceGuide(guide)).not.toThrow()
  })

  it('carries a branch of a real guide without moving anything else', () => {
    const guide = JSON.parse(readFileSync(new URL('../public/assemblies/desukan/guide.json', import.meta.url), 'utf8'))
    const before = structuredClone(guide)
    // Only a bridge separates the two sides, so search for a plate, connection and target that do.
    const attempt = () => {
      for (const plate of active(guide).model.pieces.filter(item => item.partNo <= 2 && pieceConnections(guide, item.id).length > 1)) {
        for (const released of pieceConnections(guide, plate.id)) {
          for (const target of active(guide).model.pieces.filter(item => item.partNo >= 3 && item.partNo <= 7 && availableSlots(guide, item.id).length)) {
            const trial = structuredClone(guide)
            try {
              const moved = relinkConnection(trial, { pieceId: plate.id, releaseKey: released.key, targetId: target.id, targetSlot: availableSlots(guide, target.id)[0].value }).moved
              if (moved.length > 1) return { plate, released, target, slot: availableSlots(guide, target.id)[0].value }
            } catch { /* keep searching */ }
          }
        }
      }
    }
    const { plate, released, target, slot } = attempt()
    const kept = pieceConnections(guide, plate.id).filter(item => item.key !== released.key).map(item => item.partner)
    const result = relinkConnection(guide, { pieceId: plate.id, releaseKey: released.key, targetId: target.id, targetSlot: slot })
    expect(result.moved.length).toBeGreaterThan(1)
    const spread = distances(before, result.moved)
    distances(guide, result.moved).forEach((value, i) => expect(value).toBeCloseTo(spread[i], 8))
    for (const item of active(before).model.pieces) if (!result.moved.includes(item.id)) expect(placement(piece(guide, item.id))).toEqual(placement(item))
    expect(pieceConnections(guide, plate.id).map(item => item.partner)).toEqual([...kept, target.id])
    expect(() => validateSourceGuide(guide)).not.toThrow()
    expect(jointOrientations(guide, target.id).options.some(option => option.current)).toBe(true)
  })
})
