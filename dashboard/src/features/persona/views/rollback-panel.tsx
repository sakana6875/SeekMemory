import { useId, useRef, useState } from "react"
import { Button, Textarea } from "@/ui"
import type { ConsoleClient } from "@/features/shell/model"
import { VersionDiff } from "./version-diff"
export function RollbackPanel({
  client,
  id,
  revision,
  currentText,
  targetText,
  blocked,
  onSaved,
}: {
  client: ConsoleClient
  id: string
  revision: number
  currentText: string
  targetText: string
  blocked: boolean
  onSaved: () => Promise<void>
}) {
  const reasonId = useId()
  const [reason, setReason] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const acting = useRef(false)
  const submit = async () => {
    if (
      acting.current ||
      !confirmed ||
      blocked ||
      !reason.trim() ||
      reason.trim().length > 300
    )
      return
    acting.current = true
    setBusy(true)
    setError("")
    try {
      const result = await client.rollbackPersona({
        id,
        revision,
        reason: reason.trim(),
        confirmed: true,
      })
      setNotice(
        `已将第 ${result.restoredRevision} 版恢复为第 ${result.revision} 版，原有历史已保留。`
      )
      setConfirmed(false)
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "回滚失败，请刷新后重试")
    } finally {
      acting.current = false
      setBusy(false)
    }
  }
  return (
    <section className="space-y-4 border-t pt-5">
      <h3 className="font-semibold">恢复为此版本</h3>
      <p className="text-sm text-muted-foreground">
        以下比较当前人格与第 {revision} 版。确认后新增版本，不删除历史。
      </p>
      <VersionDiff before={currentText} after={targetText} />
      <label htmlFor={reasonId} className="block space-y-2 text-sm">
        回滚原因
        <Textarea
          id={reasonId}
          aria-label="回滚原因"
          value={reason}
          disabled={busy || !!notice}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || !!notice}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        我已核对差异，确认恢复所选版本
      </label>
      {blocked && (
        <p className="text-sm">引擎未就绪或维护任务正在运行，请稍后重试。</p>
      )}
      <Button
        disabled={busy || blocked || !!notice || !confirmed || !reason.trim()}
        onClick={() => {
          void submit()
        }}
      >
        {busy ? "正在恢复…" : `确认恢复第 ${revision} 版`}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      )}
    </section>
  )
}
