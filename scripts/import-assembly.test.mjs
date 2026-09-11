import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { displayLabels, importAssembly, validateGuide, validateSequence } from './import-assembly.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => JSON.parse(readFileSync(file, 'utf8'))
const fixture = read(path.join(root, 'public/assemblies/metamon/guide.json'))
const clone = () => structuredClone(fixture)
const active = (guide) => guide.variants[guide.defaultVariant]
const readingConfig = read(path.join(root, 'content/assemblies/metamon.json'))
const defaultSequence = (variant) => [
  ...variant.units.flatMap((unit) => unit.steps.map((_, index) => `unit:${unit.id}:${index}`)),
  ...variant.assembly.map((_, index) => `assembly:${index}`),
]
// Recreate the prototype's two-step bump build from the public, combined fixture.
function originalSource() {
  const guide = clone()
  delete guide.reading; delete guide.sequence; delete guide.legacyAtKeys
  for (const unit of active(guide).units.filter((unit) => ['C1', 'C2'].includes(unit.id))) {
    if (unit.steps.length > 1) continue
    const final = unit.steps[0]
    const front = `bump-${unit.id === 'C1' ? 'left' : 'right'}-front`
    const openPieces = final.visiblePieces.filter((id) => id !== front)
    unit.steps = [
      { ...final, visiblePieces: openPieces, newPieces: openPieces, actions: final.actions.filter((action) => action.piece !== front) },
      { ...final, id: `${unit.id}-2`, presentation: 'join', newPieces: [front], actions: final.actions.filter((action) => action.piece === front) },
    ]
  }
  return guide
}
const temporary = []
const put = (file, data) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data)) }
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function sandbox(guide = clone()) {
  const dir = mkdtempSync(path.join(tmpdir(), 'laq-assembly-')); temporary.push(dir)
  const source = path.join(dir, 'source'); const root = path.join(dir, 'library')
  put(path.join(source, 'models/metamon/unit-guide.json'), guide)
  put(path.join(source, 'models/metamon/metamon-trial.json'), { article: 'https://purimatu.com/metamon/' })
  put(path.join(root, 'src/data/sources/purimatu.json'), { models: [{ id: 'purimatu:metamon', title: 'メタモン', sourceUrl: 'https://purimatu.com/metamon/' }] })
  for (const file of ['vendor/three.min.js', 'viewer/realistic-parts.js', 'viewer/unit-instructions.js', 'viewer/unit-instructions.css']) put(path.join(root, 'public/assemblies', file), 'locally maintained runtime')
  return { root, source }
}

describe('assembly data validation', () => {
  it('retains the 53-piece default metamon geometry with 17 displayed steps', () => {
    const variant = validateGuide(fixture)
    expect(Object.keys(fixture.variants)).toEqual(['gap-hands-4-3-core-3'])
    expect(variant.model.pieces).toHaveLength(53)
    expect(variant.units).toHaveLength(9)
    expect(variant.units.flatMap((unit) => unit.steps)).toHaveLength(9)
    expect(variant.assembly).toHaveLength(8)
    expect(fixture.sequence).toEqual(readingConfig.sequence)
    expect(fixture.legacyAtKeys[19]).toBe('assembly:6')
  })

  it('rejects out-of-order unit steps and reused groups in a sequence', () => {
    const variant = active(originalSource())
    const sequence = defaultSequence(variant)
    const first = sequence.indexOf('unit:C1:0')
    ;[sequence[first], sequence[first + 1]] = [sequence[first + 1], sequence[first]]
    expect(() => validateSequence(variant, sequence)).toThrow(/unit step order/)
    variant.assembly[1].inputs[0] = 'A1'
    expect(() => validateSequence(variant, defaultSequence(variant))).toThrow(/consumed group A1/)
  })

  it.each([
    ['null sequence', (reading) => { reading.sequence = null }],
    ['missing default', (g) => { g.defaultVariant = 'missing' }],
    ['duplicate piece', (g) => { active(g).model.pieces.push(active(g).model.pieces[0]) }],
    ['invalid geometry', (g) => { active(g).model.pieces[0].pose.vertices[0][0] = null }],
    ['unknown owned piece', (g) => { active(g).units[0].pieceIds[0] = 'missing' }],
    ['duplicate ownership', (g) => { active(g).units[1].pieceIds.push(active(g).units[0].pieceIds[0]) }],
    ['missing steps', (g) => { active(g).units[0].steps = [] }],
    ['unknown visible piece', (g) => { active(g).units[0].steps[0].visiblePieces.push('missing') }],
    ['incorrect additions', (g) => { active(g).units[0].steps[0].newPieces = [] }],
    ['invalid port', (g) => { active(g).model.connections[0].ports[0].port = 99 }],
    ['incorrect action port', (g) => { active(g).units[0].steps[0].actions[0].port = 99 }],
    ['missing actions', (g) => { active(g).units[0].steps[0].actions = [] }],
    ['duplicate actions', (g) => { const s = active(g).units[0].steps[0]; s.actions.push(s.actions[0]) }],
    ['future assembly input', (g) => { active(g).assembly[0].inputs[0] = 'M8' }],
    ['reused assembly input', (g) => { active(g).assembly[1].inputs[0] = 'A1' }],
    ['incomplete assembly result', (g) => { active(g).assembly[0].visiblePieces.pop() }],
    ['incorrect finished reference', (g) => { active(g).finished = 'M7' }],
    ['invalid alias', (g) => { active(g).unitAliases.bad = 'missing' }],
  ])('rejects %s', (_, corrupt) => {
    const guide = clone(); corrupt(guide)
    expect(() => validateGuide(guide)).toThrow()
  })
})

