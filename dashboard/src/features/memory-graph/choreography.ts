import type { Vec3 } from "./sphere-mesh.ts"
export const assemblyDuration = 6600
const growthDuration = 6325
export const pulseDuration = 1450
export const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}
/** A left-to-right connected sweep beginning with a single trunk; routes use only existing mesh edges. */
export function propagationPlan(points: Vec3[], edges: [number, number][]) {
  const adjacent = points.map((): number[] => [])
  for (const [a, b] of edges) {
    adjacent[a]?.push(b)
    adjacent[b]?.push(a)
  }
  const tau = Math.PI * 2
  const angle = (i: number) => Math.atan2(points[i]?.x ?? 0, points[i]?.z ?? 1)
  let root = 0
  const rootScore = (i: number) =>
    Math.abs(Math.atan2(Math.sin(angle(i) + 0.35), Math.cos(angle(i) + 0.35))) +
    Math.abs(points[i]?.y ?? 0) * 0.7
  points.forEach((_, i) => {
    if (rootScore(i) < rootScore(root)) root = i
  })
  // Sweep one complete longitude turn. An edge may start only from a lit
  // neighbor; vertices near a polar seam wait for that neighbor instead of
  // forcing the camera to make a second lap.
  const longitude = points.map(
    (_, i) => (((angle(i) - angle(root)) % tau) + tau) % tau
  )
  const distance = points.map(() => Infinity),
    parents = points.map(() => -1)
  if (points.length) distance[root] = 0
  const visited = new Set<number>()
  for (let step = 0; step < points.length; step++) {
    let from = -1,
      best = Infinity
    distance.forEach((value, i) => {
      if (!visited.has(i) && value < best) {
        from = i
        best = value
      }
    })
    if (from < 0) break
    visited.add(from)
    for (const to of adjacent[from] ?? []) {
      const arrival = Math.max(best + 0.025, longitude[to] ?? 0)
      if (
        arrival < (distance[to] ?? Infinity) ||
        (arrival === distance[to] && best > (distance[parents[to] ?? -1] ?? -1))
      ) {
        distance[to] = arrival
        parents[to] = from
      }
    }
  }
  const order = points
    .map((_, i) => i)
    .sort((a, b) => (distance[a] ?? 0) - (distance[b] ?? 0))
  const first = order[1] ?? root
  const travel = tau
  const births = distance.map((value) => {
    const fraction = Math.min(1, value / travel)
    let low = 0,
      high = 1
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2
      if (smooth(mid) < fraction) low = mid
      else high = mid
    }
    return value === 0 ? 0 : (growthDuration * (low + high)) / 2
  })
  const children = points.map((): number[] => [])
  parents.forEach((parent, i) => {
    if (parent >= 0) children[parent]?.push(i)
  })
  const route: number[] = points.length ? [root] : []
  // Explicit stack avoids recursive depth for large snapshots.
  const stack = points.length ? [{ node: root, next: 0 }] : []
  while (stack.length) {
    const frame = stack.at(-1)
    if (!frame) break
    const child = children[frame.node]?.[frame.next]
    if (child !== undefined) {
      frame.next++
      route.push(child)
      stack.push({ node: child, next: 0 })
    } else {
      stack.pop()
      const parent = stack.at(-1)
      if (parent) route.push(parent.node)
    }
  }
  return {
    root,
    first,
    births,
    parents,
    route,
    distance,
    travel,
    startAngle: angle(root),
  }
}
export type Propagation = ReturnType<typeof propagationPlan>
export function nodeReveal(plan: Propagation, index: number, time: number) {
  return smooth((time - (plan.births[index] ?? 0)) / 180)
}
export function edgeReveal(
  plan: Propagation,
  a: number,
  b: number,
  time: number
) {
  const [from, to] =
    (plan.distance[a] ?? 0) <= (plan.distance[b] ?? 0) ? [a, b] : [b, a]
  if (plan.parents[to] === from) {
    const start = plan.distance[from] ?? 0
    const progress = Math.max(
      0,
      Math.min(
        1,
        (growthFront(plan, time) - start) /
          Math.max(0.001, (plan.distance[to] ?? 0) - start)
      )
    )
    return { from, to, progress, opacity: 1 }
  }
  // Closing facets fade in behind the front. They never draw a second,
  // contradictory growth direction across the already completed surface.
  const start = Math.max(plan.births[a] ?? 0, plan.births[b] ?? 0) + 180
  return { from, to, progress: 1, opacity: smooth((time - start) / 500) }
}

export function pulseAt(plan: Propagation, time: number) {
  const hops = plan.route.length - 1
  if (hops < 1) return null
  const cycle = Math.max(0, time) / pulseDuration,
    index = Math.floor(cycle) % hops
  return {
    from: plan.route[index] ?? 0,
    to: plan.route[index + 1] ?? 0,
    phase: cycle % 1,
  }
}
/** Growth and camera share this frontier, in surface-distance units. */
export function growthFront(plan: Propagation, time: number) {
  return smooth(time / growthDuration) * plan.travel
}
export function entranceCamera(
  plan: Propagation,
  points: Vec3[],
  time: number
) {
  const front = growthFront(plan, time)
  const progress = smooth(time / assemblyDuration)
  // One shared sweep, with a small trailing camera phase so the next edge has
  // time to grow into view. Both endpoints have zero velocity.
  const turn = progress - 0.035 * Math.sin(Math.PI * progress) ** 2
  const heading = plan.startAngle + Math.PI * 2 * turn
  const yaw = -plan.startAngle - 0.35 + Math.PI * 2 * (1 - turn)
  let height = 0,
    weight = 0
  points.forEach((point, i) => {
    const proximity = Math.exp(-(((plan.distance[i] ?? 0) - front) ** 2) / 0.3)
    height += point.y * proximity
    weight += proximity
  })
  const latitude = weight ? height / weight : 0
  // Recenter continuously throughout the pull-back, never as a separate final
  // movement. The sphere's center is the only target by the end of the turn.
  const follow = (1 - progress) ** 2
  return {
    frontier: front,
    roll: 0,
    offsetX: 0,
    yaw,
    pitch: 0.18 * (1 - progress),
    zoom: 1 + 1.15 * (1 - progress),
    focus: {
      x: Math.sin(heading) * 0.65 * follow,
      y: latitude * 0.5 * follow,
      z: Math.cos(heading) * 0.65 * follow,
    },
  }
}
