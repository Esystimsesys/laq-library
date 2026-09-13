// A joint can turn only when every attached plate remains at the same edge.
const EPS = .001
const add = (a, b) => a.map((x, i) => x + b[i])
const sub = (a, b) => a.map((x, i) => x - b[i])
const scale = (a, n) => a.map(x => x * n)
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0)
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
const vector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)
const close = (a, b) => Math.hypot(...sub(a, b)) <= EPS
function normalize(v) {
  if (!vector(v) || Math.hypot(...v) < 1e-9) throw new Error('パーツの形状を確認してください。')
  return scale(v, 1 / Math.hypot(...v))
}
const project = (v, axis) => normalize(sub(v, scale(axis, dot(v, axis))))
const rotate = (v, axis, angle) => add(add(scale(v, Math.cos(angle)), scale(cross(axis, v), Math.sin(angle))), scale(axis, dot(axis, v) * (1-Math.cos(angle))))
const angleOf = n => (n === 6 ? 90 : n === 5 ? 120 : 180) * Math.PI / 180
const insetOf = n => n === 4 ? .195 : n === 5 ? 5.75 / (2*Math.sin(Math.PI/3)) / 17 : .1
const stagesOf = variant => [...variant.units.flatMap(unit => unit.steps), ...variant.assembly]
const socketKey = port => JSON.stringify([port.piece, port.socket])
const signature = directions => Object.values(directions).map(dir => dir.map(x => Math.round(x * 1e6) || 0).join(',')).sort().join(';')
const sameShape = (a, b) => Object.values(a).length === Object.values(b).length && Object.values(a).every(dir => Object.values(b).some(other => close(dir, other))) && Object.values(b).every(dir => Object.values(a).some(other => close(dir, other)))

function edgeFrame(piece, socket) {
  const vs = piece?.pose?.vertices
  if (![1, 2].includes(piece?.partNo) || !Array.isArray(vs) || vs.length !== (piece.partNo === 1 ? 4 : 3) || !vs.every(vector) || !Number.isInteger(socket) || socket < 0 || socket >= vs.length) throw new Error('接続先の辺を確認してください。')
  const a = vs[socket], b = vs[(socket + 1) % vs.length]
  const axis = normalize(sub(b, a)), mid = scale(add(a, b), .5)
  const center = scale(vs.reduce(add, [0, 0, 0]), 1/vs.length)
  return { axis, mid, dir: project(sub(center, mid), axis) }
}

function canonical(partNo, axis, anchor, port) {
  const d0 = port === 0 ? anchor : partNo === 7
    ? port === 1 ? scale(anchor, -1) : normalize(cross(anchor, axis))
    : rotate(anchor, axis, -angleOf(partNo))
  return partNo === 7
    ? { 0: d0, 1: scale(d0, -1), 2: normalize(cross(axis, d0)) }
    : { 0: d0, 1: rotate(d0, axis, angleOf(partNo)) }
}

// Match the viewer's stored/inferred fork shape, including partially specified poses.
function currentDirections(joint, records, axis) {
  const dirs = Object.fromEntries(records.map(r => [r.port.port, r.frame.dir]))
  for (const [port, value] of Object.entries(joint.pose.directions ?? {})) {
    if (!Number.isInteger(Number(port)) || Number(port) < 0 || Number(port) >= (joint.partNo === 7 ? 3 : 2)) throw new Error('差し込み口の向きを確認してください。')
    dirs[port] = project(value, axis)
  }
  if (joint.partNo === 7) {
    if (!dirs[0] && dirs[1]) dirs[0] = scale(dirs[1], -1)
    if (!dirs[0]) dirs[0] = normalize(cross(axis, dirs[2]))
    dirs[1] ??= scale(dirs[0], -1)
    dirs[2] ??= normalize(cross(axis, dirs[0]))
  } else {
    dirs[0] ??= rotate(dirs[1], axis, -angleOf(joint.partNo))
    dirs[1] ??= rotate(dirs[0], axis, angleOf(joint.partNo))
  }
  return dirs
}

function assignments(count, slots, prefix = []) {
  if (!count) return [prefix]
  return slots.flatMap(slot => assignments(count-1, slots.filter(other => other !== slot), [...prefix, slot]))
}

