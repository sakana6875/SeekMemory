import { JsonView } from "@/ui"
import type { OperationEvent } from "../model"
export const logStateLabels: Record<string, string> = {
  queued: "排队",
  running: "运行中",
  succeeded: "成功",
  failed: "失败",
  cancelled: "已取消",
  interrupted: "异常中断",
  ready: "就绪",
  stopped: "停止",
  debug: "调试",
  info: "信息",
  warning: "警告",
  reply: "允许回复",
  stop: "本轮不回复",
}
export function LogEntry({
  event,
  onTask,
  onExpand,
}: {
  event: OperationEvent
  onTask: (id: string) => void
  onExpand: () => void
}) {
  const date = new Date(event.at)
  const time = Number.isNaN(date.getTime())
    ? event.at
    : date.toLocaleTimeString("zh-CN", { hour12: false })
  return (
    <details
      className="log-entry"
      data-level={event.level}
      onToggle={(e) => {
        if (e.currentTarget.open) onExpand()
      }}
    >
      <summary>
        <time title={event.at}>{time}</time>
        <span className="log-level">
          {event.level === "WARNING" ? "WARN" : event.level}
        </span>
        <span className="log-module" title={event.source?.module ?? event.kind}>
          {event.stage || event.kind}
        </span>
        <span className="log-message">{event.message}</span>
        <span className="log-expand" aria-hidden="true">
          ⌄
        </span>
      </summary>
      <div className="log-entry-detail">
        <p>
          {event.at} · {logStateLabels[event.status] ?? event.status}
          {event.durationMs !== null
            ? ` · ${event.durationMs.toLocaleString()} ms`
            : ""}
        </p>
        {event.source && (
          <p>
            {event.source.module} · {event.source.file}:{event.source.line} ·{" "}
            {event.source.function}()
          </p>
        )}
        {event.taskId && (
          <button
            className="text-primary underline"
            onClick={() => onTask(event.taskId)}
          >
            筛选任务 {event.taskId}
          </button>
        )}
        {Object.keys(event.context).length > 0 && (
          <JsonView value={event.context} />
        )}
        {event.error && (
          <div className="space-y-2 text-destructive">
            <p>{event.error.type}</p>
            {event.error.frames.map((frame, index) => (
              <p key={`${frame.file}:${frame.line}:${index}`}>
                {frame.module} · {frame.file}:{frame.line} · {frame.function}()
              </p>
            ))}
          </div>
        )}
      </div>
    </details>
  )
}