describe('assembly importing', () => {
  it('selects only default variant, preserves geometry/actions, merges reading, and keeps other manifest entries and viewer edits', () => {
    const guide = clone()
    guide.variants.unselected = { invalid: 'not exported' }
    const options = sandbox(guide)
    const other = { id: 'other', modelId: 'other:model', revision: 3 }
    put(path.join(options.root, 'src/data/assemblies.json'), [other])
    const reading = { unitNames: { A1: 'まえの からだ' }, steps: { 'unit:A1:0': { title: 'ならべよう', description: 'ずと おなじに しよう' } } }
    put(path.join(options.root, 'content/assemblies/metamon.json'), reading)
    const result = importAssembly(options)
    const output = read(path.join(options.root, 'public/assemblies/metamon/guide.json'))
    expect(output.variants).toEqual({ [guide.defaultVariant]: active(guide) })
    expect(output.reading).toEqual(reading)
    expect(output.sequence).toEqual(defaultSequence(active(guide)))
    expect(output).toMatchObject({ name: 'metamon', displayName: 'メタモン', article: 'https://purimatu.com/metamon/', photos: [], limits: [] })
    expect(read(path.join(options.root, 'src/data/assemblies.json'))).toEqual([other, result])
    importAssembly(options)
    expect(read(path.join(options.root, 'src/data/assemblies.json'))).toEqual([other, result])
    expect(readFileSync(path.join(options.root, 'public/assemblies/viewer/unit-instructions.js'), 'utf8')).toBe('locally maintained runtime')
  })

  it('reproduces combined bumps and the interleaved guide on every import', () => {
    const source = originalSource()
    const options = sandbox(source)
    put(path.join(options.root, 'content/assemblies/metamon.json'), readingConfig)
    const result = importAssembly({ ...options, revision: 2 })
    const outputPath = path.join(options.root, 'public/assemblies/metamon/guide.json')
    const output = read(outputPath)
    const variant = active(output)
    expect(result.revision).toBe(2)
    expect(variant.model).toEqual(active(source).model)
    expect(variant.assembly).toEqual(active(source).assembly)
    expect(output.sequence).toEqual(readingConfig.sequence)
    expect(output.legacyAtKeys).toEqual(['welcome', 'parts', ...defaultSequence(active(source)).map((key) => key.replace(/^(unit:C[12]):1$/, '$1:0')), 'done'])
    for (const unit of variant.units) {
      const original = active(source).units.find((item) => item.id === unit.id)
      if (!['C1', 'C2'].includes(unit.id)) {
        expect(unit).toEqual(original)
        continue
      }
      expect(unit.steps).toHaveLength(1)
      expect(unit.steps[0]).toMatchObject({ presentation: 'overview', visiblePieces: original.steps.at(-1).visiblePieces, newPieces: original.steps.at(-1).visiblePieces, actions: original.steps.flatMap((step) => step.actions) })
    }
    importAssembly(options)
    expect(read(outputPath)).toEqual(output)
    expect(read(path.join(options.root, 'src/data/assemblies.json'))[0].revision).toBe(2)
    expect(readFileSync(path.join(options.root, 'public/assemblies/viewer/unit-instructions.js'), 'utf8')).toBe('locally maintained runtime')
  })

  it.each([
    ['unknown step', (reading) => { reading.sequence[0] = 'unit:missing:0' }],
    ['duplicate step', (reading) => { reading.sequence[1] = reading.sequence[0] }],
    ['missing step', (reading) => { reading.sequence.pop() }],
    ['merge before build', (reading) => { [reading.sequence[0], reading.sequence[2]] = [reading.sequence[2], reading.sequence[0]] }],
    ['unknown combined unit', (reading) => { reading.combineUnits.push('missing') }],
    ['obsolete combined step copy', (reading) => { reading.steps['unit:C1:1'] = reading.steps['unit:C1:0'] }],
  ])('rejects %s before changing guide or manifest', (_, corrupt) => {
    const options = sandbox(originalSource())
    const reading = structuredClone(readingConfig); corrupt(reading)
    put(path.join(options.root, 'content/assemblies/metamon.json'), reading)
    const manifestPath = path.join(options.root, 'src/data/assemblies.json')
    const guidePath = path.join(options.root, 'public/assemblies/metamon/guide.json')
    put(manifestPath, '[]\n'); put(guidePath, 'original\n')
    expect(() => importAssembly(options)).toThrow()
    expect(readFileSync(manifestPath, 'utf8')).toBe('[]\n')
    expect(readFileSync(guidePath, 'utf8')).toBe('original\n')
  })

  it('rejects malformed source without changing existing guide or manifest', () => {
    const guide = clone(); active(guide).assembly[0].inputs = ['missing']
    const options = sandbox(guide)
    const manifestPath = path.join(options.root, 'src/data/assemblies.json')
    const guidePath = path.join(options.root, 'public/assemblies/metamon/guide.json')
    put(manifestPath, '[]\n'); put(guidePath, 'original\n')
    expect(() => importAssembly(options)).toThrow(/reference/)
    expect(readFileSync(manifestPath, 'utf8')).toBe('[]\n')
    expect(readFileSync(guidePath, 'utf8')).toBe('original\n')
  })

  it('supports another model name, model association and revision', () => {
    const options = sandbox()
    put(path.join(options.source, 'models/another/unit-guide.json'), clone())
    const result = importAssembly({ ...options, name: 'another', modelId: 'purimatu:metamon', title: 'べつの がいど', revision: 2 })
    expect(result).toMatchObject({ id: 'another', modelId: 'purimatu:metamon', title: 'べつの がいど', revision: 2, guidePath: 'assemblies/another/guide.json' })
  })
})

describe('display group labels', () => {
  it('numbers all builds and merges in one namespace, retaining paired families', () => {
    const labels=displayLabels(active(fixture),fixture.sequence,readingConfig.labelFamilies)
    expect(labels).toMatchObject({A1:'A1',A2:'B1',M1:'C1',B1:'D1',E1:'F1',E2:'F2',C1:'I1',C2:'I2',D1:'L1',D2:'L2',M8:'N1'})
    expect(new Set(Object.values(labels)).size).toBe(17)
  })
  it('continues past Z without reusing a label', () => {
    const units=Array.from({length:28},(_,i)=>({id:`group-${i}`,steps:[{}]}))
    const labels=displayLabels({units,assembly:[]},units.map(u=>`unit:${u.id}:0`))
    expect(labels['group-26']).toBe('AA1')
    expect(labels['group-27']).toBe('AB1')
  })
  it('rejects unknown and overlapping family members', () => {
    expect(()=>displayLabels(active(fixture),fixture.sequence,[['C1','missing']])).toThrow('unknown reference')
    expect(()=>displayLabels(active(fixture),fixture.sequence,[['C1','C2'],['C1','D1']])).toThrow('duplicate group')
  })
})
