// Editing uses the viewer's normalized coordinates: one plate edge is 17 mm.
const add = (a, b) => a.map((x, i) => x + b[i])
const sub = (a, b) => a.map((x, i) => x - b[i])
const scale = (a, n) => a.map(x => x * n)
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0)
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
const mean = points => scale(points.reduce(add, [0, 0, 0]), 1 / points.length)
function normalize(v) {
  const length = Math.hypot(...v)
  if (!Number.isFinite(length) || length < 1e-9) throw new Error('パーツの向きを計算できません。形状を確認してください。')
  return scale(v, 1 / length)
}
const project = (v, axis) => normalize(sub(v, scale(axis, dot(v, axis))))
const rotate = (v, axis, angle) => add(add(scale(v, Math.cos(angle)), scale(cross(axis, v), Math.sin(angle))), scale(axis, dot(axis, v) * (1 - Math.cos(angle))))
const variantOf = guide => guide.variants[guide.defaultVariant]
const stagesOf = variant => [...variant.units.flatMap(unit => unit.steps), ...variant.assembly]
const isPlate = piece => piece.partNo <= 2
// No.5 has two physical forks; the legacy source validator also accepts port 2.
const isShaft = piece => piece.partNo === 'mini-shaft'
const isWheel = piece => piece.partNo === 'mini-wheel'
export const WHEEL_CENTER_OFFSET = .32
export const partLabel = no => no === 'mini-shaft' ? 'ミニシャフト' : no === 'mini-wheel' ? 'ミニホイール' : `No.${no}`
const slotCount = partNo => partNo === 'mini-shaft' ? 4 : partNo === 'mini-wheel' ? 1 : partNo === 1 ? 4 : partNo === 2 || partNo === 7 ? 3 : 2
const inset = partNo => partNo === 4 ? .195 : partNo === 5 ? (4 + 3.5 * .5) / (2 * Math.sin(Math.PI / 3)) / 17 : .1
function requirePart(partNo) {
  if (![1,2,3,4,5,6,7,'mini-shaft','mini-wheel'].includes(partNo)) throw new Error('パーツ番号・種類は一覧から選んでください。')
}
function findPiece(guide, id) {
  const piece = variantOf(guide).model.pieces.find(piece => piece.id === id)
  if (!piece) throw new Error('対象のパーツが見つかりません。')
  return piece
}
function occupiedSlots(guide, piece, exceptId) {
  const occupied = new Set()
  for (const connection of variantOf(guide).model.connections) {
    if (connection.joint === exceptId) continue
    for (const port of connection.ports) {
      if (port.piece === exceptId) continue
      if (isPlate(piece) && port.piece === piece.id) occupied.add(port.socket)
      if (!isPlate(piece) && connection.joint === piece.id) occupied.add(port.port)
    }
  }
  for (const connection of variantOf(guide).model.axleConnections ?? []) {
    if (connection.shaft === exceptId || connection.wheel === exceptId) continue
    if (connection.shaft === piece.id) occupied.add(3)
    if (connection.wheel === piece.id) occupied.add(0)
  }
  return occupied
}
function requireSlot(guide, piece, slot, exceptId) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= slotCount(piece.partNo)) throw new Error('接続先の辺・差し込み口を選んでください。')
  if (occupiedSlots(guide, piece, exceptId).has(slot)) throw new Error('選んだ辺・差し込み口は使用中です。空いている場所を選んでください。')
}
function slotLabel(piece, value) {
  return isShaft(piece) && value === 3 ? 'ホイール用の軸' : isWheel(piece) ? 'シャフト用の軸穴' : `${isPlate(piece) ? '辺' : '差し込み口'} ${value + 1}`
}
export function attachmentParts(guide, id, slot) {
  const piece = findPiece(guide, id)
  if (isWheel(piece)) return ['mini-shaft']
  if (isShaft(piece) && slot === 3) return ['mini-wheel']
  return isPlate(piece) ? [3,4,5,6,7,'mini-shaft'] : [1,2]
}
export function availableSlots(guide, id, exceptId) {
  const piece = findPiece(guide, id), occupied = occupiedSlots(guide, piece, exceptId)
  return Array.from({ length: slotCount(piece.partNo) }, (_, value) => ({ value, label: slotLabel(piece, value) })).filter(slot => !occupied.has(slot.value))
}
export function replacementParts(guide, id) {
  const piece = findPiece(guide, id), occupied = occupiedSlots(guide, piece)
  if (isShaft(piece) || isWheel(piece)) return [piece.partNo]
  return (isPlate(piece) ? [1, 2] : [3, 4, 5, 6, 7]).filter(partNo => [...occupied].every(slot => slot < slotCount(partNo)))
}
function edgeFrame(piece, socket) {
  const vs = piece.pose.vertices, a = vs[socket], b = vs[(socket + 1) % vs.length]
  const axis = normalize(sub(b, a)), mid = mean([a, b])
  return { axis, mid, dir: project(sub(mean(vs), mid), axis) }
}
function jointDirections(guide, joint) {
  if (isWheel(joint)) return {}
  const axis = normalize(joint.pose.axis), directions = {}
  for (const connection of variantOf(guide).model.connections.filter(connection => connection.joint === joint.id)) {
    for (const port of connection.ports) directions[port.port] = edgeFrame(findPiece(guide, port.piece), port.socket).dir
  }
  for (const [port, direction] of Object.entries(joint.pose.directions ?? {})) directions[port] = project(direction, axis)
  for (const port of Object.keys(directions)) directions[port] = project(directions[port], axis)
  if (!Object.keys(directions).length) directions[0] = project(Math.abs(axis[1]) < .9 ? [0, 1, 0] : [1, 0, 0], axis)
  if (joint.partNo === 7) {
    if (!directions[0] && directions[1]) directions[0] = scale(directions[1], -1)
    if (!directions[0]) directions[0] = normalize(cross(axis, directions[2]))
    directions[1] ??= scale(directions[0], -1)
    directions[2] ??= normalize(cross(axis, directions[0]))
  } else {
    const angle = (joint.partNo === 6 ? 90 : joint.partNo === 5 ? 120 : 180) * Math.PI / 180
    directions[0] ??= rotate(directions[1] ?? directions[2], axis, -angle)
    directions[1] ??= rotate(directions[0], axis, angle)
  }
  if (isShaft(joint)) directions[2] = scale(normalize(joint.pose.axleDirection), -1)
  return directions
}
export function slotMarker(guide, id, slot, allowUsed = false) {
  const piece = findPiece(guide, id)
  if (allowUsed) { if (!Number.isInteger(slot) || slot < 0 || slot >= slotCount(piece.partNo)) throw new Error('接続先の辺・差し込み口を選んでください。') }
  else requireSlot(guide, piece, slot)
  if (isWheel(piece)) return { position: piece.pose.center, label: slotLabel(piece, slot) }
  if (isShaft(piece) && slot === 3) return { position: add(piece.pose.center, scale(normalize(piece.pose.axleDirection), WHEEL_CENTER_OFFSET)), label: slotLabel(piece, slot) }
  return { position: isPlate(piece) ? edgeFrame(piece, slot).mid : add(piece.pose.center, scale(jointDirections(guide, piece)[slot], .45)), label: `${isPlate(piece) ? '辺' : '差し込み口'} ${slot + 1}` }
}
function platePose(partNo, mid, axis, dir, normal = cross(axis, dir)) {
  const a = sub(mid, scale(axis, .5)), b = add(mid, scale(axis, .5))
  return { vertices: partNo === 1 ? [a, b, add(b, dir), add(a, dir)] : [a, b, add(mid, scale(dir, Math.sqrt(3) / 2))], normal: normalize(normal) }
}
function attachment(guide, target, targetSlot, piece) {
  if (!attachmentParts(guide, target.id, targetSlot).includes(piece.partNo)) throw new Error('この接続口に合うパーツを組み合わせてください。')
  if (isShaft(target) && isWheel(piece)) return {
    pose: { center: add(target.pose.center, scale(normalize(target.pose.axleDirection), WHEEL_CENTER_OFFSET)), axis: normalize(target.pose.axleDirection) },
    action: { kind: 'axle', shaft: target.id, wheel: piece.id },
  }
  if (isWheel(target) && isShaft(piece)) {
    const axleDirection = normalize(target.pose.axis)
    const axis = project(Math.abs(axleDirection[0]) < .9 ? [1,0,0] : [0,1,0], axleDirection)
    const dir = normalize(cross(axleDirection, axis))
    return { pose: { center: sub(target.pose.center, scale(axleDirection, WHEEL_CENTER_OFFSET)), axis, directions: {0: dir, 1: scale(dir, -1), 2: scale(axleDirection, -1)}, axleDirection }, action: { kind: 'axle', shaft: piece.id, wheel: target.id } }
  }
  if (isPlate(target) === isPlate(piece)) throw new Error('基本パーツとジョイントを組み合わせてください。')
  if (isPlate(target)) {
    const { axis, mid, dir } = edgeFrame(target, targetSlot)
    return { pose: { center: sub(mid, scale(dir, inset(piece.partNo))), axis, directions: isShaft(piece) ? {0: dir, 1: scale(dir, -1), 2: scale(normalize(cross(axis, dir)), -1)} : { 0: dir }, ...(isShaft(piece) ? { axleDirection: normalize(cross(axis, dir)) } : {}) }, action: { kind: 'port', joint: piece.id, port: 0, piece: target.id, socket: targetSlot } }
  }
  const dir = jointDirections(guide, target)[targetSlot], axis = normalize(target.pose.axis)
  return { pose: platePose(piece.partNo, add(target.pose.center, scale(dir, inset(target.partNo))), axis, dir), action: { kind: 'port', joint: target.id, port: targetSlot, piece: piece.id, socket: 0 } }
}
function registerConnection(variant, action, stage) {
  if (action.kind === 'axle') {
    variant.model.axleConnections ??= []
    variant.model.axleConnections.push({shaft: action.shaft, wheel: action.wheel})
    stage.actions ??= []
    stage.actions.push(action)
    return
  }
  let connection = variant.model.connections.find(connection => connection.joint === action.joint)
  if (!connection) { connection = { joint: action.joint, ports: [] }; variant.model.connections.push(connection) }
  connection.ports.push({ port: action.port, piece: action.piece, socket: action.socket })
  stage.actions ??= []
  stage.actions.push(action)
}
function firstCommonStage(variant, a, b) {
  const stage = stagesOf(variant).find(stage => stage.visiblePieces.includes(a) && stage.visiblePieces.includes(b))
  if (!stage) throw new Error('両方のパーツが表示される工程がありません。')
  return stage
}
function unlinkPiece(variant, id) {
  variant.model.connections = variant.model.connections.filter(connection => connection.joint !== id).map(connection => ({ ...connection, ports: connection.ports.filter(port => port.piece !== id) })).filter(connection => connection.ports.length)
  if (variant.model.axleConnections) variant.model.axleConnections = variant.model.axleConnections.filter(c => c.shaft !== id && c.wheel !== id)
  for (const stage of stagesOf(variant)) stage.actions = (stage.actions ?? []).filter(action => action.joint !== id && action.piece !== id && action.shaft !== id && action.wheel !== id)
}
function captureAffectedJoints(guide, id) {
  return [...new Set(variantOf(guide).model.connections.filter(connection => connection.joint === id || connection.ports.some(port => port.piece === id)).map(connection => connection.joint))]
    .map(jointId => { const joint = findPiece(guide, jointId); return { joint, directions: jointDirections(guide, joint) } })
}
function freezeDirections(records) {
  for (const { joint, directions } of records) joint.pose.directions = directions
}
export function attachPiece(guide, { targetId, targetSlot, partNo, color, id }) {
  requirePart(partNo)
  const variant = variantOf(guide), target = findPiece(guide, targetId)
  requireSlot(guide, target, targetSlot)
  if (id === undefined) {
    let suffix = 1
    do { id = `edit-no${partNo}-${suffix++}` } while (variant.model.pieces.some(piece => piece.id === id))
  }
  if (typeof id !== 'string' || !id.trim() || variant.model.pieces.some(piece => piece.id === id)) throw new Error('パーツ ID が空か、すでに使われています。')
  if (color !== undefined && (typeof color !== 'string' || !color.trim())) throw new Error('色を選んでください。')
  const piece = { id, partNo, color: isShaft({partNo}) || isWheel({partNo}) ? 'black' : color ?? target.color }
  const { pose, action } = attachment(guide, target, targetSlot, piece)
  const unit = variant.units.find(unit => unit.pieceIds.includes(target.id))
  const first = unit?.steps.find(stage => stage.visiblePieces.includes(target.id))
  if (!first) throw new Error('接続先パーツの所属ユニット・工程がありません。')
  piece.pose = pose
  variant.model.pieces.push(piece)
  unit.pieceIds.push(id)
  for (const stage of stagesOf(variant)) {
    if (stage.visiblePieces.includes(targetId)) stage.visiblePieces.push(id)
    if (stage.newPieces.includes(targetId)) {
      stage.newPieces.push(id)
      if (stage.explodeGroups) {
        const group = stage.explodeGroups.find(group => group.includes(targetId))
        if (group) group.push(id)
        else stage.explodeGroups.push([id])
      }
    }
  }
  registerConnection(variant, action, first)
  return id
}
/** One identity per connection, so a reviewer can release exactly the one they picked. */
export const connectionKey = link => link.kind === 'axle' ? `axle:${link.shaft}:${link.wheel}` : `port:${link.joint}:${link.port}:${link.piece}:${link.socket}`

