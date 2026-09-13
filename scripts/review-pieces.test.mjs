import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateGuide, validateSourceGuide } from './import-assembly.mjs'
import { attachPiece, availableSlots, deletePiece, reattachPiece, replacePiece, replacementParts, slotMarker, flipPlate, plateFaceState } from '../tools/assembly-review/pieces.js'

const active = guide => guide.variants[guide.defaultVariant]
const piece = (guide, id) => active(guide).model.pieces.find(piece => piece.id === id)
const metamon = () => JSON.parse(readFileSync(new URL('../public/assemblies/metamon/guide.json', import.meta.url), 'utf8'))
const square = id => ({ id, partNo: 1, color: 'lavender', pose: { vertices: [[0,0,0],[1,0,0],[1,1,0],[0,1,0]], normal: [0,0,1] } })
function fixture() {
  return { defaultVariant: 'test', variants: { test: { model: { pieces: [square('p'), square('q')], connections: [] }, units: [
    { id: 'A', quantity: 1, pieceIds: ['p'], steps: [{ id: 'a', title: 'A', visiblePieces: ['p'], newPieces: ['p'], explodeGroups: [['p']], actions: [] }] },
    { id: 'B', quantity: 1, pieceIds: ['q'], steps: [{ id: 'b', title: 'B', visiblePieces: ['q'], newPieces: ['q'], actions: [] }] },
  ], assembly: [{ id: 'ab', title: '組み合わせる', inputs: ['A','B'], result: 'AB', visiblePieces: ['p','q'], newPieces: ['q'], explodeGroups: [['q']], actions: [] }], finished: 'AB' } } }
}
const closeVector = (actual, expected) => expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 8))
const midpoint = vertices => vertices[0].map((value, i) => (value + vertices[1][i]) / 2)
function expectRegular(plate) {
  const vertices = plate.pose.vertices
  for (let i = 0; i < vertices.length; i++) expect(Math.hypot(...vertices[i].map((value, j) => value - vertices[(i+1)%vertices.length][j]))).toBeCloseTo(1, 8)
  if (vertices.length === 4) expect(Math.hypot(...vertices[0].map((value, j) => value - vertices[2][j]))).toBeCloseTo(Math.sqrt(2), 8)
}

