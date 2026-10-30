import { ChevronLeft, ChevronRight, Search, TriangleAlert } from "lucide-react"
import { Badge, Button, Skeleton } from "@/ui"
import { MemoryFilters, type MemoryListFilters } from "./memory-filters"
export type { MemoryListFilters } from "./memory-filters"
import type { MemoryLibraryViewModel } from "../use-memory-library"
import {
  categoryLabels,
  categoryDescriptions,
  memoryDateFormat,
} from "./presentation"

interface MemoryListProps {
  vm: MemoryLibraryViewModel
  onSelect: (id: string) => void
  onRetry: () => void
  filters?: MemoryListFilters | undefined
}

export function MemoryList({
  vm,
  onSelect,
  onRetry,
  filters,
}: MemoryListProps) {
  const {
    source,
    setPage,
    hasFilters,
    pageRecords,
    currentPage,
    pageCount,
    resultCount,
  } = vm
  const anyFilters = hasFilters || !!filters?.selections.length
  const status = source.status
  let summary = `共 ${resultCount} 条记忆`
  if (status === "loading") summary = "加载中…"
  else if (status === "error") summary = "加载失败"
  return (
    <section aria-label="记忆列表" className="min-w-0">
      <MemoryFilters vm={vm} filters={filters} />

      {status === "loading" && (
        <div role="status" aria-label="正在加载记忆" className="divide-y">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-3 p-5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      )}
      {source.status === "error" && (
        <div role="alert" className="px-6 py-20 text-center">
          <TriangleAlert className="mx-auto mb-4 size-8 text-destructive" />
          <h2 className="font-medium">暂时无法加载记忆</h2>
          <p className="mt-2 mb-5 text-sm text-muted-foreground">
            {source.message}
          </p>
          <Button variant="outline" onClick={onRetry}>
            重试加载
          </Button>
        </div>
      )}
      {status === "ready" && pageRecords.length === 0 && (
        <div role="status" className="px-6 py-20 text-center">
          <Search className="mx-auto mb-4 size-8 text-muted-foreground/40" />
          <h2 className="font-medium">
            {anyFilters ? "没有找到匹配的记忆" : "这里还没有记忆"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {anyFilters
              ? "试试其他关键词，或调整筛选条件。"
              : "新的记忆形成后，会出现在这个位置。"}
          </p>
        </div>
      )}
      {status === "ready" && pageRecords.length > 0 && (
        <div>
          <div
            aria-hidden="true"
            className="hidden grid-cols-[minmax(0,1fr)_5rem_7rem_6rem] gap-5 border-y py-3 text-xs text-muted-foreground md:grid"
          >
            <span>记忆</span>
            <span>类型</span>
            <span>相关对象</span>
            <span title="北京时间，按最近更新排序">最近更新</span>
          </div>
          <ul className="divide-y border-t md:border-t-0">
            {pageRecords.map((record) => (
              <li key={record.id}>
                <button
                  onClick={() => onSelect(record.id)}
                  aria-haspopup="dialog"
                  className="grid w-full gap-3 rounded-sm py-5 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset md:grid-cols-[minmax(0,1fr)_5rem_7rem_6rem] md:items-center md:gap-5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="line-clamp-2 text-sm leading-6 font-medium">
                        {record.title}
                      </h2>
                      {record.state !== "active" && (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-xs font-normal text-muted-foreground"
                        >
                          {record.state === "forgotten" ? "已遗忘" : "已合并"}
                        </Badge>
                      )}
                    </div>
                    {record.text !== record.title && (
                      <p className="mt-1 line-clamp-1 text-sm leading-6 text-muted-foreground">
                        {record.text}
                      </p>
                    )}
                  </div>
                  <span
                    title={categoryDescriptions[record.category]}
                    className="hidden text-xs text-muted-foreground md:block"
                  >
                    {categoryLabels[record.category]}
                  </span>
                  <span
                    className="hidden truncate text-xs text-muted-foreground md:block"
                    title={record.subject}
                  >
                    {record.subject}
                  </span>
                  <span
                    className="hidden text-xs text-muted-foreground tabular-nums md:block"
                    title="北京时间"
                  >
                    {memoryDateFormat.format(new Date(record.updatedAt))}
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground md:hidden">
                    <span>{categoryLabels[record.category]}</span>
                    <span>{record.subject}</span>
                    <span>
                      {memoryDateFormat.format(new Date(record.updatedAt))}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <footer className="flex items-center justify-between gap-3 border-t py-4">
        <p aria-live="polite" className="text-[11px] text-muted-foreground">
          {summary} · 北京时间
        </p>
        <div className="flex items-center gap-2">
          <Button
            aria-label="上一页"
            variant="ghost"
            size="icon-xs"
            disabled={currentPage === 0 || status !== "ready"}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {currentPage + 1} / {pageCount}
          </span>
          <Button
            aria-label="下一页"
            variant="ghost"
            size="icon-xs"
            disabled={currentPage + 1 >= pageCount || status !== "ready"}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </footer>
    </section>
  )
}