export function pieceConnections(guide, id) {
  const piece = findPiece(guide, id), variant = variantOf(guide), links = []
  for (const connection of variant.model.connections) for (const port of connection.ports) {
    const isJoint = connection.joint === id
    if (!isJoint && port.piece !== id) continue
    links.push({ kind: 'port', joint: connection.joint, port: port.port, piece: port.piece, socket: port.socket,
      slot: isJoint ? port.port : port.socket, partner: isJoint ? port.piece : connection.joint, partnerSlot: isJoint ? port.socket : port.port })
  }
  for (const connection of variant.model.axleConnections ?? []) {
    const isShaft = connection.shaft === id
    if (!isShaft && connection.wheel !== id) continue
    links.push({ kind: 'axle', shaft: connection.shaft, wheel: connection.wheel,
      slot: isShaft ? 3 : 0, partner: isShaft ? connection.wheel : connection.shaft, partnerSlot: isShaft ? 0 : 3 })
  }
  return links.map(link => ({ ...link, key: connectionKey(link),
    slotText: slotLabel(piece, link.slot), partnerSlotText: slotLabel(findPiece(guide, link.partner), link.partnerSlot) }))
}

function releaseLinks(variant, released) {
  variant.model.connections = variant.model.connections
    .map(connection => ({ ...connection, ports: connection.ports.filter(port => !released.has(connectionKey({ kind: 'port', joint: connection.joint, ...port }))) }))
    .filter(connection => connection.ports.length)
  if (variant.model.axleConnections) variant.model.axleConnections = variant.model.axleConnections.filter(connection => !released.has(connectionKey({ kind: 'axle', ...connection })))
  for (const stage of stagesOf(variant)) stage.actions = (stage.actions ?? []).filter(action => !released.has(connectionKey(action)))
}

