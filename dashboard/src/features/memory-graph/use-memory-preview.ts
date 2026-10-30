import { useCallback } from "react"
import type { GraphNode } from "../shell/model.ts"
import type { ManagementClient } from "../control/model.ts"
import { useResource } from "../shell/use-resource.ts"

export function useMemoryPreview(
  node: GraphNode,
  readDetail: ManagementClient["detail"]
) {
  const read = useCallback(async () => {
    if (node.protected) return null
    const detail = await readDetail(node.id)
    if (detail.artifact.header.id !== node.id)
      throw new Error("记忆详情与选中节点不一致")
    return detail
  }, [node.id, node.protected, readDetail])
  const vm = useResource(read)
  const payload = vm.data?.artifact.payload
  const text = (key: string) =>
    typeof payload?.[key] === "string" ? payload[key] : ""
  let content =
    text("text") ||
    text("content") ||
    text("summary") ||
    text("title") ||
    node.label
  if (vm.data?.artifact.header.family === "example")
    content = `用户：${text("user")}\n回复：${text("assistant")}`
  return { ...vm, content: node.protected ? node.label : content }
}
