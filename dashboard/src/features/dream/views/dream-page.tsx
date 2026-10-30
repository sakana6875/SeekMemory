import { dreamSchedule, dreamStatus, dreamStopReason } from "../model"
import { useCallback, useState } from "react"
import { Moon, ArrowUpRight } from "lucide-react"
import { Badge, DetailDrawer } from "@/ui"
import type { RuntimeStatus } from "@/features/control/model"
import type { ConsoleClient, DreamEntry } from "@/features/shell/model"
import { useResource } from "@/features/shell/use-resource"
import { PageIntro, ResourceState } from "@/features/shell/page-parts"
export function DreamPage({
  client,
  status,
}: {
  client: ConsoleClient
  status: RuntimeStatus | null
}) {
  const read = useCallback(() => client.dream(), [client])
  const vm = useResource(read)
  const [selected, setSelected] = useState<DreamEntry | null>(null)
  return (
    <div className="console-page">
      <PageIntro title="梦境手记" />
      <p className="mb-6 text-sm text-muted-foreground">
        {dreamSchedule(status?.config)}
      </p>
      <ResourceState
        loading={vm.loading}
        error={vm.error}
        empty={vm.data?.items.length === 0}
        onRetry={vm.reload}
      />
      <div className="dream-list">
        {vm.data?.items.map((entry) => (
          <button
            className="console-panel dream-card"
            key={entry.date}
            onClick={() => setSelected(entry)}
          >
            <span className="dream-moon">
              <Moon size={24} />
            </span>
            <div>
              <h2>{entry.date}</h2>
              <p>
                {entry.batches} 个批次 · 写入 {entry.written} 条记忆
              </p>
            </div>
            <div className="ml-auto text-right">
              <Badge
                tone={
                  entry.status === "failed" || entry.stopped
                    ? "warning"
                    : "success"
                }
              >
                {dreamStatus(entry)}
              </Badge>
              <p>{entry.calls} 次模型调用</p>
            </div>
            <ArrowUpRight size={16} />
          </button>
        ))}
      </div>
      <DetailDrawer
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        title="梦境详情"
        description="本次整理的调用与写入情况"
      >
        <div className="p-6">
          <h2 className="mb-6 text-xl">{selected?.date}</h2>
          <dl className="grid grid-cols-2 gap-6">
            {[
              ["批次数", selected?.batches],
              ["写入记忆", selected?.written],
              ["模型调用", selected?.calls],
              ["输入 Token", selected?.usageIn],
              ["输出 Token", selected?.usageOut],
              ["错误数", selected?.errorCount],
              ["候选", selected?.candidates ?? "未记录"],
              ["符合条件", selected?.eligible ?? "未记录"],
              ["已选择", selected?.selected ?? "未记录"],
              ["已跳过", selected?.skipped ?? "未记录"],
              ["待处理", selected?.pending ?? "未记录"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-2 text-2xl">{value}</dd>
              </div>
            ))}
          </dl>
          {selected && dreamStopReason(selected) && (
            <p role="status" className="mt-6 text-sm">
              {dreamStopReason(selected)}
            </p>
          )}
          {!!selected?.errorCount && (
            <p className="mt-8 text-sm">
              本次整理有异常，请到系统页检查日志中的错误类型。
            </p>
          )}
        </div>
      </DetailDrawer>
    </div>
  )
}
