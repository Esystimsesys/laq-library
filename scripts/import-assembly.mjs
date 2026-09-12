import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const check = (condition, message) => { if (!condition) throw new Error(message) }
const text = (value) => typeof value === 'string' && value.trim().length > 0
const array = (value, label, allowEmpty = false) => {
  check(Array.isArray(value) && (allowEmpty || value.length > 0), `${label}: expected ${allowEmpty ? 'an' : 'a nonempty'} array`)
  return value
}
const ids = (values, allowed, label, allowEmpty = false) => {
  array(values, label, allowEmpty)
  check(new Set(values).size === values.length, `${label}: duplicate reference`)
  for (const id of values) check(text(id) && allowed.has(id), `${label}: unknown reference ${id}`)
  return new Set(values)
}
const same = (a, b) => a.size === b.size && [...a].every((id) => b.has(id))
const vector = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)
const portKey = (a) => `${a.joint}:${a.port}:${a.piece}:${a.socket}`
const stages = (variant) => new Map([
  ...variant.units.flatMap((unit) => unit.steps.map((stage, index) => [`unit:${unit.id}:${index}`, { stage, unit, index }])),
  ...variant.assembly.map((stage, index) => [`assembly:${index}`, { stage }]),
])

/** Display families share a letter; all other builds and merges use the next letter. */
export function displayLabels(variant, sequence, families = []) {
  const byKey = stages(variant), groups = new Set([...variant.units.map(u => u.id), ...variant.assembly.map(s => s.result)])
  const familyById = new Map(), labels = {}, letters = new Map()
  for (const family of array(families, 'labelFamilies', true)) {
    const members = ids(family, groups, 'labelFamilies members')
    check(members.size > 1, 'labelFamilies: a family needs at least two groups')
    for (const id of members) {
      check(!familyById.has(id), `labelFamilies: duplicate group ${id}`)
      familyById.set(id, family)
    }
  }
  const letter = index => {
    let result = ''
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result
    return result
  }
  for (const key of sequence) {
    const { unit, stage } = byKey.get(key), id = unit?.id ?? stage.result
    const family = familyById.get(id) ?? id
    if (!letters.has(family)) letters.set(family, letter(letters.size))
    labels[id] = `${letters.get(family)}${Array.isArray(family) ? family.indexOf(id) + 1 : 1}`
  }
  return labels
}

/** Validate the displayed order, including builds completed before a group is consumed. */
export function validateSequence(variant, sequence) {
  const byKey = stages(variant)
  ids(sequence, byKey, 'sequence')
  check(sequence.length === byKey.size, 'sequence: must include every step exactly once')
  const nextUnitStep = new Map()
  const available = new Set()
  for (const key of sequence) {
    const { stage, unit, index } = byKey.get(key)
    if (unit) {
      check(index === (nextUnitStep.get(unit.id) ?? 0), `sequence: ${key} is out of unit step order`)
      nextUnitStep.set(unit.id, index + 1)
      if (index === unit.steps.length - 1) available.add(unit.id)
    } else {
      for (const input of stage.inputs) check(available.has(input), `sequence: ${key} needs unbuilt or consumed group ${input}`)
      for (const input of stage.inputs) available.delete(input)
      available.add(stage.result)
    }
  }
  check(available.size === 1 && available.has(variant.finished), 'sequence: finished must be the final remaining group')
  return sequence
}