export function jointOrientations(guide, jointId) {
  const variant = guide?.variants?.[guide.defaultVariant]
  const joint = variant?.model?.pieces?.find(piece => piece.id === jointId)
  if (!joint) return { options: [], reason: '対象のパーツが見つかりません。' }
  if (![3, 4, 5, 6, 7].includes(joint.partNo)) return { options: [], reason: '向きの切り替えはジョイントを選んでください。' }
  const connections = variant.model.connections.filter(connection => connection.joint === jointId)
  const ports = connections.flatMap(connection => connection.ports)
  if (!ports.length) return { options: [], reason: '基本パーツを接続すると向きを切り替えられます。' }
  try {
    const count = joint.partNo === 7 ? 3 : 2, axis = normalize(joint.pose.axis)
    if (!vector(joint.pose.center) || ports.length > count || new Set(ports.map(port => port.port)).size !== ports.length || ports.some(port => !Number.isInteger(port.port) || port.port < 0 || port.port >= count)) throw new Error('差し込み口を確認してください。')
    const occupied = new Set()
    const selectedSockets = new Set(ports.map(socketKey))
    for (const connection of variant.model.connections) for (const port of connection.ports) {
      const key = socketKey(port)
      if (selectedSockets.has(key) && occupied.has(key)) throw new Error('同じ辺に複数の接続があります。')
      occupied.add(key)
    }
    const records = ports.map(port => ({ port, frame: edgeFrame(variant.model.pieces.find(piece => piece.id === port.piece), port.socket) }))
    const current = currentDirections(joint, records, axis), options = []
    const currentConnectionsFit = records.every(({ port, frame }) => close(current[port.port], frame.dir))
    for (const candidateAxis of [axis, scale(axis, -1)]) for (const mapping of assignments(ports.length, Array.from({ length: count }, (_, i) => i))) {
      const directions = canonical(joint.partNo, candidateAxis, project(records[0].frame.dir, candidateAxis), mapping[0])
      if (!records.every(({ frame }, index) => Math.hypot(...cross(frame.axis, candidateAxis)) <= EPS && close(frame.dir, directions[mapping[index]]) && close(frame.mid, add(joint.pose.center, scale(directions[mapping[index]], insetOf(joint.partNo)))))) continue
      const isCurrent = currentConnectionsFit && sameShape(current, directions)
      const mapped = records.map(({ port }, i) => ({ piece: port.piece, socket: port.socket, port: mapping[i] }))
      const used = [...mapping].sort(), free = Array.from({ length: count }, (_, i) => i).filter(i => !used.includes(i))
      const option = { id: `orientation:${signature(directions)}`, label: `接続する口 ${used.map(i => i+1).join('・')}${free.length ? ` / 空く口 ${free.map(i => i+1).join('・')}` : '（すべて接続）'}`, pose: { center: [...joint.pose.center], axis: candidateAxis, directions }, ports: mapped, current: isCurrent }
      const existing = options.findIndex(other => sameShape(other.pose.directions, directions))
      const unchangedMapping = mapping.every((port, i) => port === ports[i].port)
      if (existing < 0) options.push(option)
      else if (unchangedMapping && !options[existing].ports.every((port, i) => port.port === ports[i].port)) options[existing] = option
    }
    return { options, reason: options.length ? options.length === 1 ? '接続した基本パーツを動かさずに使える向きは、この1通りです。' : '' : '接続した基本パーツの位置・角度に合う向きがありません。形状と接続を確認してください。' }
  } catch {
    return { options: [], reason: 'パーツの形状または接続に矛盾があります。形状と接続を確認してください。' }
  }
}

export function applyJointOrientation(guide, jointId, optionId) {
  const { options, reason } = jointOrientations(guide, jointId)
  const option = options.find(candidate => candidate.id === optionId)
  if (!option) throw new Error(reason || '選んだ向きは使えません。接続を確認して選び直してください。')
  if (option.current) return guide
  const variant = guide.variants[guide.defaultVariant]
  const joint = variant.model.pieces.find(piece => piece.id === jointId)
  const ports = variant.model.connections.filter(connection => connection.joint === jointId).flatMap(connection => connection.ports)
  const updates = ports.map(port => {
    const target = option.ports.find(candidate => candidate.piece === port.piece && candidate.socket === port.socket)
    const actions = stagesOf(variant).flatMap(stage => stage.actions ?? []).filter(action => action.kind === 'port' && action.joint === jointId && action.piece === port.piece && action.socket === port.socket && action.port === port.port)
    if (actions.length !== 1) throw new Error('接続に対応する工程の操作を確認してください。')
    return { port, target, action: actions[0] }
  })
  // All checks finish before any write, including actions whose ports swap.
  joint.pose = { ...joint.pose, ...option.pose }
  for (const { port, target, action } of updates) { port.port = target.port; action.port = target.port }
  return guide
}
