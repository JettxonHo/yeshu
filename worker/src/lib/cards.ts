import type { Todo } from "../types";

/** 构造今日待办卡片(§10.2 简化:header + 待办 div + 签名,无按钮) */
export function buildTodoCard(todos: Todo[], title = "今日待办"): Record<string, unknown> {
  const elements: Record<string, unknown>[] =
    todos.length > 0
      ? todos.map((t) => ({ tag: "div", text: { tag: "lark_md", content: `• ${t.title}` } }))
      : [{ tag: "div", text: { tag: "lark_md", content: "🌱 今天没有待办,享受一天 / 或 /add 加一张" } }];
  elements.push({ tag: "hr" });
  elements.push({ tag: "note", elements: [{ tag: "plain_text", content: "—— 野薯" }] });
  return {
    config: { wide_screen: true },
    header: { title: { tag: "plain_text", content: title }, template: "orange" },
    elements,
  };
}

/** /add 成功反馈卡片 */
export function buildAddedCard(title: string): Record<string, unknown> {
  return {
    config: { wide_screen: true },
    header: { title: { tag: "plain_text", content: "✅ 已加入待办" }, template: "green" },
    elements: [
      { tag: "div", text: { tag: "lark_md", content: title } },
      { tag: "hr" },
      { tag: "note", elements: [{ tag: "plain_text", content: "—— 野薯" }] },
    ],
  };
}

/** 飞书 interactive 卡片消息体 */
export function interactiveMessage(card: Record<string, unknown>): Record<string, unknown> {
  return { msg_type: "interactive", card };
}