/** Everything still held to the piece once the chosen connections are released. */
function connectedPieces(guide, startId, released) {
  const variant = variantOf(guide), neighbours = new Map()
  const join = (a, b) => { neighbours.set(a, (neighbours.get(a) ?? new Set()).add(b)); neighbours.set(b, (neighbours.get(b) ?? new Set()).add(a)) }
  for (const connection of variant.model.connections) for (const port of connection.ports) {
    if (!released.has(connectionKey({ kind: 'port', joint: connection.joint, ...port }))) join(connection.joint, port.piece)
  }
  for (const connection of variant.model.axleConnections ?? []) {
    if (!released.has(connectionKey({ kind: 'axle', ...connection }))) join(connection.shaft, connection.wheel)
  }
  const found = new Set([startId]), queue = [startId]
  while (queue.length) for (const next of neighbours.get(queue.pop()) ?? []) if (!found.has(next)) { found.add(next); queue.push(next) }
  return found
}

// Where one plate edge or one socket mates, as a right-handed frame: the edge/socket
// direction, the plate's inward direction and their normal. Two pieces are connected
// exactly when the frames of the mating slots coincide, so a relink is the rigid
// motion that takes one frame onto the other.
function mateFrame(guide, piece, slot) {
  if (isPlate(piece)) {
    const { axis, mid, dir } = edgeFrame(piece, slot)
    return { origin: mid, basis: [axis, dir, cross(axis, dir)] }
  }
  if (isWheel(piece)) {
    const axis = normalize(piece.pose.axis), dir = project(Math.abs(axis[0]) < .9 ? [1, 0, 0] : [0, 1, 0], axis)
    return { origin: piece.pose.center, basis: [axis, dir, cross(axis, dir)], axle: true }
  }
  if (isShaft(piece) && slot === 3) {
    const axis = normalize(piece.pose.axleDirection), dir = project(piece.pose.axis, axis)
    return { origin: add(piece.pose.center, scale(axis, WHEEL_CENTER_OFFSET)), basis: [axis, dir, cross(axis, dir)], axle: true }
  }
  const axis = normalize(piece.pose.axis), dir = jointDirections(guide, piece)[slot]
  if (!dir) throw new Error('差し込み口の向きを計算できません。形状を確認してください。')
  return { origin: add(piece.pose.center, scale(dir, inset(piece.partNo))), basis: [axis, dir, cross(axis, dir)] }
}
const applyMatrix = (matrix, vector) => matrix.map(row => dot(row, vector))
const frameRotation = (from, to) => [0,1,2].map(i => [0,1,2].map(j => [0,1,2].reduce((sum, k) => sum + to.basis[k][i] * from.basis[k][j], 0)))
const turnOf = rotation => Math.acos(Math.max(-1, Math.min(1, (rotation[0][0] + rotation[1][1] + rotation[2][2] - 1) / 2)))
function rotationAbout(axis, angle) {
  const cos = Math.cos(angle), sin = Math.sin(angle), rest = 1 - cos, [x, y, z] = axis
  return [[rest*x*x+cos, rest*x*y-sin*z, rest*x*z+sin*y], [rest*x*y+sin*z, rest*y*y+cos, rest*y*z-sin*x], [rest*x*z-sin*y, rest*y*z+sin*x, rest*z*z+cos]]
}
// A plate edge fits a socket either way round, and a wheel is free to spin on its axle.
// Both stay valid, so take the one that moves the attached pieces least.
function alignment(from, to) {
  const flip = frame => ({ ...frame, basis: [scale(frame.basis[0], -1), frame.basis[1], scale(frame.basis[2], -1)] })
  let candidates
  if (from.axle || to.axle) {
    const axis = cross(from.basis[0], to.basis[0]), sine = Math.hypot(...axis), cosine = dot(from.basis[0], to.basis[0])
    candidates = [sine < 1e-9
      ? cosine > 0 ? [[1,0,0],[0,1,0],[0,0,1]] : rotationAbout(from.basis[1], Math.PI)
      : rotationAbout(scale(axis, 1 / sine), Math.atan2(sine, cosine))]
  } else candidates = [frameRotation(from, to), frameRotation(from, flip(to))]
  return candidates.reduce((best, candidate) => turnOf(candidate) < turnOf(best) ? candidate : best)
}
function moveRigid(pieces, rotation, from, to) {
  const point = value => add(to.origin, applyMatrix(rotation, sub(value, from.origin)))
  for (const piece of pieces) {
    if (piece.pose.center) piece.pose.center = point(piece.pose.center)
    if (piece.pose.vertices) piece.pose.vertices = piece.pose.vertices.map(point)
    for (const key of ['normal', 'axis', 'axleDirection']) if (piece.pose[key]) piece.pose[key] = applyMatrix(rotation, piece.pose[key])
    if (piece.pose.directions) for (const key of Object.keys(piece.pose.directions)) piece.pose.directions[key] = applyMatrix(rotation, piece.pose.directions[key])
  }
}
function mateAction(piece, pieceSlot, target, targetSlot) {
  if (isWheel(piece) || isWheel(target)) return { kind: 'axle', shaft: isWheel(piece) ? target.id : piece.id, wheel: isWheel(piece) ? piece.id : target.id }
  return { kind: 'port', joint: isPlate(piece) ? target.id : piece.id, port: isPlate(piece) ? targetSlot : pieceSlot, piece: isPlate(piece) ? piece.id : target.id, socket: isPlate(piece) ? pieceSlot : targetSlot }
}
const mateSlot = (piece, target) => isShaft(piece) && isWheel(target) ? 3 : 0