describe('connected piece editing', () => {
  it.each([3,4,5,6,7])('adds No.%i with a mating port and a regular plate in the rendered fork direction', partNo => {
    const guide = fixture()
    const joint = attachPiece(guide, { targetId: 'p', targetSlot: 0, partNo })
    const targetSlot = partNo === 7 ? 2 : 1
    const marker = slotMarker(guide, joint, targetSlot)
    const plate = attachPiece(guide, { targetId: joint, targetSlot, partNo: 2 })
    expectRegular(piece(guide, plate))
    const center = piece(guide, joint).pose.center
    const direction = marker.position.map((v, i) => (v-center[i])/.45)
    const actualMid = midpoint(piece(guide, plate).pose.vertices)
    const distance = partNo === 4 ? .195 : partNo === 5 ? 5.75 / (2*Math.sin(Math.PI/3))/17 : .1
    closeVector(actualMid, center.map((v,i) => v+direction[i]*distance))
    expect(availableSlots(guide, joint).map(slot => slot.value)).not.toContain(targetSlot)
    expect(() => validateSourceGuide(guide)).not.toThrow()
    expect(active(guide).units[0].steps[0].explodeGroups).toEqual([['p',joint,plate]])
    expect(active(guide).assembly[0].visiblePieces).toContain(plate)
    expect(active(guide).assembly[0].newPieces).not.toContain(plate)
  })

  it('propagates additions through later unit steps and added assembly groups', () => {
    const guide = fixture(), variant = active(guide), unit = variant.units[1]
    variant.model.pieces.push(square('r'))
    unit.pieceIds.push('r')
    unit.steps.push({ id: 'b2', title: 'B2', visiblePieces: ['q','r'], newPieces: ['r'], explodeGroups: [['r']], actions: [] })
    variant.assembly[0].visiblePieces.push('r'); variant.assembly[0].newPieces.push('r'); variant.assembly[0].explodeGroups[0].push('r')
    const joint = attachPiece(guide, { targetId: 'q', targetSlot: 1, partNo: 7 })
    expect(unit.steps[0].newPieces).toContain(joint)
    expect(unit.steps[1].visiblePieces).toContain(joint)
    expect(unit.steps[1].newPieces).not.toContain(joint)
    expect(variant.assembly[0].explodeGroups).toEqual([['q','r',joint]])
    expect(() => validateGuide(guide)).not.toThrow()
  })

  it('preserves plate socket zero and uses regular square/triangle geometry when replacing', () => {
    const guide = fixture()
    attachPiece(guide, { targetId: 'p', targetSlot: 0, partNo: 3 })
    const edge = structuredClone(piece(guide, 'p').pose.vertices.slice(0,2))
    replacePiece(guide, 'p', 2)
    expect(piece(guide, 'p').pose.vertices.slice(0,2)).toEqual(edge)
    expectRegular(piece(guide, 'p'))
    replacePiece(guide, 'p', 1)
    expectRegular(piece(guide, 'p'))
    expect(() => validateSourceGuide(guide)).not.toThrow()
  })

  it('rejects occupied slots and replacements losing a used socket without mutation', () => {
    const guide = fixture()
    const joint = attachPiece(guide, { targetId: 'p', targetSlot: 3, partNo: 7 })
    attachPiece(guide, { targetId: joint, targetSlot: 2, partNo: 1 })
    expect(replacementParts(guide, 'p')).toEqual([1])
    expect(replacementParts(guide, joint)).toEqual([7])
    const before = structuredClone(guide)
    expect(() => replacePiece(guide, 'p', 2)).toThrow('使用中')
    expect(() => replacePiece(guide, joint, 6)).toThrow('使用中')
    expect(() => attachPiece(guide, { targetId: 'p', targetSlot: 3, partNo: 3 })).toThrow('使用中')
    expect(() => attachPiece(guide, { targetId: 'p', targetSlot: 1.5, partNo: 3 })).toThrow('接続先')
    expect(() => attachPiece(guide, { targetId: 'p', targetSlot: 1, partNo: 8 })).toThrow('パーツ番号')
    expect(() => attachPiece(guide, { targetId: 'p', targetSlot: 1, partNo: 1 })).toThrow('組み合わせ')
    expect(guide).toEqual(before)
  })

  it('recomputes physical joint angles on replacement and honors the rotated axis', () => {
    const guide = fixture()
    const joint = attachPiece(guide, { targetId: 'p', targetSlot: 1, partNo: 6 })
    const before = slotMarker(guide, joint, 1).position
    replacePiece(guide, joint, 3)
    const flat = slotMarker(guide, joint, 1).position
    expect(flat).not.toEqual(before)
    const directions = piece(guide, joint).pose.directions
    closeVector(directions[1], directions[0].map(value => -value))
    replacePiece(guide, joint, 5)
    const obtuse = piece(guide, joint).pose.directions
    expect(obtuse[0].reduce((sum, value, i) => sum + value * obtuse[1][i], 0)).toBeCloseTo(-.5, 8)
    const plate = attachPiece(guide, { targetId: joint, targetSlot: 1, partNo: 1 })
    expectRegular(piece(guide, plate))
    expect(() => validateSourceGuide(guide)).not.toThrow()
  })

  it('freezes an existing joint before its only connected plate is removed or reattached', () => {
    const guide = fixture()
    const joint = attachPiece(guide, { targetId: 'p', targetSlot: 1, partNo: 6 })
    delete piece(guide, joint).pose.directions
    const directionMarker = slotMarker(guide, joint, 1).position
    deletePiece(guide, 'p')
    closeVector(slotMarker(guide, joint, 1).position, directionMarker)
    expect(() => validateSourceGuide(guide)).not.toThrow()
    const plate = attachPiece(guide, { targetId: joint, targetSlot: 0, partNo: 2 })
    const otherJoint = attachPiece(guide, { targetId: 'q', targetSlot: 0, partNo: 7 })
    reattachPiece(guide, { pieceId: plate, targetId: otherJoint, targetSlot: 2 })
    closeVector(slotMarker(guide, joint, 1).position, directionMarker)
    expect(() => validateSourceGuide(guide)).not.toThrow()
  })

  it('reattaches across units and places the single connection action in assembly', () => {
    const guide = fixture(), variant = active(guide)
    const joint = attachPiece(guide, { targetId: 'p', targetSlot: 0, partNo: 6 })
    const oldPlate = attachPiece(guide, { targetId: joint, targetSlot: 1, partNo: 2 })
    reattachPiece(guide, { pieceId: joint, targetId: 'q', targetSlot: 1 })
    expect(variant.model.connections).toEqual([{ joint, ports: [{ port: 0, piece: 'q', socket: 1 }] }])
    expect(variant.units[0].pieceIds).toContain(joint)
    expect(variant.units[0].pieceIds).toContain(oldPlate)
    expect(variant.units[0].steps[0].actions).toEqual([])
    expect(variant.assembly[0].actions).toEqual([{ kind: 'port', joint, port: 0, piece: 'q', socket: 1 }])
    expect(() => validateSourceGuide(guide)).not.toThrow()
    reattachPiece(guide, { pieceId: 'p', targetId: joint, targetSlot: 1 })
    expectRegular(piece(guide, 'p'))
    expect(() => validateSourceGuide(guide)).not.toThrow()
  })

  it('deletes pieces and all step references while preserving nonempty units', () => {
    const guide = fixture()
    const joint = attachPiece(guide, { targetId: 'q', targetSlot: 2, partNo: 7 })
    const plate = attachPiece(guide, { targetId: joint, targetSlot: 2, partNo: 2 })
    deletePiece(guide, joint)
    expect(JSON.stringify(guide)).not.toContain(joint)
    expect(() => validateSourceGuide(guide)).not.toThrow()
    deletePiece(guide, plate)
    expect(() => validateSourceGuide(guide)).not.toThrow()
    const before = structuredClone(guide)
    expect(() => deletePiece(guide, 'q')).toThrow('ユニット最後')
    expect(guide).toEqual(before)
  })

  it('rejects deletion of the only piece in an early step', () => {
    const guide = fixture(), variant = active(guide)
    variant.model.pieces.push(square('r')); variant.units[0].pieceIds.push('r')
    variant.units[0].steps.push({ id: 'a2', title: 'A2', visiblePieces: ['p','r'], newPieces: ['r'], actions: [] })
    variant.assembly[0].visiblePieces.push('r')
    const before = structuredClone(guide)
    expect(() => deletePiece(guide, 'p')).toThrow('工程最後')
    expect(guide).toEqual(before)
  })

  it('keeps the metamon guide valid through attach, replace, reattach and delete', () => {
    const guide = metamon(), variant = active(guide)
    const target = variant.model.pieces.find(piece => piece.partNo <= 2 && availableSlots(guide, piece.id).length)
    const slot = availableSlots(guide, target.id)[0].value
    const joint = attachPiece(guide, { targetId: target.id, targetSlot: slot, partNo: 7 })
    const plate = attachPiece(guide, { targetId: joint, targetSlot: 2, partNo: 2 })
    expect(() => validateSourceGuide(guide)).not.toThrow()
    replacePiece(guide, plate, 1)
    reattachPiece(guide, { pieceId: plate, targetId: joint, targetSlot: 1 })
    expect(() => validateSourceGuide(guide)).not.toThrow()
    deletePiece(guide, plate); deletePiece(guide, joint)
    expect(() => validateSourceGuide(guide)).not.toThrow()
    expect(variant.model.pieces).toHaveLength(53)
  })
})


