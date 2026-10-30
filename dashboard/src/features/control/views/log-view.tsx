import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowDown, Pause, Play, RefreshCw, Terminal } from "lucide-react"
import { Button, Input, Select } from "@/ui"
import type { ManagementClient } from "../model"
import { useLogs } from "../use-logs"
import { useLogFeed } from "../use-log-feed"
import { LogEntry, logStateLabels } from "./log-entry"
import "./log-view.css"
export function LogView({ client }: { client: ManagementClient }) {
  const read = useCallback(() => client.events(), [client])
  const [visible, setVisible] = useState(!document.hidden)
  useEffect(() => {
    const update = () => setVisible(!document.hidden)
    document.addEventListener("visibilitychange", update)
    return () => document.removeEventListener("visibilitychange", update)
  }, [])
  const feed = useLogFeed(read, visible)
  let feedStatus = "每 3 秒更新"
  if (feed.loading) feedStatus = "正在连接…"
  if (feed.paused) feedStatus = "更新已暂停"
  if (feed.error) feedStatus = "连接异常"
  const vm = useLogs(feed.events)
  const [follow, setFollow] = useState(true)
  const viewport = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = viewport.current
    if (follow && element) element.scrollTop = element.scrollHeight
  }, [feed.events, vm.query, vm.kind, vm.state, vm.level, vm.module, follow])
  return (
    <section className="console-page log-page">
      <header className="console-page-intro log-page-heading">
        <h1>生命周期日志</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => feed.setPaused(!feed.paused)}
            aria-pressed={feed.paused}
          >
            {feed.paused ? <Play /> : <Pause />}
            {feed.paused ? "继续更新" : "暂停更新"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="刷新日志"
            onClick={feed.refresh}
          >
            <RefreshCw />
          </Button>
        </div>
      </header>
      <div className="log-toolbar">
        <Input
          aria-label="搜索日志"
          value={vm.query}
          onChange={(event) => vm.setQuery(event.target.value)}
          placeholder="搜索日志、模块或任务…"
        />
        <Select
          label="日志级别"
          value={vm.level}
          onValueChange={vm.setLevel}
          options={[
            { value: "all", label: "全部级别" },
            ...["DEBUG", "INFO", "WARNING", "ERROR"].map((value) => ({
              value,
              label: value,
            })),
          ]}
        />
        <details className="log-more-filters">
          <summary>
            更多筛选
            {vm.kind !== "all" || vm.state !== "all" || vm.module !== "all"
              ? " · 已筛选"
              : ""}
          </summary>
          <div>
            <Select
              label="日志类型"
              value={vm.kind}
              onValueChange={vm.setKind}
              options={[
                { value: "all", label: "全部类型" },
                ...vm.kinds.map((value) => ({ value, label: value })),
              ]}
            />
            <Select
              label="日志状态"
              value={vm.state}
              onValueChange={vm.setState}
              options={[
                { value: "all", label: "全部状态" },
                ...Object.entries(logStateLabels).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
            />
            <Select
              label="日志模块"
              value={vm.module}
              onValueChange={vm.setModule}
              options={[
                { value: "all", label: "全部模块" },
                ...vm.modules.map((value) => ({ value, label: value })),
              ]}
            />
          </div>
        </details>
        {(vm.query ||
          vm.level !== "all" ||
          vm.kind !== "all" ||
          vm.state !== "all" ||
          vm.module !== "all") && (
          <Button
            variant="ghost"
            onClick={() => {
              vm.setQuery("")
              vm.setLevel("all")
              vm.setKind("all")
              vm.setState("all")
              vm.setModule("all")
            }}
          >
            清除筛选
          </Button>
        )}
      </div>
      <div className="log-console">
        <div className="log-console-bar">
          <span>
            <Terminal size={15} />
            只读日志
          </span>
          <span role="status">{feedStatus}</span>
        </div>
        {feed.error && (
          <p role="alert" className="log-feed-error">
            {feed.error} ·{" "}
            {feed.events.length
              ? "已保留上次日志，可点击刷新重试。"
              : "可点击刷新重试。"}
          </p>
        )}
        <div
          className="log-viewport"
          ref={viewport}
          role="region"
          aria-label="日志输出"
          // Keyboard focus lets users scroll this bounded output without a mouse.
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          onScroll={() => {
            const el = viewport.current
            if (el && el.scrollHeight - el.scrollTop - el.clientHeight > 48)
              setFollow(false)
          }}
        >
          {feed.loading && (
            <p className="log-empty" role="status">
              正在读取日志…
            </p>
          )}
          {!feed.loading && !feed.error && !vm.filtered.length && (
            <p className="log-empty">
              {feed.events.length ? "没有匹配日志，请调整筛选。" : "暂无日志"}
            </p>
          )}
          {vm.filtered.map((event) => (
            <LogEntry
              key={event.id}
              event={event}
              onTask={vm.setQuery}
              onExpand={() => setFollow(false)}
            />
          ))}
        </div>
        <footer className="log-console-bar">
          <span>
            {vm.filtered.length} / {feed.events.length} 条 · 时间从早到晚
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={follow}
            onClick={() => setFollow(!follow)}
          >
            <ArrowDown />
            {follow ? "正在跟随" : "跟随最新"}
          </Button>
        </footer>
      </div>
    </section>
  )
}
