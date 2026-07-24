/**
 * V2-a 状态机(spec §4.1 / §4.2)。纯数据,无 IO。
 *
 * 6 状态:Backlog / Next / Doing / Paused / Done / Abandoned
 * 按钮点 → action → 目标状态(TRANSITIONS);每状态出哪些按钮(BUTTONS)。
 *
 * 说明:§4.2 原文 Backlog 无按钮。V2-a 为闭合「/add→Backlog→排期→Next→开始→Done」
 * 交互环,给 Backlog 加了 [📅 排期](→Next)与 [❌ 放弃]——最小扩展,不与 spec 冲突。
 */

export type StateName = "Backlog" | "Next" | "Doing" | "Paused" | "Done" | "Abandoned";

export type ActionName =
  | "schedule" // 排期 Backlog→Next
  | "defer" // 改天 Next→Backlog
  | "start" // 开始 Next→Doing
  | "complete" // 完成 Doing→Done
  | "pause" // 暂停 Doing→Paused
  | "resume" // 恢复 Paused→Doing
  | "demote" // 降级 Paused→Backlog
  | "abandon"; // 放弃 →Abandoned

/** action → 目标状态 */
export const TRANSITIONS: Record<ActionName, StateName> = {
  schedule: "Next",
  defer: "Backlog",
  start: "Doing",
  complete: "Done",
  pause: "Paused",
  resume: "Doing",
  demote: "Backlog",
  abandon: "Abandoned",
};

/** action 的中文动词(反馈文案用) */
export const ACTION_VERB: Record<ActionName, string> = {
  schedule: "排期",
  defer: "改天",
  start: "开始",
  complete: "完成",
  pause: "暂停",
  resume: "恢复",
  demote: "降级",
  abandon: "放弃",
};

export interface ButtonDef {
  label: string;
  action: ActionName;
  type: "primary" | "default" | "danger";
}

/** 各状态的按钮集(§4.2 + Backlog 扩展);终态 Done/Abandoned 无按钮 */
export const BUTTONS: Record<StateName, ButtonDef[]> = {
  Backlog: [
    { label: "📅 排期", action: "schedule", type: "primary" },
    { label: "❌ 放弃", action: "abandon", type: "danger" },
  ],
  Next: [
    { label: "▶️ 开始", action: "start", type: "primary" },
    { label: "🔁 改天", action: "defer", type: "default" },
    { label: "❌ 放弃", action: "abandon", type: "danger" },
  ],
  Doing: [
    { label: "✅ 完成", action: "complete", type: "primary" },
    { label: "⏸ 暂停", action: "pause", type: "default" },
    { label: "❌ 放弃", action: "abandon", type: "danger" },
  ],
  Paused: [
    { label: "▶️ 恢复", action: "resume", type: "primary" },
    { label: "📦 降级", action: "demote", type: "default" },
    { label: "❌ 放弃", action: "abandon", type: "danger" },
  ],
  Done: [],
  Abandoned: [],
};

/** WIP 上限(§5.1;Slice 2 用) */
export const WIP_LIMITS: Partial<Record<StateName, number>> = {
  Doing: 3,
  Next: 5,
  Paused: 5,
};

/** 卡片渲染用:每状态的 emoji + 飞书 header 颜色 */
export const STATUS_META: Record<StateName, { emoji: string; color: string }> = {
  Backlog: { emoji: "📥", color: "grey" },
  Next: { emoji: "👉", color: "blue" },
  Doing: { emoji: "🔥", color: "orange" },
  Paused: { emoji: "⏸️", color: "purple" },
  Done: { emoji: "✅", color: "green" },
  Abandoned: { emoji: "🗑️", color: "grey" },
};

export function isStateName(s: string): s is StateName {
  return s in STATUS_META;
}
