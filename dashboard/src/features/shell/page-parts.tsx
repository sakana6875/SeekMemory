import type { ReactNode } from "react"
import { Button } from "@/ui"
export function PageIntro({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: ReactNode
}) {
  return (
    <header className="console-page-intro">
      <div>
        <h1>{title}</h1>
        {description && (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </header>
  )
}
export function ResourceState({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading: boolean
  error: string
  empty?: boolean
  onRetry: () => Promise<void>
}) {
  if (loading)
    return (
      <div role="status" className="console-empty">
        正在读取…
      </div>
    )
  if (error)
    return (
      <div role="alert" className="console-empty">
        <p>{error}</p>
        <Button
          variant="outline"
          onClick={() => {
            void onRetry()
          }}
        >
          重试
        </Button>
      </div>
    )
  if (empty)
    return (
      <div className="console-empty">
        <p>这里还没有记录</p>
      </div>
    )
  return null
}
export function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "时间未记录"
    : date.toLocaleString("zh-CN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
}
