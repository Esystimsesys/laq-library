import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateSourceGuide } from './import-assembly.mjs'
import { attachPiece, availableSlots } from '../tools/assembly-review/pieces.js'
import { applyJointOrientation, jointOrientations } from '../tools/assembly-review/orientations.js'

const active = guide => guide.variants[guide.defaultVariant]
const piece = (guide, id) => active(guide).model.pieces.find(piece => piece.id === id)
const stages = guide => [...active(guide).units.flatMap(unit => unit.steps), ...active(guide).assembly]
function fixture(partNo = 7, slots = [2]) {
  const guide = { defaultVariant: 'test', variants: { test: {
    model: { pieces: [{ id: 'p', partNo: 1, color: 'lavender', pose: { vertices: [[0,0,0],[1,0,0],[1,1,0],[0,1,0]], normal: [0,0,1] } }], connections: [] },
    units: [{ id: 'A', quantity: 1, pieceIds: ['p'], steps: [{ id: 'a', title: '組み立てる', visiblePieces: ['p'], newPieces: ['p'], actions: [] }] }], assembly: [], finished: 'A',
  } } }
  const joint = attachPiece(guide, { targetId: 'p', targetSlot: 0, partNo, id: 'j' })
  for (const targetSlot of slots) attachPiece(guide, { targetId: joint, targetSlot, partNo: 1, id: `p${targetSlot}` })
  expect(() => validateSourceGuide(guide)).not.toThrow()
  return guide
}
const fixedParts = guide => structuredClone(active(guide).model.pieces.filter(p => p.id !== 'j'))
const closeVector = (a, b) => b.forEach((value, i) => expect(a[i]).toBeCloseTo(value, 8))
const dot = (a,b) => a.reduce((sum, value, i) => sum+value*b[i], 0)

