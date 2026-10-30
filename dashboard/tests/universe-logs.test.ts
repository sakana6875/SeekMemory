import {
  assemblyDuration,
  pulseDuration,
  propagationPlan,
  nodeReveal,
  edgeReveal,
  entranceCamera,
  pulseAt,
} from "../src/features/memory-graph/choreography.ts"
import { useMemoryPreview } from "../src/features/memory-graph/use-memory-preview.ts"
import type { GraphNode } from "../src/features/shell/model.ts"
import type { ArtifactDetail } from "../src/features/control/model.ts"
import { recentGraph } from "../src/features/memory-graph/model.ts"
import { sphereRadius } from "../src/features/memory-graph/motion.ts"
import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { act, createElement, useEffect } from "react"
import { createRoot } from "react-dom/client"
import {
  layoutSphere,
  rotatePoint,
} from "../src/features/memory-graph/scene.ts"
import { hitStar } from "../src/features/memory-graph/draw-scene.ts"
import { loadGraph } from "../src/dev/load-fixtures.ts"
import {
  orderedLogs,
  useLogFeed,
} from "../src/features/control/use-log-feed.ts"
import type { OperationEvent } from "../src/features/control/model.ts"
import { mockClient } from "../src/dev/mock-client.ts"

void test("memory sphere retains every real node, has a closed bounded mesh and deterministic grouping", () => {
  const graph = loadGraph(),
    before = JSON.stringify(graph)
  const sphere = layoutSphere(graph)
  assert.equal(sphere.stars.length, 1000)
  assert.deepEqual(
    new Set(sphere.stars.map((p) => p.id)),
    new Set(graph.nodes.map((p) => p.id))
  )
  assert.ok(
    sphere.stars.every((p) => Math.abs(Math.hypot(p.x, p.y, p.z) - 1) < 1e-10)
  )
  assert.equal(sphere.faces.length, 1996)
  assert.equal(sphere.edges.length, 2994)
  const facesPerEdge = new Map<string, number>()
  for (const face of sphere.faces)
    for (let i = 0; i < 3; i++) {
      const a = face[i] ?? 0,
        b = face[(i + 1) % 3] ?? 0
      const key = [a, b].sort((x, y) => x - y).join(":")
      facesPerEdge.set(key, (facesPerEdge.get(key) ?? 0) + 1)
    }
  assert.ok([...facesPerEdge.values()].every((n) => n === 2))
  assert.deepEqual(
    sphere,
    layoutSphere({ ...graph, nodes: [...graph.nodes].reverse() })
  )
  assert.equal(JSON.stringify(graph), before)
  for (const n of [0, 1, 2, 3, 4, 16]) {
    const small = layoutSphere({
      ...graph,
      nodes: graph.nodes.slice(0, n),
      edges: [],
    })
    assert.equal(small.stars.length, n)
    assert.ok(small.edges.every(([a, b]) => a !== b && a < n && b < n))
  }
})
void test("rotation preserves a sphere and lifted hover retains its original hit target", () => {
  const point = { x: 0.6, y: 0, z: 0.8 }
  const rotated = rotatePoint(point, { yaw: 1.3, pitch: -0.7, zoom: 1 })
  assert.ok(Math.abs(Math.hypot(rotated.x, rotated.y, rotated.z) - 1) < 1e-10)
  const star = {
    ...point,
    id: "masked-memory",
    kind: "secret",
    sx: 125,
    sy: 100,
    bx: 100,
    by: 100,
    depth: 0.8,
    r: 6,
  }
  assert.equal(hitStar([star], 100, 100, star.id), star.id)
  assert.equal(hitStar([star], 125, 100, star.id), star.id)
  assert.equal(hitStar([star], 200, 200, star.id), "")
  assert.equal(hitStar([{ ...star, depth: -0.8 }], 125, 100), "")
})

