import { useState } from "react"
import { Badge, DetailDrawer, Skeleton } from "@/ui"
import type { MemorySource } from "../model"
import { useMemoryLibrary } from "../use-memory-library"
import { MemoryDetail } from "./memory-detail"
import { MemoryList, type MemoryListFilters } from "./memory-list"

interface MemoryWorkspaceProps {
  source: MemorySource
  onRetry: () => void
  filters?: MemoryListFilters
  onInspect?: ((id: string) => void) | undefined
}

export function MemoryWorkspace({
  source,
  onRetry,
  onInspect,
  filters,
}: MemoryWorkspaceProps) {
  const vm = useMemoryLibrary(source)
  const { selected, orderedRecords, navigateToMemory } = vm
  const status = source.status
  const [detailOpen, setDetailOpen] = useState(false)
  const onSelect = (id: string) => {
    vm.selectMemory(id)
    setDetailOpen(true)
  }
  return (
    <div className="flex min-h-0 flex-1">
      <div className="mx-auto w-full max-w-[1240px] space-y-8 px-4 py-8 sm:px-8 sm:py-12 lg:px-12">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              记忆库
            </h1>
            {status === "loading" && <Skeleton className="mt-3 h-5 w-48" />}
            {status === "ready" && (
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>{vm.stats.total} 条记忆</span>
                <span>{vm.stats.active} 条有效</span>
                <span>{vm.stats.forgotten} 条已遗忘</span>
                <span>{vm.stats.versionCount} 个历史版本</span>
              </p>
            )}
          </div>
          {!onInspect && <Badge variant="outline">只读预览</Badge>}
        </header>
        <MemoryList
          vm={vm}
          onSelect={onSelect}
          onRetry={onRetry}
          filters={filters}
        />
      </div>
      <DetailDrawer
        open={detailOpen && status === "ready" && !!selected}
        onOpenChange={setDetailOpen}
        title="记忆详情"
        description="查看内容、版本历史和关联记忆"
      >
        {selected && (
          <MemoryDetail
            key={selected.id}
            memory={selected}
            records={orderedRecords}
            onNavigate={navigateToMemory}
            onInspect={
              onInspect
                ? (id) => {
                    setDetailOpen(false)
                    onInspect(id)
                  }
                : undefined
            }
          />
        )}
      </DetailDrawer>
    </div>
  )
}
