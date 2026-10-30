import { useCallback, useEffect, useState } from "react"
import type { OperationEvent } from "./model.ts"

// The server returns a bounded snapshot; replacing it avoids duplicates and unbounded history.
export function orderedLogs(events: readonly OperationEvent[]) {
  return [...new Map(events.map((event) => [event.id, event])).values()]
    .sort(
      (a, b) =>
        Date.parse(a.at) - Date.parse(b.at) ||
        a.at.localeCompare(b.at) ||
        a.id.localeCompare(b.id)
    )
    .slice(-500)
}
export function useLogFeed(
  read: () => Promise<OperationEvent[]>,
  visible = true
) {
  const [paused, setPaused] = useState(false)
  const [generation, setGeneration] = useState(0)
  const [state, setState] = useState<{
    owner: typeof read
    events: OperationEvent[]
    loading: boolean
    error: string
  }>({ owner: read, events: [], loading: true, error: "" })
  useEffect(() => {
    let disposed = false,
      pending = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      if (disposed || pending || paused || !visible) return
      clearTimeout(timer)
      pending = true
      try {
        const events = orderedLogs(await read())
        if (!disposed)
          setState({ owner: read, events, loading: false, error: "" })
      } catch (error) {
        if (!disposed)
          setState((previous) => ({
            owner: read,
            events: previous.owner === read ? previous.events : [],
            loading: false,
            error: error instanceof Error ? error.message : "日志读取失败",
          }))
      } finally {
        pending = false
        if (!disposed && !paused)
          timer = setTimeout(() => {
            void poll()
          }, 3000)
      }
    }
    void poll()
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [read, paused, generation, visible])
  const refresh = useCallback(() => {
    setPaused(false)
    setGeneration((value) => value + 1)
  }, [])
  const current =
    state.owner === read ? state : { events: [], loading: true, error: "" }
  return { ...current, paused, setPaused, refresh }
}