describe('plate front/back editing', () => {
  it.each([1,2])('flips a connected No.%i without changing sockets, steps, or any other part', partNo => {
    const guide = fixture()
    if (partNo === 2) replacePiece(guide, 'p', 2)
    for (const slot of availableSlots(guide, 'p')) attachPiece(guide, { targetId: 'p', targetSlot: slot.value, partNo: 7 })
    const before = structuredClone(guide), originalNormal = [...piece(guide, 'p').pose.normal]
    expect(plateFaceState(guide, 'p').canFlip).toBe(true)
    flipPlate(guide, 'p')
    expect(piece(guide, 'p').pose.normal).toEqual(originalNormal.map(value => -value))
    expect(() => validateSourceGuide(guide)).not.toThrow()
    const restored = structuredClone(guide)
    piece(restored, 'p').pose.normal = originalNormal
    expect(restored).toEqual(before)
    flipPlate(guide, 'p')
    expect(guide).toEqual(before)
  })

  it('rejects joints and invalid face directions without changing any data', () => {
    const guide = fixture(), joint = attachPiece(guide, { targetId:'p', targetSlot:0, partNo:7 })
    let before = structuredClone(guide)
    expect(plateFaceState(guide, joint).canFlip).toBe(false)
    expect(() => flipPlate(guide, joint)).toThrow('No.1')
    expect(guide).toEqual(before)
    for (const normal of [[0,0,0], [1,0,0], [NaN,0,1]]) {
      piece(guide, 'p').pose.normal = normal
      before = structuredClone(guide)
      expect(() => flipPlate(guide, 'p')).toThrow('形状')
      expect(guide).toEqual(before)
    }
  })
})
