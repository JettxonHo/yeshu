import type { Todo } from "../types";
import { BUTTONS, STATUS_META, isStateName, type StateName } from "./state";

type Json = Record<string, unknown>;

/**
 * 飞书卡片用 **V1 经典格式**(顶层 elements + config.wide_screen)。
 * 注意:按钮元素 `tag:"action"` 只在 V1 支持;V2(schema 2.0 + body.elements)会报
 * "schema V2 no longer support tag action"(230099)。故整卡保持 V1。
 *
 * 设计:状态色编码(STATUS_META)、顶部概览条、item 标题加粗 + Type/Effort/Priority 标签、
 * 组间分隔、🥔 品牌签名、破坏性动作(放弃)带确认弹窗。视觉/文案优化不改 action 值与状态机。
 */
function card(color: string, title: string, elements: Json[]): Json {
  return {
    config: { wide_screen: true },
    header: { title: { tag: "plain_text", content: title }, template: color },
    elements,
  };
}

const SIGN_OFF = "—— 野薯 🥔";

function note(text: string): Json {
  return { tag: "note", elements: [{ tag: "plain_text", content: text }] };
}

function textDiv(md: string): Json {
  return { tag: "div", text: { tag: "lark_md", content: md } };
}

const TYPE_EMOJI: Record<string, string> = {
  Idea: "💡",
  Feature: "✨",
  Bug: "🐞",
  Learn: "📚",
  Show: "🎤",
};
const EFFORT_EMOJI: Record<string, string> = { S: "🟢", M: "🟡", L: "🟠", XL: "🔴" };
const PRIORITY_EMOJI: Record<string, string> = { P0: "🔺", P1: "🟠", P2: "🔹", P3: "▫️" };

/** item 的属性标签(Type / Effort / Priority,有则显示) */
function metaLine(t: Todo): string {
  const parts: string[] = [];
  if (t.type && TYPE_EMOJI[t.type]) parts.push(`${TYPE_EMOJI[t.type]} ${t.type}`);
  if (t.effort && EFFORT_EMOJI[t.effort]) parts.push(`${EFFORT_EMOJI[t.effort]} ${t.effort}`);
  if (t.priority && PRIORITY_EMOJI[t.priority]) parts.push(`${PRIORITY_EMOJI[t.priority]} ${t.priority}`);
  return parts.length ? `\n_${parts.join(" · ")}_` : "";
}

/** 某状态对应的按钮 action 行(无按钮的终态返回 null);放弃带确认弹窗 */
function actionRow(itemId: string, title: string, status: StateName): Json | null {
  const btns = BUTTONS[status];
  if (!btns.length) return null;
  return {
    tag: "action",
    actions: btns.map((b) => {
      const btn: Json = {
        tag: "button",
        text: { tag: "plain_text", content: b.label },
        type: b.type,
        value: { action: b.action, itemId, title }, // 回调原样带回
      };
      if (b.action === "abandon") {
        btn.confirm = {
          title: { tag: "plain_text", content: "放弃这张任务?" },
          text: { tag: "plain_text", content: `「${title}」将移到 Abandoned` },
        };
      }
      return btn;
    }),
  };
}

/** /today 卡片:header 总数 + 顶部概览条,按状态分组,item 带属性标签 + 操作按钮 */
export function buildTodoCard(todos: Todo[]): Json {
  const order: StateName[] = ["Doing", "Next", "Paused", "Backlog"];
  const elements: Json[] = [];
  let total = 0;
  const counts: string[] = [];
  for (const st of order) {
    const n = todos.filter((t) => t.status === st).length;
    total += n;
    if (n > 0) counts.push(`${STATUS_META[st].emoji} ${n} ${st}`);
  }
  if (total === 0) {
    elements.push(textDiv("🌱 今天没有待办,享受一天。\n或 `/add` 加一张新任务。"));
    return card("orange", "🥔 今日待办", elements);
  }
  // 顶部概览条
  elements.push(textDiv(counts.join(" · ")));
  let first = true;
  for (const st of order) {
    const group = todos.filter((t) => t.status === st);
    if (!group.length) continue;
    if (!first) elements.push({ tag: "hr" });
    first = false;
    elements.push(textDiv(`**${STATUS_META[st].emoji} ${st} · ${group.length}**`));
    for (const it of group) {
      elements.push(textDiv(`**${it.title}**${metaLine(it)}`));
      const row = actionRow(it.itemId, it.title, st);
      if (row) elements.push(row);
    }
  }
  elements.push({ tag: "hr" });
  elements.push(note(`点按钮就地流转状态 · ${SIGN_OFF}`));
  return card("orange", `🥔 今日待办 · ${total}`, elements);
}

/** 单项卡片(完成时的庆祝卡):状态 + 奖励文案(加粗)+ 新状态按钮 */
export function buildItemCard(item: { itemId: string; title: string; status: string }, extra?: string): Json {
  const status: StateName = isStateName(item.status) ? item.status : "Backlog";
  const meta = STATUS_META[status];
  const elements: Json[] = [textDiv(`状态:**${status}**`)];
  if (extra) elements.push(textDiv(`**${extra}**`));
  const row = actionRow(item.itemId, item.title, status);
  if (row) elements.push(row);
  return card(meta.color, `${meta.emoji} ${item.title}`, elements);
}

/** WIP 超限拦截卡 */
export function buildWipFullCard(status: StateName, limit: number): Json {
  return card("red", `⛔ ${status} 已满(${limit}/${limit})`, [
    textDiv(`先把一张 **${status}** 处理掉(完成 / 暂停 / 降级),再来开新的。`),
    { tag: "hr" },
    note(`WIP 上限保护你的专注 · ${SIGN_OFF}`),
  ]);
}

/** /add 成功反馈卡片 */
export function buildAddedCard(title: string): Json {
  return card("green", "✅ 已加入 Backlog", [
    textDiv(`**${title}**`),
    textDiv("发 `/today` 查看,或点「📅 排期」提到 Next。"),
    { tag: "hr" },
    note(SIGN_OFF),
  ]);
}

/** 飞书 interactive 卡片消息体(sendCard 用) */
export function interactiveMessage(cardObj: Json): Json {
  return { msg_type: "interactive", card: cardObj };
}