/** Validate the actual graph and steps, without trusting the prototype's verification flags. */
export function validateGuide(guide) {
  check(text(guide?.defaultVariant), 'defaultVariant is required')
  const variant = guide.variants?.[guide.defaultVariant]
  check(variant && typeof variant === 'object', 'defaultVariant does not exist')
  const pieces = array(variant.model?.pieces, 'model.pieces')
  const pieceMap = new Map()
  for (const piece of pieces) {
    check(text(piece.id) && !pieceMap.has(piece.id), `invalid or duplicate piece: ${piece.id}`)
    check(Number.isInteger(piece.partNo) && piece.partNo >= 1 && piece.partNo <= 7, `${piece.id}: invalid partNo`)
    const pose = piece.pose
    check(pose && (piece.partNo <= 2
      ? Array.isArray(pose.vertices) && pose.vertices.length === (piece.partNo === 1 ? 4 : 3) && pose.vertices.every(vector) && vector(pose.normal)
      : vector(pose.center) && vector(pose.axis)), `${piece.id}: invalid geometry`)
    pieceMap.set(piece.id, piece)
  }
  const connections = new Set()
  const sockets = new Set()
  const ports = new Set()
  for (const connection of array(variant.model.connections, 'model.connections', true)) {
    const joint = pieceMap.get(connection.joint)
    check(joint && joint.partNo >= 3, `connection: unknown joint ${connection.joint}`)
    for (const port of array(connection.ports, `${connection.joint}.ports`)) {
      const piece = pieceMap.get(port.piece)
      check(piece && piece.partNo <= 2, `connection: unknown plate ${port.piece}`)
      check(Number.isInteger(port.port) && port.port >= 0 && port.port < ([5, 7].includes(joint.partNo) ? 3 : 2), 'connection: invalid port')
      check(Number.isInteger(port.socket) && port.socket >= 0 && port.socket < piece.pose.vertices.length, 'connection: invalid socket')
      const pk = `${joint.id}:${port.port}`
      const sk = `${piece.id}:${port.socket}`
      check(!ports.has(pk) && !sockets.has(sk), 'connection: duplicate port/socket')
      ports.add(pk); sockets.add(sk)
      connections.add(portKey({ joint: joint.id, ...port }))
    }
  }
  const usedConnections = new Set()
  const stepIds = new Set()
  function step(stage, allowed) {
    check(text(stage.id) && !stepIds.has(stage.id), `invalid or duplicate step: ${stage.id}`)
    stepIds.add(stage.id)
    check(text(stage.title), `${stage.id}: title is required`)
    const visible = ids(stage.visiblePieces, allowed, `${stage.id}.visiblePieces`)
    ids(stage.newPieces, visible, `${stage.id}.newPieces`, true)
    for (const action of array(stage.actions, `${stage.id}.actions`, true)) {
      check(action.kind === 'port', `${stage.id}: unsupported action kind`)
      check(visible.has(action.joint) && visible.has(action.piece), `${stage.id}: action references invisible piece`)
      const key = portKey(action)
      check(connections.has(key), `${stage.id}: action does not match a connection`)
      check(!usedConnections.has(key), `${stage.id}: duplicate action`)
      usedConnections.add(key)
    }
    return visible
  }
  const groups = new Map()
  const owned = new Set()
  for (const unit of array(variant.units, 'units')) {
    check(text(unit.id) && !groups.has(unit.id), `invalid or duplicate unit: ${unit.id}`)
    check(Number.isInteger(unit.quantity) && unit.quantity > 0, `${unit.id}: invalid quantity`)
    const unitPieces = ids(unit.pieceIds, pieceMap, `${unit.id}.pieceIds`)
    for (const id of unitPieces) { check(!owned.has(id), `piece owned twice: ${id}`); owned.add(id) }
    let previous = new Set()
    for (const stage of array(unit.steps, `${unit.id}.steps`)) {
      const visible = step(stage, unitPieces)
      check([...previous].every((id) => visible.has(id)), `${stage.id}: removes an earlier piece`)
      check(same(new Set(stage.newPieces), new Set([...visible].filter((id) => !previous.has(id)))), `${stage.id}: newPieces mismatch`)
      previous = visible
    }
    check(same(previous, unitPieces), `${unit.id}: final step does not contain all unit pieces`)
    groups.set(unit.id, unitPieces)
  }
  check(same(owned, new Set(pieceMap.keys())), 'units do not own every piece exactly once')
  const available = new Set(groups.keys())
  for (const stage of array(variant.assembly, 'assembly', true)) {
    const inputs = ids(stage.inputs, available, `${stage.id}.inputs`)
    check(text(stage.result) && !groups.has(stage.result), `${stage.id}: invalid or duplicate result`)
    const union = new Set([...inputs].flatMap((id) => [...groups.get(id)]))
    const visible = step(stage, pieceMap)
    check(same(visible, union), `${stage.id}: visiblePieces does not match inputs`)
    const added = new Set(stage.inputs.slice(1).flatMap((id) => [...groups.get(id)]))
    check(same(new Set(stage.newPieces), added), `${stage.id}: newPieces does not match added inputs`)
    for (const id of inputs) available.delete(id)
    groups.set(stage.result, union); available.add(stage.result)
  }
  check(available.size === 1 && available.has(variant.finished), 'finished must identify the final remaining unit')
  check(same(groups.get(variant.finished), owned), 'finished does not contain every piece')
  check(same(usedConnections, connections), 'actions do not cover every connection exactly once')
  for (const [alias, target] of Object.entries(variant.unitAliases ?? {})) {
    check(!groups.has(alias) && variant.units.some((unit) => unit.id === target), `invalid unit alias: ${alias}`)
  }
  if (guide.sequence !== undefined) validateSequence(variant, guide.sequence)
  return variant
}