/** The slots a relink can actually use: everything still attached moves, so it cannot be the target. */
export function relinkTargets(guide, { pieceId, releaseKey, carry = true }) {
  const piece = findPiece(guide, pieceId), links = pieceConnections(guide, pieceId)
  const released = new Set(carry ? (links.some(link => link.key === releaseKey) ? [releaseKey] : []) : links.map(link => link.key))
  const free = structuredClone(guide)
  releaseLinks(variantOf(free), released)
  const branch = carry ? connectedPieces(guide, pieceId, released) : new Set([pieceId])
  const fits = (id, slot) => attachmentParts(free, id, slot.value).includes(piece.partNo)
  return {
    released: [...released], branch: [...branch], ownSlots: availableSlots(free, pieceId),
    targets: variantOf(free).model.pieces.filter(item => !branch.has(item.id) && availableSlots(free, item.id).some(slot => fits(item.id, slot)))
      .map(item => ({ id: item.id, slots: availableSlots(free, item.id).filter(slot => fits(item.id, slot)) })),
  }
}

/**
 * Move one connection of a piece to another slot, keeping the piece's remaining
 * connections by carrying everything still attached to it as one rigid body.
 * Geometry only: overlap and physical assembly order are still for the reviewer to judge.
 */
export function relinkConnection(guide, { pieceId, releaseKey, targetId, targetSlot, pieceSlot, carry = true }) {
  const variant = variantOf(guide), piece = findPiece(guide, pieceId), target = findPiece(guide, targetId)
  if (pieceId === targetId) throw new Error('別のパーツを接続先に選んでください。')
  const links = pieceConnections(guide, pieceId)
  const release = releaseKey === undefined ? null : links.find(link => link.key === releaseKey)
  if (releaseKey !== undefined && !release) throw new Error('外す接続が見つかりません。選び直してください。')
  // Moving a connection keeps using the same edge or socket on this piece unless asked otherwise.
  pieceSlot ??= release?.slot ?? mateSlot(piece, target)
  if (carry && !release && links.length) throw new Error('外す接続を選んでください。')
  const released = new Set(carry ? (release ? [release.key] : []) : links.map(link => link.key))
  // Check on a copy with the released connections gone: their slots are the ones being reused.
  const free = structuredClone(guide)
  releaseLinks(variantOf(free), released)
  requireSlot(free, findPiece(free, targetId), targetSlot)
  requireSlot(free, findPiece(free, pieceId), pieceSlot)
  if (!attachmentParts(free, targetId, targetSlot).includes(piece.partNo) || !attachmentParts(free, pieceId, pieceSlot).includes(target.partNo)) throw new Error('この接続口に合うパーツを組み合わせてください。')
  const branch = carry ? connectedPieces(guide, pieceId, released) : new Set([pieceId])
  if (branch.has(targetId)) throw new Error('付け替え先は外す接続と同じ側につながっています。別の接続を外すか、つながったパーツを動かさない設定にしてください。')
  const from = mateFrame(guide, piece, pieceSlot), to = mateFrame(guide, target, targetSlot)
  const rotation = alignment(from, to)
  const stage = firstCommonStage(variant, pieceId, targetId)
  const action = mateAction(piece, pieceSlot, target, targetSlot)
  // Every check is done; freeze inferred fork directions so released joints keep their pose.
  freezeDirections(captureAffectedJoints(guide, pieceId))
  releaseLinks(variant, released)
  moveRigid(variant.model.pieces.filter(item => branch.has(item.id)), rotation, from, to)
  registerConnection(variant, action, stage)
  return { moved: [...branch], released: [...released] }
}

