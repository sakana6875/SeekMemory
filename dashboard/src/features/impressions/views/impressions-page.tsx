import { useCallback, useState } from "react"
import { ArrowUpRight, Search } from "lucide-react"
import { Badge, Button, Input } from "@/ui"
import type { ConsoleClient } from "@/features/shell/model"
import { useResource } from "@/features/shell/use-resource"
import {
  PageIntro,
  ResourceState,
  formatDate,
} from "@/features/shell/page-parts"
export function ImpressionsPage({
  client,
  onInspect,
}: {
  client: ConsoleClient
  onInspect: (id: string) => void
}) {
  const [offset, setOffset] = useState(0),
    [query, setQuery] = useState("")
  const read = useCallback(() => client.impressions(offset), [client, offset])
  const vm = useResource(read)
  const cards =
    vm.data?.items.filter((c) =>
      `${c.displayName} ${c.summary}`
        .toLowerCase()
        .includes(query.toLowerCase())
    ) ?? []
  return (
    <div className="console-page">
      <PageIntro title="印象小册" />
      <div className="console-toolbar">
        <Search size={17} />
        <Input
          aria-label="搜索当前页印象"
          placeholder="搜索当前页的人或印象…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <span className="ml-auto text-xs text-muted-foreground">
          {vm.data?.total ?? 0} 份印象
        </span>
      </div>
      <ResourceState
        loading={vm.loading}
        error={vm.error}
        empty={!!vm.data && !cards.length}
        onRetry={vm.reload}
      />
      <div className="impression-grid">
        {cards.map((card) => (
          <button
            key={card.id}
            className="console-panel impression-card"
            onClick={() => onInspect(card.id)}
          >
            <div className="flex items-center gap-3">
              <span className="person-avatar">
                {card.displayName.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 text-left">
                <h2 className="truncate font-semibold">{card.displayName}</h2>
                <span className="text-xs text-muted-foreground">
                  {card.subjectKind === "self" ? "关于自己" : card.subjectKind}
                </span>
              </div>
              <ArrowUpRight size={15} className="ml-auto" />
            </div>
            <p className="line-clamp-3 text-left leading-7">{card.summary}</p>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <Badge variant="secondary">
                {card.scope === "shared" ? "共享" : "私密"}
              </Badge>
              <span>
                {card.evidenceCount} 条来源 · 置信度{" "}
                {Math.round(card.confidence * 100)}%
              </span>
            </div>
            <p className="text-left text-xs text-muted-foreground">
              更新于 {formatDate(card.updatedAt)}
            </p>
          </button>
        ))}
      </div>
      {vm.data && vm.data.total > 100 && (
        <div className="console-toolbar">
          <Button
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 100))}
          >
            上一页
          </Button>
          <Button
            disabled={offset + 100 >= vm.data.total}
            onClick={() => setOffset(offset + 100)}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  )
}
