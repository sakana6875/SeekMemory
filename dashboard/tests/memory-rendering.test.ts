import assert from "node:assert/strict"
import { test } from "node:test"
import { assemblyDuration } from "../src/features/memory-graph/choreography.ts"
import {
  drawScene,
  type ScenePalette,
} from "../src/features/memory-graph/draw-scene.ts"
import { layoutSphere } from "../src/features/memory-graph/scene.ts"
import { loadGraph } from "../src/dev/load-fixtures.ts"

// Record filled polygons at the Canvas boundary, separately from point circles.
function polygonRecorder() {
  const fills: number[] = []
  let polygon = false
  const context = {
    globalAlpha: 1,
    clearRect() {},
    beginPath() {
      polygon = false
    },
    moveTo() {},
    lineTo() {},
    closePath() {
      polygon = true
    },
    arc() {},
    stroke() {},
    setLineDash() {},
    fill() {
      if (polygon) fills.push(context.globalAlpha)
    },
    createLinearGradient() {
      return { addColorStop() {} }
    },
  }
  // The fake records the drawing boundary; unused browser Canvas APIs are intentionally absent.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return { fills, context: context as unknown as CanvasRenderingContext2D }
}
const palette: ScenePalette = {
  colors: {},
  muted: "#6699cc",
  pulse: "#718bb4",
  core: "#ffffff",
  line: "#597eac",
  dark: false,
}

void test("completed entrances leave no filled facets between ripples, even when the intro clock is capped", () => {
  const graph = loadGraph()
  for (const count of [16, 40, 80, 120]) {
    const sphere = layoutSphere({
      ...graph,
      nodes: graph.nodes.slice(0, count),
      edges: [],
    })
    for (const yaw of [0, 1, 2, 3]) {
      const recorder = polygonRecorder()
      drawScene(
        recorder.context,
        900,
        600,
        sphere,
        {
          orbit: { yaw, pitch: -0.18, zoom: 1 },
          selected: "",
          hovered: "",
          kind: "",
          time: 8000,
          intro: assemblyDuration,
          lifts: new Map(),
          relations: [],
        },
        palette
      )
      assert.deepEqual(
        recorder.fills,
        [],
        `no residual face at ${count} nodes / yaw ${yaw}`
      )
    }
  }
})

void test("facets still flash during assembly and briefly illuminate under a ripple", () => {
  const graph = loadGraph(),
    sphere = layoutSphere({
      ...graph,
      nodes: graph.nodes.slice(0, 120),
      edges: [],
    })
  for (const [intro, time] of [
    [5000, 0],
    [assemblyDuration, 2000],
  ]) {
    const recorder = polygonRecorder()
    drawScene(
      recorder.context,
      900,
      600,
      sphere,
      {
        orbit: { yaw: 0, pitch: -0.18, zoom: 1 },
        selected: "",
        hovered: "",
        kind: "",
        time: time ?? 0,
        intro: intro ?? 0,
        lifts: new Map(),
        relations: [],
      },
      palette
    )
    assert.ok(recorder.fills.length > 0)
  }
})