export function reattachPiece(guide, { pieceId, targetId, targetSlot, pieceSlot }) {
  relinkConnection(guide, { pieceId, targetId, targetSlot, pieceSlot, carry: false })
  return guide
}
export function replacePiece(guide, id, partNo) {
  requirePart(partNo)
  const piece = findPiece(guide, id)
  if ((partNo <= 2) !== isPlate(piece)) throw new Error('基本パーツ同士、またはジョイント同士で交換してください。')
  if (!replacementParts(guide, id).includes(partNo)) throw new Error('交換すると使用中の辺・差し込み口がなくなります。先に接続を外してください。')
  if (partNo === piece.partNo) return guide
  let pose = piece.pose
  if (isPlate(piece)) {
    const { mid, axis, dir } = edgeFrame(piece, 0)
    pose = platePose(partNo, mid, axis, dir, piece.pose.normal)
  } else {
    const axis = normalize(pose.axis), first = jointDirections(guide, piece)[0]
    const angle = (partNo === 6 ? 90 : partNo === 5 ? 120 : 180) * Math.PI / 180
    const directions = { 0: first, 1: rotate(first, axis, angle) }
    if (partNo === 7) directions[2] = normalize(cross(axis, first))
    pose = { ...pose, directions }
  }
  piece.partNo = partNo
  piece.pose = pose
  return guide
}
export function deletePiece(guide, id) {
  const variant = variantOf(guide)
  findPiece(guide, id)
  if (variant.units.some(unit => unit.pieceIds.includes(id) && unit.pieceIds.length === 1)) throw new Error('ユニット最後のパーツは削除できません。')
  if (stagesOf(variant).some(stage => stage.visiblePieces.includes(id) && stage.visiblePieces.length === 1)) throw new Error('工程最後のパーツは削除できません。')
  const affected = captureAffectedJoints(guide, id)
  freezeDirections(affected)
  unlinkPiece(variant, id)
  variant.model.pieces = variant.model.pieces.filter(piece => piece.id !== id)
  for (const unit of variant.units) unit.pieceIds = unit.pieceIds.filter(pieceId => pieceId !== id)
  for (const stage of stagesOf(variant)) {
    for (const key of ['visiblePieces', 'newPieces']) stage[key] = stage[key].filter(pieceId => pieceId !== id)
    if (stage.explodeGroups) stage.explodeGroups = stage.explodeGroups.map(group => group.filter(pieceId => pieceId !== id)).filter(group => group.length)
  }
  return guide
}

