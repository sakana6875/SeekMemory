import type { DreamEntry } from "../shell/model.ts"
export function dreamStopReason(entry: Pick<DreamEntry, "stopped">): string {
  if (entry.stopped === "call_budget")
    return "达到本次模型调用次数上限，已提前停止；未处理内容留待后续整理。"
  if (entry.stopped === "token_budget")
    return "达到本次 Token 预算上限，已提前停止；未处理内容留待后续整理。"
  return ""
}
export function dreamStatus(
  entry: Pick<DreamEntry, "status" | "stopped">
): string {
  if (entry.status === "failed") return "需要检查"
  if (dreamStopReason(entry)) return "预算用尽，提前停止"
  return (
    { done: "整理完成", running: "整理中", unknown: "状态未记录" }[
      entry.status
    ] ?? "状态未记录"
  )
}
export function dreamSchedule(
  config: Record<string, unknown> | undefined
): string {
  if (config?.["dream_enabled"] === false)
    return "自动 Dream 已关闭，不会按每日时间运行。"
  if (config?.["dream_enabled"] !== true) return "自动 Dream 启用状态未获取。"
  return `自动 Dream 已开启 · 每日 ${typeof config["dream_time"] === "string" ? config["dream_time"] : "时间未获取"} · 调度以宿主时间为准`
}
