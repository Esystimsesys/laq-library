import { describe, expect, it } from 'vitest'
import { validateSourceGuide } from './import-assembly.mjs'
import { attachPiece, attachmentParts, availableSlots, deletePiece, reattachPiece, replacePiece, replacementParts, slotMarker } from '../tools/assembly-review/pieces.js'
import { transformPieces } from '../tools/assembly-review/transforms.js'

const active = guide => guide.variants[guide.defaultVariant]
const piece = (guide, id) => active(guide).model.pieces.find(p => p.id === id)
const stages = guide => [...active(guide).units.flatMap(unit => unit.steps), ...active(guide).assembly]
const values = (guide, id) => availableSlots(guide, id).map(slot => slot.value)
const sub = (a, b) => a.map((value, i) => value - b[i])
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0)
const closeVector = (actual, expected) => expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 8))
const midpoint = vertices => vertices[0].map((value, i) => (value + vertices[1][i]) / 2)
function fixture() {
  return { defaultVariant: 'test', variants: { test: {
    model: { pieces: [
      { id: 'p', partNo: 1, color: 'red', pose: { vertices: [[0,0,0],[1,0,0],[1,1,0],[0,1,0]], normal: [0,0,1] } },
      { id: 'q', partNo: 2, color: 'blue', pose: { vertices: [[3,0,0],[4,0,0],[3.5,Math.sqrt(3)/2,0]], normal: [0,0,1] } },
    ], connections: [] },
    units: ['p','q'].map((id, i) => ({ id: `U${i}`, quantity: 1, pieceIds: [id], steps: [{ id: `s${i}`, title: id, visiblePieces: [id], newPieces: [id], actions: [] }] })),
    assembly: [{ id: 'finish', title: 'つなぐ', inputs: ['U0','U1'], result: 'finished', visiblePieces: ['p','q'], newPieces: ['q'], actions: [] }], finished: 'finished',
  } } }
}
function addAxle(guide, targetId = 'p', suffix = '') {
  const shaft = attachPiece(guide, { targetId, targetSlot: 0, partNo: 'mini-shaft', id: `shaft${suffix}` })
  const wheel = attachPiece(guide, { targetId: shaft, targetSlot: 3, partNo: 'mini-wheel', id: `wheel${suffix}`, color: 'black' })
  return { shaft, wheel }
}
function expectAxle(guide, shaftId, wheelId) {
  const shaft = piece(guide, shaftId).pose, wheel = piece(guide, wheelId).pose
  closeVector(sub(wheel.center, shaft.center), shaft.axleDirection.map(value => value * .32))
  closeVector(wheel.axis, shaft.axleDirection)
  expect(dot(shaft.axis, shaft.axleDirection)).toBeCloseTo(0, 8)
  expect(dot(shaft.directions[0], shaft.axleDirection)).toBeCloseTo(0, 8)
  closeVector(shaft.directions[1], shaft.directions[0].map(value => -value))
}