void test("log snapshots deduplicate, sort chronologically and remain bounded", async () => {
  const base = (await mockClient.events())[0]
  assert.ok(base)
  const rows = Array.from({ length: 510 }, (_, i) => ({
    ...base,
    id: String(i).padStart(4, "0"),
    at: new Date(i * 1000).toISOString(),
  }))
  const result = orderedLogs([...rows].reverse().concat(rows.slice(100, 120)))
  assert.equal(result.length, 500)
  assert.equal(result[0]?.id, "0010")
  assert.equal(result.at(-1)?.id, "0509")
  const offsets = orderedLogs([
    { ...base, id: "earlier", at: "2026-10-27T10:00:00+08:00" },
    { ...base, id: "later", at: "2026-10-27T03:00:00Z" },
  ])
  assert.deepEqual(
    offsets.map((event) => event.id),
    ["earlier", "later"]
  )
})

void test("log pause discards in-flight results; resume, errors and source replacement stay isolated", async () => {
  const dom = new Window()
  const saved = Object.getOwnPropertyDescriptors(globalThis)
  for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  let vm: ReturnType<typeof useLogFeed> | undefined
  let finish: (rows: OperationEvent[]) => void = () => {
    throw new Error("not requested")
  }
  const slow = () =>
    new Promise<OperationEvent[]>((resolve) => {
      finish = resolve
    })
  const rows = await mockClient.events()
  const good = () => Promise.resolve(rows)
  const bad = () => Promise.reject(new Error("offline"))
  function Probe({
    read,
    visible = true,
  }: {
    read: () => Promise<OperationEvent[]>
    visible?: boolean
  }) {
    const state = useLogFeed(read, visible)
    useEffect(() => {
      vm = state
    }, [state])
    return null
  }
  const root = createRoot(document.createElement("div"))
  try {
    await act(async () => root.render(createElement(Probe, { read: slow })))
    await act(async () => vm?.setPaused(true))
    await act(async () => finish(rows))
    assert.equal(vm?.events.length, 0)
    await act(async () => root.render(createElement(Probe, { read: good })))
    assert.equal(vm?.events.length, 0)
    await act(async () => vm?.setPaused(false))
    assert.equal(vm?.events.length, rows.length)
    await act(async () => root.render(createElement(Probe, { read: slow })))
    await act(async () => root.render(createElement(Probe, { read: bad })))
    await act(async () => finish(rows))
    assert.equal(vm?.error, "offline")
    assert.equal(vm?.events.length, 0)
    let fail = false
    const recoverable = () => (fail ? bad() : good())
    await act(async () =>
      root.render(createElement(Probe, { read: recoverable }))
    )
    fail = true
    await act(async () => vm?.refresh())
    assert.equal(vm?.error, "offline")
    assert.equal(vm?.events.length, rows.length)
    fail = false
    await act(async () => vm?.refresh())
    assert.equal(vm?.error, "")
    let calls = 0
    const hidden = () => {
      calls++
      return good()
    }
    await act(async () =>
      root.render(createElement(Probe, { read: hidden, visible: false }))
    )
    assert.equal(calls, 0)
    await act(async () =>
      root.render(createElement(Probe, { read: hidden, visible: true }))
    )
    assert.equal(calls, 1)
  } finally {
    await act(async () => root.unmount())
    await dom.happyDOM.close()
    for (const key of ["window", "document", "IS_REACT_ACT_ENVIRONMENT"]) {
      const descriptor = saved[key]
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})

void test("recent graph shows the newest bounded memories, preserves masking and removes dangling edges", () => {
  const graph = loadGraph(),
    before = JSON.stringify(graph)
  const result = recentGraph(graph, 80)
  assert.equal(result.nodes.length, 80)
  assert.equal(result.nodes[0]?.id, "load-999")
  assert.equal(result.nodes.at(-1)?.id, "load-920")
  const ids = new Set(result.nodes.map((n) => n.id))
  assert.ok(
    result.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target))
  )
  assert.equal(recentGraph(graph, 1000).nodes.length, 120)
  assert.equal(JSON.stringify(graph), before)
  const first = graph.nodes[0]
  assert.ok(first)
  const offsets = {
    ...graph,
    nodes: [
      {
        ...first,
        id: "older",
        updatedAt: "2026-10-27T10:00:00+08:00",
        protected: true,
        label: "受保护的记忆",
      },
      { ...first, id: "newer", updatedAt: "2026-10-27T03:00:00Z" },
    ],
  }
  assert.equal(recentGraph(offsets, 1).nodes[0]?.id, "newer")
  assert.deepEqual(recentGraph(offsets, 80).nodes[1], offsets.nodes[0])
})
void test("entrance branches along connected edges and ends at the default camera without a jump", () => {
  const sphere = layoutSphere(recentGraph(loadGraph(), 80)),
    plan = sphere.propagation
  const undirected = new Set(
    sphere.edges.map(([a, b]) => [a, b].sort((x, y) => x - y).join(":"))
  )
  assert.equal(plan.births.filter((time) => time === 0).length, 1)
  assert.ok((plan.births[plan.first] ?? 0) > 0)
  plan.parents.forEach((parent, child) => {
    if (parent < 0) return
    assert.ok(undirected.has([parent, child].sort((x, y) => x - y).join(":")))
    assert.ok((plan.births[parent] ?? 0) < (plan.births[child] ?? 0))
  })
  assert.ok(
    sphere.stars.every((_, i) => nodeReveal(plan, i, assemblyDuration) === 1)
  )
  assert.ok(
    sphere.edges.every(
      ([a, b]) => edgeReveal(plan, a, b, assemblyDuration).progress === 1
    )
  )
  const start = entranceCamera(plan, sphere.stars, 0),
    end = entranceCamera(plan, sphere.stars, assemblyDuration)
  assert.ok(start.zoom > end.zoom)
  assert.ok(Math.abs(start.yaw - end.yaw - 2 * Math.PI) < 1e-10)
  assert.equal(end.zoom, 1)
  assert.ok(Math.abs(end.pitch) < 1e-10)
  assert.ok(Math.hypot(end.focus.x, end.focus.y, end.focus.z) < 1e-10)
  const before = entranceCamera(plan, sphere.stars, assemblyDuration - 1)
  assert.ok(Math.abs(before.zoom - end.zoom) < 0.00001)
  assert.ok(sphereRadius(900, 600, 120) > sphereRadius(900, 600, 40))
})
void test("one pulse relays continuously through mesh vertices, including the route wrap", () => {
  for (const count of [0, 1, 2, 3, 16, 80, 120]) {
    const graph = loadGraph(),
      sphere = layoutSphere({
        ...graph,
        nodes: graph.nodes.slice(0, count),
        edges: [],
      })
    const plan = sphere.propagation
    if (count < 2) {
      assert.equal(pulseAt(plan, 100), null)
      continue
    }
    const edges = new Set(
      sphere.edges.map(([a, b]) => [a, b].sort((x, y) => x - y).join(":"))
    )
    for (let step = 0; step < plan.route.length; step++) {
      const pulse = pulseAt(plan, step * pulseDuration + 10),
        next = pulseAt(plan, (step + 1) * pulseDuration + 10)
      assert.ok(pulse && next)
      assert.ok(
        edges.has([pulse.from, pulse.to].sort((x, y) => x - y).join(":"))
      )
      assert.equal(pulse.to, next.from)
    }
  }
  assert.deepEqual(propagationPlan([], []).route, [])
})

