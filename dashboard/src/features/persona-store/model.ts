import type { ArtifactDetail } from "../control/model.ts"
import { seedSchema, type PersonaSeed } from "../shell/model.ts"
/** A blueprint contains authored persona fields, never Source bodies or evidence links. */
export function personaBlueprint(
  detail: ArtifactDetail,
  name: string,
  id: string
): PersonaSeed {
  if (detail.artifact.header.family !== "persona")
    throw new Error("只能将人格保存为蓝图")
  const payload = detail.artifact.payload
  return seedSchema.parse({
    id,
    name,
    version: "1.0.0",
    persona: payload["text"],
    style: payload["style"] ?? {},
    boundaries: payload["boundaries"] ?? [],
    license: payload["seed_license"] || "private",
    source:
      typeof payload["seed_source"] === "string"
        ? payload["seed_source"]
        : "user-created persona blueprint",
    content_rating: payload["content_rating"] || "unrated",
    locale: payload["locale"] || "zh-CN",
  })
}

/** Compare provenance versions; a newer local file is not installed automatically. */
export function packInstallLabel(
  pack: { id: string; version: string },
  persona: { seedId?: string; seedVersion?: string } | null | undefined
): string {
  if (!persona?.seedId || persona.seedId !== pack.id) return ""
  return persona.seedVersion === pack.version
    ? " · 已安装此版本"
    : ` · 当前使用 v${persona.seedVersion || "未知"}，此版本未安装`
}
