export function sphereRadius(width: number, height: number, count: number) {
  const density = Math.sqrt(Math.min(120, Math.max(1, count)) / 120)
  return Math.max(
    12,
    Math.min(width * (0.27 + density * 0.16), height * (0.28 + density * 0.14))
  )
}
export function surfaceWave(y: number, z: number, time: number) {
  const angle = Math.acos(Math.max(-1, Math.min(1, y * 0.8 + z * 0.6)))
  const phase = (time % 9000) / 1400 - 0.35
  return Math.exp(-((angle - phase) ** 2) / 0.035)
}