void test("expanded preview never reads protected content and discards late details after selection changes", async () => {
  const dom = new Window(),
    saved = Object.getOwnPropertyDescriptors(globalThis)
  for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  const first = loadGraph().nodes[0]
  assert.ok(first)
  let vm: ReturnType<typeof useMemoryPreview> | undefined
  let finish: (detail: ArtifactDetail) => void = () => {
    throw new Error("not requested")
  }
  let calls = 0
  const read = () => {
    calls++
    return new Promise<ArtifactDetail>((resolve) => {
      finish = resolve
    })
  }
  function Probe({ node }: { node: GraphNode }) {
    const state = useMemoryPreview(node, read)
    useEffect(() => {
      vm = state
    }, [state])
    return null
  }
  const root = createRoot(document.createElement("div"))
  const protectedNode = {
    ...first,
    id: "secret",
    protected: true,
    label: "受保护的记忆",
  }
  try {
    await act(async () =>
      root.render(createElement(Probe, { node: protectedNode }))
    )
    assert.equal(calls, 0)
    assert.equal(vm?.content, "受保护的记忆")
    await act(async () => root.render(createElement(Probe, { node: first })))
    assert.equal(calls, 1)
    await act(async () =>
      root.render(createElement(Probe, { node: protectedNode }))
    )
    await act(async () =>
      finish({
        artifact: {
          header: {
            id: first.id,
            family: "memory",
            revision: 1,
            state: "active",
            scope: "shared",
          },
          payload: { text: "不应串到另一个节点的正文" },
        },
        versions: [],
        sources: [],
        ledger: [],
      })
    )
    assert.equal(vm?.content, "受保护的记忆")
    assert.equal(vm?.data, null)
  } finally {
    await act(async () => root.unmount())
    await dom.happyDOM.close()
    for (const key of ["window", "document", "IS_REACT_ACT_ENVIRONMENT"]) {
      const descriptor = saved[key]
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})

void test("the whole entrance follows rightward growth with one turn and a simultaneous centered pullback", () => {
  for (const count of [2, 3, 16, 40, 80, 120]) {
    const graph = loadGraph(),
      sphere = layoutSphere({
        ...graph,
        nodes: graph.nodes.slice(0, count),
        edges: [],
      })
    const plan = sphere.propagation
    const start = entranceCamera(plan, sphere.stars, 0),
      end = entranceCamera(plan, sphere.stars, assemblyDuration)
    assert.ok(Math.abs(start.yaw - end.yaw - 2 * Math.PI) < 1e-10)
    let previous = start
    for (let time = 40; time <= assemblyDuration; time += 40) {
      const camera = entranceCamera(plan, sphere.stars, time)
      assert.ok(
        camera.yaw <= previous.yaw,
        "no reverse turn during recentering"
      )
      assert.ok(
        camera.zoom <= previous.zoom,
        "pull back throughout the same turn"
      )
      assert.equal(camera.offsetX, 0, "no final horizontal translation")
      // Camera trails the visible longitude sweep rather than overtaking it.
      assert.ok(start.yaw - camera.yaw <= camera.frontier + 1e-10)
      previous = camera
    }
    assert.equal(end.zoom, 1)
    assert.ok(Math.hypot(end.focus.x, end.focus.y, end.focus.z) < 1e-10)
    const nearly = entranceCamera(plan, sphere.stars, assemblyDuration - 40)
    assert.ok(Math.abs(nearly.yaw - end.yaw) < 0.001)
    assert.ok(
      Math.hypot(nearly.focus.x, nearly.focus.y, nearly.focus.z) < 0.00001
    )
    // During the middle and late stages, the next longitude remains on the
    // right of the current frontier in the actual perspective projection.
    for (const time of [700, 1800, 3000, 4200, 5400, 6200]) {
      const camera = entranceCamera(plan, sphere.stars, time)
      const project = (angle: number) => {
        const point = rotatePoint(
          { x: Math.sin(angle), y: 0, z: Math.cos(angle) },
          { yaw: 0.35 + camera.yaw, pitch: -0.18 + camera.pitch, zoom: 1 }
        )
        return (point.x * 3.7) / (3.7 - point.z)
      }
      const heading = plan.startAngle + camera.frontier
      assert.ok(
        project(heading + 0.08) > project(heading),
        `front extends right at ${time} ms`
      )
    }
  }
})

void test("growing connections reach their child before it illuminates, including late branches", () => {
  const sphere = layoutSphere(recentGraph(loadGraph(), 120)),
    plan = sphere.propagation
  plan.parents.forEach((parent, child) => {
    if (parent < 0) return
    const birth = plan.births[child] ?? 0
    assert.ok(edgeReveal(plan, parent, child, birth).progress > 0.99999)
    assert.equal(nodeReveal(plan, child, birth), 0)
    assert.ok(nodeReveal(plan, child, birth + 180) > 0.99999)
    assert.ok((plan.births[parent] ?? 0) < birth)
  })
})