/** Validate finalized source presentation too; shared by local review and source-reading import. */
export function validateSourceGuide(guide) {
  const variant = validateGuide(guide)
  const record = (value, label) => check(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const byKey = stages(variant), unitIds = new Set(variant.units.map(unit => unit.id))
  const reading = guide.reading
  if (reading !== undefined) {
    record(reading, 'reading')
    for (const field of ['unitNames', 'steps']) if (reading[field] !== undefined) record(reading[field], `reading.${field}`)
    for (const [id, label] of Object.entries(reading.unitNames ?? {})) check(unitIds.has(id) && text(label), `invalid reading unit: ${id}`)
    ids(reading.combineUnits ?? [], unitIds, 'reading.combineUnits', true)
    for (const [key, copy] of Object.entries(reading.steps ?? {})) check(byKey.has(key) && text(copy?.title) && text(copy?.description), `invalid reading step: ${key}`)
    if (reading.sequence !== undefined) validateSequence(variant, reading.sequence)
  }
  const sequence = guide.sequence ?? reading?.sequence ?? [...byKey.keys()]
  validateSequence(variant, sequence)
  const labels = displayLabels(variant, sequence, reading?.labelFamilies)
  if (guide.displayLabels !== undefined) {
    record(guide.displayLabels, 'displayLabels')
    for (const [id, label] of Object.entries(guide.displayLabels)) check(Object.hasOwn(labels, id) && text(label), `invalid display label: ${id}`)
  }
  if (guide.legacyAtKeys !== undefined) {
    const known = new Set(['welcome', 'parts', 'done', ...byKey.keys()])
    for (const key of array(guide.legacyAtKeys, 'legacyAtKeys')) check(known.has(key), `legacyAtKeys: unknown reference ${key}`)
  }
  const copies = [...byKey.values()].map(value => value.stage).concat(Object.values(reading?.steps ?? {}))
  for (const unit of variant.units) if (unit.label !== undefined) {
    check(text(unit.label), `invalid unit label: ${unit.id}`)
    copies.push({ title: unit.label })
  }
  for (const title of Object.values(reading?.unitNames ?? {})) copies.push({ title })
  for (const copy of copies) {
    if (copy.description !== undefined) check(typeof copy.description === 'string', 'step description must be a string')
    for (const match of `${copy.title ?? ''} ${copy.description ?? ''}`.matchAll(/\{\{([^}]+)\}\}/g)) check(Object.hasOwn(labels, match[1]), `unknown display reference: ${match[1]}`)
  }
  return variant
}