describe('joint orientation editing with fixed connected plates', () => {
  it.each([[7,[2],2],[7,[1],2],[7,[1,2],1],[7,[],3],[6,[1],1],[6,[],2],[5,[1],1],[5,[],2],[4,[1],1],[4,[],1],[3,[1],1],[3,[],1]])('enumerates distinct physical No.%i orientations with ports %j', (partNo, slots, count) => {
    const guide = fixture(partNo, slots), before = structuredClone(guide)
    const { options } = jointOrientations(guide, 'j')
    expect(options).toHaveLength(count)
    expect(options.filter(option => option.current)).toHaveLength(1)
    expect(new Set(options.map(option => option.id)).size).toBe(count)
    expect(guide).toEqual(before)
    for (const option of options) {
      const changed = structuredClone(guide)
      applyJointOrientation(changed, 'j', option.id)
      expect(fixedParts(changed)).toEqual(fixedParts(guide))
      expect(piece(changed, 'j').pose.center).toEqual(piece(guide, 'j').pose.center)
      expect(() => validateSourceGuide(changed)).not.toThrow()
      expect(jointOrientations(changed, 'j').options.find(candidate => candidate.id === option.id)?.current).toBe(true)
      const applied = structuredClone(changed)
      applyJointOrientation(changed, 'j', option.id)
      expect(changed).toEqual(applied)
    }
  })

  it('changes which arm is free for two perpendicular plates and never maps them to opposite arms', () => {
    const guide = fixture(), before = fixedParts(guide)
    const { options } = jointOrientations(guide, 'j')
    for (const option of options) {
      const [a,b] = option.ports.map(port => option.pose.directions[port.port])
      expect(dot(a,b)).toBeCloseTo(0,8)
      expect(option.ports.map(port => port.port).sort()).not.toEqual([0,1])
    }
    const other = options.find(option => !option.current)
    const free = [0,1,2].find(port => !other.ports.some(connection => connection.port === port))
    closeVector(other.pose.directions[free], [0,0,-1])
    applyJointOrientation(guide, 'j', other.id)
    expect(fixedParts(guide)).toEqual(before)
    expect(jointOrientations(guide, 'j').options.filter(option => option.current)).toHaveLength(1)
  })

  it('flips only the free arm for two opposite plates', () => {
    const guide = fixture(7,[1]), options = jointOrientations(guide, 'j').options
    const freeDirections = options.map(option => option.pose.directions[[0,1,2].find(port => !option.ports.some(connection => connection.port === port))])
    expect(dot(...freeDirections)).toBeCloseTo(-1,8)
    for (const option of options) expect(dot(...option.ports.map(port => option.pose.directions[port.port]))).toBeCloseTo(-1,8)
  })

  it('preserves all metadata and unrelated branches, and remaps assembly actions exactly once', () => {
    const guide = fixture(), variant = active(guide), joint = piece(guide,'j')
    const otherJoint = attachPiece(guide, { targetId: 'p2', targetSlot: 2, partNo: 6 })
    attachPiece(guide, { targetId: otherJoint, targetSlot: 1, partNo: 2 })
    joint.pose.note = 'keep pose note'
    joint.evidence = { source: 'manual' }
    const connection = variant.model.connections[0]
    connection.evidence = { certainty: 'inferred' }
    connection.ports.forEach(port => { port.note = `edge ${port.piece}` })
    const step = variant.units[0].steps[0]
    step.actions.forEach(action => { action.note = `action ${action.piece}` })
    variant.assembly.push({ id: 'finish', title: 'つなぐ', inputs: ['A'], result: 'finished', visiblePieces: [...step.visiblePieces], newPieces: [], actions: [step.actions.splice(1,1)[0]] })
    variant.finished = 'finished'
    expect(() => validateSourceGuide(guide)).not.toThrow()
    const branch = fixedParts(guide), before = structuredClone(guide)
    const option = jointOrientations(guide, 'j').options.find(option => !option.current)
    applyJointOrientation(guide, 'j', option.id)
    expect(fixedParts(guide)).toEqual(branch)
    expect(joint.pose.note).toBe('keep pose note')
    expect(joint.evidence).toEqual({ source: 'manual' })
    expect(connection.evidence).toEqual({ certainty: 'inferred' })
    for (const port of connection.ports) {
      expect(port.note).toBe(`edge ${port.piece}`)
      const actions = stages(guide).flatMap(stage => stage.actions).filter(action => action.joint === 'j' && action.piece === port.piece && action.socket === port.socket)
      expect(actions).toHaveLength(1)
      expect(actions[0].port).toBe(port.port)
      expect(actions[0].note).toBe(`action ${port.piece}`)
    }
    expect(variant.model.connections.slice(1)).toEqual(active(before).model.connections.slice(1))
    const sanitized = structuredClone(guide)
    piece(sanitized,'j').pose = piece(before,'j').pose
    active(sanitized).model.connections[0].ports.forEach((port,i) => { port.port = active(before).model.connections[0].ports[i].port })
    stages(sanitized).forEach((stage,i) => stage.actions.forEach((action,j) => { action.port = stages(before)[i].actions[j].port }))
    expect(sanitized).toEqual(before)
    expect(() => validateSourceGuide(guide)).not.toThrow()
  })

  it('uses the same stable IDs with a reversed, non-unit axis and explicit fork directions', () => {
    const guide = fixture()
    const chosen = jointOrientations(guide,'j').options.find(option => !option.current)
    applyJointOrientation(guide,'j',chosen.id)
    const before = jointOrientations(guide,'j')
    piece(guide,'j').pose.axis = piece(guide,'j').pose.axis.map(value => -3*value)
    const after = jointOrientations(guide,'j')
    expect(after.options.map(option => option.id).sort()).toEqual(before.options.map(option => option.id).sort())
    expect(after.options.find(option => option.current).id).toBe(chosen.id)
  })

  it('repairs contradictory port numbers even when the stored physical fork shape already matches', () => {
    const guide = fixture(), joint = piece(guide,'j')
    joint.pose.directions = { 0:[0,1,0], 1:[0,-1,0], 2:[0,0,1] }
    const originalShape = structuredClone(joint.pose.directions)
    active(guide).model.connections[0].ports[1].port = 1
    stages(guide)[0].actions[1].port = 1
    const { options } = jointOrientations(guide,'j')
    expect(options).toHaveLength(2)
    expect(options.some(option => option.current)).toBe(false)
    const same = options.find(option => Object.values(option.pose.directions).some(dir => dot(dir,[0,-1,0]) > .99))
    applyJointOrientation(guide,'j',same.id)
    expect(active(guide).model.connections[0].ports[1].port).toBe(2)
    expect(stages(guide)[0].actions[1].port).toBe(2)
    Object.keys(originalShape).forEach(port => closeVector(joint.pose.directions[port],originalShape[port]))
    expect(() => validateSourceGuide(guide)).not.toThrow()
    expect(jointOrientations(guide,'j').options.find(option => option.id === same.id).current).toBe(true)
  })

  it.each([
    guide => { piece(guide,'j').pose.center[0] += .01 },
    guide => { piece(guide,'j').pose.axis = [0,1,0] },
    guide => { piece(guide,'j').pose.axis = [0,0,0] },
    guide => { piece(guide,'p').pose.vertices[0][0] = NaN },
    guide => { active(guide).model.connections[0].ports[1].port = 0 },
    guide => { active(guide).model.connections[0].ports[1].socket = 99 },
    guide => { active(guide).model.connections[0].ports.push({ ...active(guide).model.connections[0].ports[0], port: 1 }) },
    guide => { active(guide).model.connections.push({ joint: 'another', ports: [{ piece:'p',socket:0,port:0 }] }) },
    guide => { piece(guide,'j').pose.directions[0] = [0,0,0] },
  ])('rejects contradictory or detached geometry without mutation %#', corrupt => {
    const guide = fixture(), optionId = jointOrientations(guide,'j').options.find(option => !option.current).id
    corrupt(guide)
    const before = structuredClone(guide)
    expect(jointOrientations(guide,'j').options).toEqual([])
    expect(() => applyJointOrientation(guide,'j',optionId)).toThrow()
    expect(guide).toEqual(before)
  })

  it('rejects missing or duplicate matching actions atomically and ignores caller-supplied poses', () => {
    for (const duplicate of [false,true]) {
      const guide = fixture(), option = jointOrientations(guide,'j').options.find(option => !option.current)
      const actions = stages(guide)[0].actions
      if (duplicate) actions.push(structuredClone(actions[0]))
      else actions.pop()
      const before = structuredClone(guide)
      expect(() => applyJointOrientation(guide,'j',option.id)).toThrow('工程')
      expect(guide).toEqual(before)
    }
    const guide = fixture(), option = jointOrientations(guide,'j').options.find(option => !option.current)
    option.pose.center = [999,999,999]
    option.ports[0].port = 99
    applyJointOrientation(guide,'j',option.id)
    expect(piece(guide,'j').pose.center).toEqual([.5,-.1,0])
    expect(() => validateSourceGuide(guide)).not.toThrow()
    const before = structuredClone(guide)
    expect(() => applyJointOrientation(guide,'j','forged')).toThrow()
    expect(guide).toEqual(before)
  })

  it('explains unsupported pieces and joints with no connections', () => {
    const guide = fixture()
    for (const id of ['p','missing']) expect(jointOrientations(guide,id)).toMatchObject({options:[],reason:expect.any(String)})
    active(guide).model.connections = []
    expect(jointOrientations(guide,'j')).toMatchObject({options:[],reason:expect.stringContaining('接続')})
  })

  it('keeps a real metamon source valid while switching an attached joint and preserving every existing piece', () => {
    const guide = JSON.parse(readFileSync(new URL('../public/assemblies/metamon/guide.json',import.meta.url),'utf8'))
    const original = structuredClone(active(guide).model.pieces)
    const target = original.find(piece => piece.partNo <= 2 && availableSlots(guide,piece.id).length)
    attachPiece(guide,{targetId:target.id,targetSlot:availableSlots(guide,target.id)[0].value,partNo:7,id:'j'})
    attachPiece(guide,{targetId:'j',targetSlot:2,partNo:2,id:'added-plate'})
    const option = jointOrientations(guide,'j').options.find(option => !option.current)
    expect(option).toBeDefined()
    applyJointOrientation(guide,'j',option.id)
    expect(() => validateSourceGuide(guide)).not.toThrow()
    expect(active(guide).model.pieces.filter(p => original.some(old => old.id === p.id))).toEqual(original)
  })

  it('switches existing two-plate No.7 joints in desukan without moving any other piece', () => {
    const source = JSON.parse(readFileSync(new URL('../public/assemblies/desukan/guide.json',import.meta.url),'utf8'))
    const targets = active(source).model.pieces.filter(p => p.partNo === 7 && active(source).model.connections.filter(c => c.joint === p.id).flatMap(c => c.ports).length === 2)
    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) {
      const guide = structuredClone(source), before = structuredClone(active(guide).model.pieces.filter(p => p.id !== target.id))
      const options = jointOrientations(guide,target.id).options
      expect(options).toHaveLength(2)
      const option = options.find(option => !option.current)
      applyJointOrientation(guide,target.id,option.id)
      expect(active(guide).model.pieces.filter(p => p.id !== target.id)).toEqual(before)
      expect(() => validateSourceGuide(guide)).not.toThrow()
      expect(jointOrientations(guide,target.id).options.find(candidate => candidate.id === option.id).current).toBe(true)
    }
  })
})
