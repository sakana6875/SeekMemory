export type TextChange = { kind: "same" | "removed" | "added"; text: string }
/** Sentence-level diff with a bounded matrix; large texts use a linear fallback. */
export function personaDiff(before: string, after: string): TextChange[] {
  if (before === after) return [{ kind: "same", text: before }]
  const split = (text: string) =>
    text.match(/[^。！？!?\n]+[。！？!?\n]*|[。！？!?\n]+/gu) ?? []
  const a = split(before),
    b = split(after)
  if (a.length * b.length > 60000)
    return [
      { kind: "removed", text: before },
      { kind: "added", text: after },
    ]
  const width = b.length + 1
  const cells = new Uint32Array((a.length + 1) * width)
  const get = (i: number, j: number) => cells[i * width + j] ?? 0
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      cells[i * width + j] =
        a[i] === b[j]
          ? get(i + 1, j + 1) + 1
          : Math.max(get(i + 1, j), get(i, j + 1))
  const result: TextChange[] = []
  let i = 0,
    j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      result.push({ kind: "same", text: a[i++] ?? "" })
      j++
    } else if (
      i < a.length &&
      (j === b.length || get(i + 1, j) >= get(i, j + 1))
    ) {
      result.push({ kind: "removed", text: a[i++] ?? "" })
    } else result.push({ kind: "added", text: b[j++] ?? "" })
  }
  return result
}