export function plateFaceState(guide, id) {
  const piece = variantOf(guide).model.pieces.find(piece => piece.id === id)
  if (!piece || ![1, 2].includes(piece.partNo)) return { canFlip: false, reason: '表裏を変えられるのは No.1（四角）・No.2（三角）だけです。' }
  const { normal, vertices } = piece.pose ?? {}
  const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
  if (!vector(normal) || Math.hypot(...normal) < 1e-9 || !Array.isArray(vertices) || vertices.length !== (piece.partNo === 1 ? 4 : 3) || !vertices.every(vector)) return { canFlip: false, reason: '表裏の向きを計算できません。板の形状を確認してください。' }
  const n = normalize(normal)
  if (vertices.some(v => Math.abs(dot(sub(v, vertices[0]), n)) > .001)) return { canFlip: false, reason: '表裏の向きが板の面と合っていません。板の形状を確認してください。' }
  return { canFlip: true, reason: '位置と接続する辺は変わりません。' }
}
export function flipPlate(guide, id) {
  const state = plateFaceState(guide, id)
  if (!state.canFlip) throw new Error(state.reason)
  // The vertex order defines socket numbers. Never reverse it to flip the face.
  const piece = findPiece(guide, id)
  piece.pose.normal = piece.pose.normal.map(value => -value)
  return guide
}
