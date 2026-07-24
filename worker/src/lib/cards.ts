import type { Todo } from "../types";
import { BUTTONS, STATUS_META, isStateName, type StateName } from "./state";

type Json = Record<string, unknown>;

/**
 * 飞书卡片用 **V1 经典格式**(顶层 elements + config.wide_screen)。
 * 注意:按钮元素 `tag:"action"` 只在 V1 支持;V2(schema 2.0 + body.elements)会报
 * "schema V2 no longer support tag action"(230099)。故整卡保持 V1。
 */
function card(color: string, title: string, elements: Json[]): Json {
  return {
    config: { wide_screen: true },
    header: { title: { tag: "plain_text", content: title }, template: color },
    elements,
  };
}

/** 某状态对应的按钮 action 行(无按钮的终态返回 null) */
function actionRow(itemId: string, title: string, status: StateName): Json | null {
  const btns = BUTTONS[status];
  if (!btns.length) return null;
  return {
    tag: "action",
    actions: btns.map((b) => ({
      tag: "button",
      text: { tag: "plain_text", content: b.label },
      type: b.type,
      value: { action: b.action, itemId, title }, // 回调原样带回
    })),
  };
}

/** /today 卡片:按状态分组(Doing→Next→Paused→Backlog),每项带操作按钮 */
export function buildTodoCard(todos: Todo[]): Json {
  const order: StateName[] = ["Doing", "Next", "Paused", "Backlog"];
  const elements: Json[] = [];
  for (const st of order) {
    const group = todos.filter((t) => t.status === st);
    if (!group.length) continue;
    elements.push({
      tag: "div",
      text: { tag: "lark_md", content: `**${STATUS_META[st].emoji} ${st}** · ${group.length}` },
    });
    for (const it of group) {
      elements.push({ tag: "div", text: { tag: "lark_md", content: it.title } });
      const row = actionRow(it.itemId, it.title, st);
      if (row) elements.push(row);
    }
  }
  if (!elements.length) {
    elements.push({ tag: "div", text: { tag: "lark_md", content: "🌱 今天没有待办,享受一天 / 或 /add 加一张" } });
  }
  elements.push({ tag: "hr" });
  elements.push({ tag: "note", elements: [{ tag: "plain_text", content: "—— 野薯" }] });
  return card("orange", "今日待办", elements);
}

/** 单项卡片(预留:Slice 2 完成时的庆祝卡) */
export function buildItemCard(item: { itemId: string; title: string; status: string }, extra?: string): Json {
  const status: StateName = isStateName(item.status) ? item.status : "Backlog";
  const meta = STATUS_META[status];
  const elements: Json[] = [{ tag: "div", text: { tag: "lark_md", content: `状态:**${status}**` } }];
  if (extra) elements.push({ tag: "div", text: { tag: "lark_md", content: extra } });
  const row = actionRow(item.itemId, item.title, status);
  if (row) elements.push(row);
  return card(meta.color, `${meta.emoji} ${item.title}`, elements);
}

/** Slice 2:WIP 超限拦截卡 */
export function buildWipFullCard(status: StateName, limit: number): Json {
  return card("red", `⛔ ${status} 已满(${limit}/${limit})`, [
    { tag: "div", text: { tag: "lark_md", content: `先把一张 **${status}** 处理掉,再来开新的。` } },
  ]);
}

/** /add 成功反馈卡片 */
export function buildAddedCard(title: string): Json {
  return card("green", "✅ 已加入 Backlog", [
    { tag: "div", text: { tag: "lark_md", content: title } },
    { tag: "div", text: { tag: "lark_md", content: "_/today 查看并可「📅 排期」到 Next_" } },
    { tag: "hr" },
    { tag: "note", elements: [{ tag: "plain_text", content: "—— 野薯" }] },
  ]);
}

/** 飞书 interactive 卡片消息体(sendCard 用) */
export function interactiveMessage(cardObj: Json): Json {
  return { msg_type: "interactive", card: cardObj };
}
