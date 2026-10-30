import { Button } from "@/ui"
import type { GraphNode } from "@/features/shell/model"
import type { ManagementClient } from "@/features/control/model"
import { useMemoryPreview } from "../use-memory-preview"
import { kindColors } from "../model"

const states: Record<string, string> = {
  active: "有效",
  forgotten: "已遗忘",
  merged: "已合并",
}
const scopes: Record<string, string> = {
  shared: "共享",
  private: "私有",
  shadow: "仅提供提示",
}
function date(value: string) {
  const at = new Date(value)
  return Number.isNaN(at.getTime())
    ? "未记录"
    : at.toLocaleString("zh-CN", { hour12: false })
}
/** Mounted only after explicit selection. Protected nodes retain the graph's masking. */
export function MemoryCallout({
  node,
  readDetail,
  onInspect,
  onClose,
}: {
  node: GraphNode
  readDetail: ManagementClient["detail"]
  onInspect: (id: string) => void
  onClose: () => void
}) {
  const vm = useMemoryPreview(node, readDetail)
  return (
    <div className="sphere-expanded-content">
      <div className="sphere-memory-body">
        {vm.loading ? <p role="status">正在读取记忆…</p> : <p>{vm.content}</p>}
        {vm.error && (
          <div role="alert" className="sphere-detail-error">
            详情读取失败，暂时显示摘要。
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void vm.reload()
              }}
            >
              重试
            </Button>
          </div>
        )}
        <dl>
          <div>
            <dt>状态</dt>
            <dd>{states[node.state] ?? node.state}</dd>
          </div>
          <div>
            <dt>可见范围</dt>
            <dd>{scopes[node.scope] ?? node.scope}</dd>
          </div>
          <div>
            <dt>可信度</dt>
            <dd>{Math.round(node.confidence * 100)}%</dd>
          </div>
          {vm.data && (
            <div>
              <dt>版本</dt>
              <dd>v{vm.data.artifact.header.revision}</dd>
            </div>
          )}
          <div className="sphere-detail-wide">
            <dt>创建</dt>
            <dd>{date(node.createdAt)}</dd>
          </div>
          <div className="sphere-detail-wide">
            <dt>更新</dt>
            <dd>{date(node.updatedAt)}</dd>
          </div>
        </dl>
      </div>
      <div className="sphere-detail-actions">
        <Button size="sm" variant="ghost" onClick={onClose}>
          收起
        </Button>
        <Button
          size="sm"
          className="sphere-inspect"
          data-bright={["scene", "example", "designated"].includes(node.kind)}
          style={{ backgroundColor: kindColors[node.kind] ?? "var(--primary)" }}
          onClick={() => onInspect(node.id)}
        >
          {node.protected ? "查看受保护详情" : "编辑与审计"}
        </Button>
      </div>
    </div>
  )
}
