import { useCallback, useEffect, useRef, useState } from "react"
export function useResource<T>(read: () => Promise<T>) {
  const [state, setState] = useState<{
    owner: typeof read
    data: T | null
    loading: boolean
    error: string
  }>({ owner: read, data: null, loading: true, error: "" })
  const gate = useRef({ version: 0 })
  const reload = useCallback(() => {
    const current = ++gate.current.version
    return Promise.resolve()
      .then(read)
      .then((data) => {
        if (current === gate.current.version)
          setState({ owner: read, data, loading: false, error: "" })
      })
      .catch((error: unknown) => {
        if (current === gate.current.version)
          setState({
            owner: read,
            data: null,
            loading: false,
            error: error instanceof Error ? error.message : "读取失败",
          })
      })
  }, [read])
  useEffect(() => {
    const current = gate.current
    void reload()
    return () => {
      current.version++
    }
  }, [reload])
  if (state.owner !== read)
    return { data: null, loading: true, error: "", reload }
  return { ...state, reload }
}