export function importAssembly({ source, name = 'metamon', modelId, title, article, revision, root = projectRoot, updateRuntime = false, useSourceReading = false }) {
  check(text(source), '--source is required')
  check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name), '--name must be a lowercase slug')
  source = path.resolve(source)
  const sourceGuide = readJson(path.join(source, 'models', name, 'unit-guide.json'))
  const variant = useSourceReading ? validateSourceGuide(sourceGuide) : validateGuide(sourceGuide)
  const library = readdirSync(path.join(root, 'src/data/sources')).filter((f) => f.endsWith('.json'))
    .flatMap((file) => { const data = readJson(path.join(root, 'src/data/sources', file)); return data.models ?? [] })
  const trialPath = path.join(source, 'models', name, `${name}-trial.json`)
  const trial = existsSync(trialPath) ? readJson(trialPath) : {}
  article ??= trial.article ?? sourceGuide.article
  const model = modelId ? library.find((m) => m.id === modelId)
    : library.find((m) => m.sourceUrl === article) ?? library.find((m) => m.id === `purimatu:${name}`)
  check(model, 'Cannot find library model; provide --model-id for an existing model')
  modelId = model.id
  title ??= model.title
  article ??= model.sourceUrl
  check(text(title), 'title is required')
  check(/^https?:\/\//.test(article), 'article must be an HTTP(S) URL')
  const manifestPath = path.join(root, 'src/data/assemblies.json')
  const manifest = existsSync(manifestPath) ? readJson(manifestPath) : []
  array(manifest, 'assemblies manifest', true)
  check(new Set(manifest.map((entry) => entry.id)).size === manifest.length, 'duplicate manifest IDs')
  const previous = manifest.find((entry) => entry.id === name)
  revision ??= previous?.revision ?? 1
  check(Number.isInteger(revision) && revision > 0, 'revision must be a positive integer')
  const guide = { ...sourceGuide, name, displayName: title, article, photos: [], limits: [], variants: { [sourceGuide.defaultVariant]: variant } }
  delete guide.reading
  delete guide.legacyAtKeys
  const originalKeys = [...stages(variant).keys()]
  if (sourceGuide.verification) guide.verification = { ...sourceGuide.verification, variantCount: 1, variants: { [sourceGuide.defaultVariant]: variant.verification } }
  const readingPath = path.join(root, 'content/assemblies', `${name}.json`)
  const selectedReading = useSourceReading ? sourceGuide.reading : existsSync(readingPath) ? readJson(readingPath) : undefined
  if (selectedReading !== undefined) {
    const reading = structuredClone(selectedReading)
    // Per-step copy is no longer published; the app labels every diagram with only its group name.
    delete reading.steps
    check(reading && typeof reading === 'object' && !Array.isArray(reading), 'reading must be an object')
    if (reading.unitNames !== undefined) check(reading.unitNames && typeof reading.unitNames === 'object' && !Array.isArray(reading.unitNames), 'reading.unitNames must be an object')
    for (const [id, label] of Object.entries(reading.unitNames ?? {})) check(variant.units.some((unit) => unit.id === id) && text(label), `invalid reading unit: ${id}`)
    const combined = ids(reading.combineUnits ?? [], new Set(variant.units.map((unit) => unit.id)), 'reading.combineUnits', true)
    for (const unit of variant.units) {
      // A reviewed source already contains its final steps. Do not reapply its historical combineUnits.
      if (useSourceReading || !combined.has(unit.id)) continue
      const final = unit.steps.at(-1)
      unit.steps = [{
        ...unit.steps[0],
        title: unit.label ?? unit.steps[0].title,
        description: 'すべての パーツを、図と おなじ かたちに つなげよう。',
        presentation: 'overview',
        visiblePieces: [...final.visiblePieces],
        newPieces: [...final.visiblePieces],
        actions: unit.steps.flatMap((stage) => stage.actions),
      }]
    }
    guide.reading = reading
    guide.legacyAtKeys = ['welcome', 'parts', ...originalKeys.map((key) => {
      const [kind, id] = key.split(':')
      return kind === 'unit' && combined.has(id) ? `unit:${id}:0` : key
    }), 'done']
  }
  if (useSourceReading && sourceGuide.legacyAtKeys !== undefined) {
    const known = new Set(['welcome', 'parts', 'done', ...stages(variant).keys()])
    array(sourceGuide.legacyAtKeys, 'legacyAtKeys')
    for (const key of sourceGuide.legacyAtKeys) check(known.has(key), `legacyAtKeys: unknown reference ${key}`)
    guide.legacyAtKeys = sourceGuide.legacyAtKeys
  }
  guide.legacyAtKeys ??= ['welcome', 'parts', ...originalKeys, 'done']
  if (useSourceReading && guide.reading?.sequence !== undefined) validateSequence(variant, guide.reading.sequence)
  guide.sequence = useSourceReading && sourceGuide.sequence !== undefined ? sourceGuide.sequence
    : guide.reading?.sequence === undefined ? [...stages(variant).keys()] : guide.reading.sequence
  validateGuide(guide)
  guide.displayLabels = displayLabels(variant, guide.sequence, guide.reading?.labelFamilies)
  // Prototype stage counts describe the pre-combination guide, not this import.
  if (!useSourceReading && guide.reading?.combineUnits?.length) {
    if (guide.verification) { guide.sourceVerification = guide.verification; delete guide.verification }
    if (variant.verification) { variant.sourceVerification = variant.verification; delete variant.verification }
    guide.importVerification = { unitStepCount: variant.units.reduce((n, u) => n + u.steps.length, 0), assemblyStepCount: variant.assembly.length, sequenceStepCount: guide.sequence.length, sequenceDependenciesValidated: true }
  }
  const entry = { id: name, modelId, title, revision, defaultVariant: guide.defaultVariant, unitCount: variant.units.length, pieceCount: variant.model.pieces.length, guidePath: `assemblies/${name}/guide.json` }
  const nextManifest = previous ? manifest.map((item) => item.id === name ? entry : item) : [...manifest, entry]
  const files = [[path.join(root, 'public', entry.guidePath), JSON.stringify(guide, null, 2) + '\n'], [manifestPath, JSON.stringify(nextManifest, null, 2) + '\n']]
  const runtime = [
    ['three.min.js', 'vendor/three.min.js'],
    ['models/metamon/realistic-parts.js', 'viewer/realistic-parts.js'],
    ['models/unit-instructions.js', 'viewer/unit-instructions.js'],
    ['models/unit-instructions.css', 'viewer/unit-instructions.css'],
  ]
  for (const [input, output] of runtime) {
    const target = path.join(root, 'public/assemblies', output)
    if (updateRuntime || !existsSync(target)) {
      const bytes = readFileSync(path.join(source, input))
      if (input === 'three.min.js') check(bytes.toString().includes('SPDX-License-Identifier: MIT') && bytes.toString().includes('Copyright 2010-2023 Three.js Authors'), 'Unrecognized Three.js license; review before importing')
      files.push([target, bytes])
    }
  }
  const licenseTarget = path.join(root, 'public/assemblies/vendor/three.LICENSE.txt')
  if (!existsSync(licenseTarget)) files.push([licenseTarget, readFileSync(path.join(projectRoot, 'public/assemblies/vendor/three.LICENSE.txt'))])
  // All source data, references, metadata and needed runtime files are checked before any writes.
  for (const [file, bytes] of files) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes) }
  return entry
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { source: { type: 'string' }, name: { type: 'string', default: 'metamon' }, 'model-id': { type: 'string' }, title: { type: 'string' }, article: { type: 'string' }, revision: { type: 'string' }, 'update-runtime': { type: 'boolean', default: false }, 'use-source-reading': { type: 'boolean', default: false } } })
    const result = importAssembly({ source: values.source, name: values.name, modelId: values['model-id'], title: values.title, article: values.article, revision: values.revision === undefined ? undefined : Number(values.revision), updateRuntime: values['update-runtime'], useSourceReading: values['use-source-reading'] })
    console.log(`Imported ${result.id}: ${result.unitCount} units, ${result.pieceCount} pieces → ${result.guidePath}`)
  } catch (error) { console.error(`Assembly import failed: ${error.message}`); process.exitCode = 1 }
}