describe('mini shaft and wheel editing', () => {
  it.each([1, 2])('mates all three plate ports of a shaft with a regular No.%i plate and aligns the wheel axle', partNo => {
    const guide = fixture(), targetId = partNo === 1 ? 'p' : 'q'
    expect(attachmentParts(guide, targetId, 0)).toContain('mini-shaft')
    const shaft = attachPiece(guide, { targetId, targetSlot: 0, partNo: 'mini-shaft' })
    expect(values(guide, shaft)).toEqual([1, 2, 3])
    expect(attachmentParts(guide, shaft, 1)).toEqual([1, 2])
    expect(attachmentParts(guide, shaft, 3)).toEqual(['mini-wheel'])
    const shaftPose = piece(guide, shaft).pose
    closeVector(shaftPose.axis, [1, 0, 0])
    closeVector(shaftPose.directions[2], shaftPose.axleDirection.map(v=>-v))
    for (const [slot, id] of [[0, targetId], ...[1,2].map(slot=>[slot, attachPiece(guide, {targetId:shaft,targetSlot:slot,partNo})])]) {
      const plate = piece(guide, id), vertices = plate.pose.vertices
      closeVector(sub(midpoint(vertices), shaftPose.center), shaftPose.directions[slot].map(value => value * .1))
      closeVector(sub(vertices[1], vertices[0]), shaftPose.axis)
      for (let i = 0; i < vertices.length; i++) expect(Math.hypot(...sub(vertices[i], vertices[(i + 1) % vertices.length]))).toBeCloseTo(1, 8)
    }
    const marker = slotMarker(guide, shaft, 3)
    const wheel = attachPiece(guide, { targetId: shaft, targetSlot: 3, partNo: 'mini-wheel' })
    closeVector(marker.position, piece(guide, wheel).pose.center)
    expectAxle(guide, shaft, wheel)
    expect(values(guide, shaft)).toEqual([])
    expect(values(guide, wheel)).toEqual([])
    expect(active(guide).model.axleConnections).toEqual([{ shaft, wheel }])
    expect(stages(guide).flatMap(stage => stage.actions).filter(action => action.kind === 'axle')).toEqual([{ kind: 'axle', shaft, wheel }])
    expect(() => validateSourceGuide(guide)).not.toThrow()
  })

  it('rejects occupied slots, incompatible attachments and cross-type replacements without mutation', () => {
    const guide = fixture(), { shaft, wheel } = addAxle(guide)
    expect(replacementParts(guide, shaft)).toEqual(['mini-shaft'])
    expect(replacementParts(guide, wheel)).toEqual(['mini-wheel'])
    const before = structuredClone(guide)
    for (const args of [
      { targetId: 'p', targetSlot: 0, partNo: 'mini-shaft' },
      { targetId: shaft, targetSlot: 3, partNo: 'mini-wheel' },
      { targetId: wheel, targetSlot: 0, partNo: 'mini-shaft' },
      { targetId: shaft, targetSlot: 1, partNo: 'mini-wheel' },
      { targetId: 'q', targetSlot: 0, partNo: 'mini-wheel' },
      { targetId: shaft, targetSlot: 1, partNo: 3 },
    ]) expect(() => attachPiece(guide, args)).toThrow()
    for (const [id, partNo] of [[shaft, 3], [shaft, 'mini-wheel'], [wheel, 'mini-shaft'], ['p', 'mini-shaft']]) expect(() => replacePiece(guide, id, partNo)).toThrow()
    replacePiece(guide, shaft, 'mini-shaft'); replacePiece(guide, wheel, 'mini-wheel')
    expect(guide).toEqual(before)
  })

  it('frees a detached wheel and supports attaching a shaft back through its axle hole', () => {
    const guide = fixture(), { shaft, wheel } = addAxle(guide), originalWheel = structuredClone(piece(guide, wheel))
    deletePiece(guide, shaft)
    expect(values(guide, wheel)).toEqual([0])
    expect(attachmentParts(guide, wheel, 0)).toEqual(['mini-shaft'])
    expect(active(guide).model.axleConnections).toEqual([])
    expect(stages(guide).flatMap(stage => stage.actions)).toEqual([])
    const newShaft = attachPiece(guide, { targetId: wheel, targetSlot: 0, partNo: 'mini-shaft' })
    expect(piece(guide, wheel)).toEqual(originalWheel)
    expectAxle(guide, newShaft, wheel)
    expect(values(guide, newShaft)).toEqual([0, 1, 2])
    for (const [targetSlot, partNo] of [[0, 1], [1, 2], [2, 1]]) attachPiece(guide, { targetId: newShaft, targetSlot, partNo })
    expect(() => validateSourceGuide(guide)).not.toThrow()
  })

  it('reattaches a wheel across units, removes stale actions, and survives JSON persistence and deletion', () => {
    let guide = fixture()
    const { shaft, wheel } = addAxle(guide)
    const otherShaft = attachPiece(guide, { targetId: 'q', targetSlot: 0, partNo: 'mini-shaft' })
    reattachPiece(guide, { pieceId: wheel, targetId: otherShaft, targetSlot: 3 })
    expect(values(guide, shaft)).toContain(2)
    expectAxle(guide, otherShaft, wheel)
    expect(active(guide).model.axleConnections).toEqual([{ shaft: otherShaft, wheel }])
    expect(active(guide).units[0].steps[0].actions.some(action => action.kind === 'axle')).toBe(false)
    expect(active(guide).assembly[0].actions).toEqual([{ kind: 'axle', shaft: otherShaft, wheel }])
    guide = JSON.parse(JSON.stringify(guide))
    expect(() => validateSourceGuide(guide)).not.toThrow()
    expectAxle(guide, otherShaft, wheel)
    deletePiece(guide, wheel)
    expect(JSON.stringify(guide)).not.toContain(`"${wheel}"`)
    expect(active(guide).model.axleConnections).toEqual([])
    expect(values(guide, otherShaft)).toContain(2)
    expect(() => validateSourceGuide(guide)).not.toThrow()
  })

  it('preserves mating geometry when a whole unit is moved and rotated', () => {
    const guide = fixture(), { shaft, wheel } = addAxle(guide)
    const plate = attachPiece(guide, { targetId: shaft, targetSlot: 1, partNo: 2 })
    const untouched = structuredClone(piece(guide, 'q')), connections = structuredClone(active(guide).model.connections)
    const originalAxis = [...piece(guide, shaft).pose.axleDirection]
    transformPieces(guide, active(guide).units[0].pieceIds, [17, -8.5, 34], [35, 65, 15])
    expectAxle(guide, shaft, wheel)
    expect(piece(guide, shaft).pose.axleDirection).not.toEqual(originalAxis)
    for (const [id, slot] of [['p', 0], [plate, 1]]) closeVector(sub(midpoint(piece(guide, id).pose.vertices), piece(guide, shaft).pose.center), piece(guide, shaft).pose.directions[slot].map(value => value * .1))
    expect(piece(guide, 'q')).toEqual(untouched)
    expect(active(guide).model.connections).toEqual(connections)
    expect(() => validateSourceGuide(guide)).not.toThrow()
  })
})
