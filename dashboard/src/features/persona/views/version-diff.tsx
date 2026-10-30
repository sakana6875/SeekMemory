import { personaDiff } from "../diff"
export function VersionDiff({
  before,
  after,
}: {
  before: string
  after: string
}) {
  return (
    <div className="space-y-2 text-sm leading-7" aria-label="人格文字差异">
      <p className="text-xs text-muted-foreground">
        − 表示移除，+ 表示加入；未标记的文字保持不变。
      </p>
      {before === after && <p>人格正文相同。</p>}
      {personaDiff(before, after).map((change, index) => {
        let content = (
          <span className="text-muted-foreground">{change.text}</span>
        )
        if (change.kind === "removed")
          content = (
            <del className="text-destructive">
              <span aria-label="移除">− </span>
              {change.text}
            </del>
          )
        if (change.kind === "added")
          content = (
            <ins className="text-success">
              <span aria-label="加入">+ </span>
              {change.text}
            </ins>
          )
        return (
          <div key={index} className="whitespace-pre-wrap">
            {content}
          </div>
        )
      })}
    </div>
  )
}
