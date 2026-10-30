import { useState, type ReactNode } from "react"
import { Search, SlidersHorizontal, X } from "lucide-react"
import { Button, DetailDrawer, Input } from "@/ui"
import type { MemoryLibraryViewModel } from "../use-memory-library"
import {
  categoryFilterOptions,
  categoryLabels,
  categoryDescriptions,
  stateFilterOptions,
} from "./presentation"

export interface FilterSelection {
  label: string
  onClear: () => void
}
export interface MemoryListFilters {
  controls: ReactNode
  selections: FilterSelection[]
  onReset: () => void
}

export function FilterChoices<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly {
    value: T
    label: string
    description?: string | undefined
    count?: number | undefined
  }[]
  onChange: (value: T) => void
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={
              option.description ? "w-full cursor-pointer" : "cursor-pointer"
            }
          >
            <input
              type="radio"
              name={label}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span className="block rounded-lg border px-3 py-2 text-sm transition-colors peer-checked:border-primary peer-checked:bg-secondary peer-focus-visible:ring-2 peer-focus-visible:ring-ring hover:bg-muted/50">
              <span className="flex items-center justify-between gap-3">
                <span>{option.label}</span>
                {option.count !== undefined && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {option.count} 条记忆
                  </span>
                )}
              </span>
              {option.description && (
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {option.description}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function MemoryFilters({
  vm,
  filters,
}: {
  vm: MemoryLibraryViewModel
  filters?: MemoryListFilters | undefined
}) {
  const [open, setOpen] = useState(false)
  const { category, state, query } = vm.filters
  const selections: FilterSelection[] = [...(filters?.selections ?? [])]
  if (category !== "all")
    selections.unshift({
      label: `类型：${categoryLabels[category]}`,
      onClear: () => vm.setCategory("all"),
    })
  if (state !== "all")
    selections.push({
      label: `状态：${stateFilterOptions.find((option) => option.value === state)?.label ?? state}`,
      onClear: () => vm.setState("all"),
    })
  const reset = () => {
    vm.resetFilters()
    filters?.onReset()
  }
  return (
    <>
      <div className="space-y-3 pb-6">
        <div className="flex items-center gap-3">
          <div className="relative max-w-md min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              aria-label="搜索记忆"
              placeholder="搜索内容、标签或相关对象…"
              value={query}
              onChange={(event) => vm.setQuery(event.target.value)}
              className="h-9 bg-background pr-9 pl-9"
            />
            {query && (
              <Button
                aria-label="清空搜索"
                variant="ghost"
                size="icon-xs"
                className="absolute top-1.5 right-1.5"
                onClick={() => vm.setQuery("")}
              >
                <X />
              </Button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            aria-haspopup="dialog"
            aria-label="筛选记忆"
            onClick={() => setOpen(true)}
          >
            <SlidersHorizontal />
            筛选{selections.length > 0 && <span>{selections.length}</span>}
          </Button>
        </div>
        {(selections.length > 0 || query) && (
          <div
            className="flex flex-wrap items-center gap-2"
            aria-label="已选筛选条件"
          >
            {selections.map((selection) => (
              <Button
                key={selection.label}
                variant="secondary"
                size="xs"
                aria-label={`取消${selection.label}`}
                onClick={selection.onClear}
                className="max-w-full"
              >
                <span className="truncate">{selection.label}</span>
                <X className="shrink-0" />
              </Button>
            ))}
            <Button variant="ghost" size="xs" onClick={reset}>
              清除全部
            </Button>
          </div>
        )}
      </div>
      <DetailDrawer
        open={open}
        onOpenChange={setOpen}
        title="筛选记忆"
        description="按类型、状态、使用范围和来源会话筛选，选择后立即生效。"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
          <h2 className="text-lg font-semibold">筛选记忆</h2>
          <Button size="sm" onClick={() => setOpen(false)}>
            {vm.source.status === "ready"
              ? `查看 ${vm.resultCount} 条记忆`
              : "返回列表"}
          </Button>
        </div>
        <div className="space-y-7 p-6">
          <FilterChoices
            label="记忆类型"
            value={category}
            onChange={vm.setCategory}
            options={categoryFilterOptions.map((option) => {
              const count =
                option.value === "all"
                  ? vm.stats.total
                  : vm.categoryCounts[option.value]
              return {
                ...option,
                label: option.value === "all" ? "不限类型" : option.label,
                description:
                  option.value === "all"
                    ? undefined
                    : categoryDescriptions[option.value],
                count: vm.source.status === "ready" ? count : undefined,
              }
            })}
          />
          <FilterChoices
            label="记忆状态"
            value={state}
            onChange={vm.setState}
            options={stateFilterOptions}
          />
          {filters?.controls}
          <Button variant="ghost" size="sm" onClick={reset}>
            清除全部筛选和搜索
          </Button>
        </div>
      </DetailDrawer>
    </>
  )
}
