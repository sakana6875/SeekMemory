/** Convex surface mesh; these edges are geometry, never memory relationships. */
export type Vec3 = { x: number; y: number; z: number }
export type Face = [number, number, number]
const sub = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
})
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
export function sphereMesh(points: Vec3[]): {
  faces: Face[]
  edges: [number, number][]
} {
  if (points.length < 3)
    return { faces: [], edges: points.length === 2 ? [[0, 1]] : [] }
  if (points.length === 3)
    return {
      faces: [[0, 1, 2]],
      edges: [
        [0, 1],
        [1, 2],
        [2, 0],
      ],
    }
  const point = (i: number): Vec3 => points[i] ?? { x: 0, y: 0, z: 0 }
  const first = point(0)
  const farthest = (score: (point: Vec3) => number) => {
    let best = -Infinity,
      index = 0
    points.forEach((p, i) => {
      const d = score(p)
      if (d > best) {
        best = d
        index = i
      }
    })
    return index
  }
  const b = farthest((p) => dot(sub(p, first), sub(p, first)))
  const line = sub(point(b), first)
  const c = farthest((p) => {
    const v = cross(line, sub(p, first))
    return dot(v, v)
  })
  const normal = cross(line, sub(point(c), first))
  const d = farthest((p) => Math.abs(dot(normal, sub(p, first))))
  const inside = { x: 0, y: 0, z: 0 }
  for (const i of [0, b, c, d]) {
    inside.x += point(i).x / 4
    inside.y += point(i).y / 4
    inside.z += point(i).z / 4
  }
  const distance = (face: Face, p: Vec3) => {
    const a = point(face[0]),
      b = point(face[1]),
      c = point(face[2])
    return dot(cross(sub(b, a), sub(c, a)), sub(p, a))
  }
  const orient = (face: Face): Face =>
    distance(face, inside) > 0 ? [face[0], face[2], face[1]] : face
  let faces: Face[] = [
    orient([0, b, c]),
    orient([0, d, b]),
    orient([0, c, d]),
    orient([b, d, c]),
  ]
  const initial = new Set([0, b, c, d])
  points.forEach((p, i) => {
    if (initial.has(i)) return
    const horizon = new Map<string, [number, number]>()
    faces = faces.filter((face) => {
      if (distance(face, p) <= 1e-9) return true
      for (let j = 0; j < 3; j++) {
        const a = face[j] ?? 0,
          b = face[(j + 1) % 3] ?? 0,
          key = `${Math.min(a, b)}:${Math.max(a, b)}`
        if (horizon.has(key)) horizon.delete(key)
        else horizon.set(key, [a, b])
      }
      return false
    })
    for (const [a, b] of horizon.values()) faces.push(orient([a, b, i]))
  })
  const edges = new Map<string, [number, number]>()
  for (const face of faces)
    for (let j = 0; j < 3; j++) {
      const a = face[j] ?? 0,
        b = face[(j + 1) % 3] ?? 0
      edges.set(`${Math.min(a, b)}:${Math.max(a, b)}`, [a, b])
    }
  return { faces, edges: [...edges.values()] }
}
