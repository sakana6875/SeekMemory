import { BookOpen, CircleDot, Fingerprint, Sparkles, Users } from "lucide-react"
import { memoryCategories, type MemoryCategory } from "../model"
import type { CategoryFilter, StateFilter } from "../library-state"
import type { SelectOption } from "@/ui"

export const categoryLabels = {
  fact: "事实",
  scene: "场景",
  detail: "细节",
  impression: "印象",
  persona: "人格",
  example: "对话示例",
  media: "媒体资料",
  secret: "保密提示",
  designated: "托付记忆",
} satisfies Record<MemoryCategory, string>

export const categoryDescriptions = {
  fact: "记下的信息，例如偏好、约定或计划；不代表已经核实。",
  scene: "发生过的一段经历，保留当时的情境。",
  detail: "经历中的具体细节，例如一句话或一个动作。",
  impression: "从互动中形成的印象与判断，可能随新信息变化。",
  persona: "机器人的性格、表达习惯与行为原则。",
  example: "供机器人参考表达方式的一轮用户与助手对话（语料）。",
  media: "图片、文章等媒体的摘要与链接，不是原始文件。",
  secret: "只记录有件事需要保密的提示（秘密影子），不保存秘密正文。",
  designated: "用户明确托付保存的内容；满足私聊、触发词等条件后才交付。",
} satisfies Record<MemoryCategory, string>

export const scopeLabels = {
  private: "私有",
  shared: "共享",
  shadow: "仅提供提示",
} as const

export const scopeDescriptions = {
  private: "按人物、当前会话和隐私规则决定是否使用，不等于只在来源会话可用。",
  shared: "允许跨会话参与召回，实际表达仍受隐私规则约束。",
  shadow: "影子模式：给回复模型提供模糊提示，不提供记忆正文。",
} satisfies Record<keyof typeof scopeLabels, string>

export const categoryIcons = {
  fact: CircleDot,
  scene: BookOpen,
  detail: Fingerprint,
  impression: Sparkles,
  persona: Users,
  example: BookOpen,
  media: CircleDot,
  secret: Fingerprint,
  designated: Sparkles,
}

export const categoryFilterOptions: readonly SelectOption<CategoryFilter>[] = [
  { value: "all", label: "全部类型" },
  ...memoryCategories.map((value) => ({ value, label: categoryLabels[value] })),
]

export const stateFilterOptions: readonly SelectOption<StateFilter>[] = [
  { value: "all", label: "全部状态" },
  { value: "active", label: "有效记忆" },
  { value: "forgotten", label: "已遗忘" },
  { value: "merged", label: "已合并" },
]

export const memoryDateFormat = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Shanghai",
})
