import type { Env } from "../types";
import { fetchTodos, updateItemStatus } from "../lib/github";
import { buildTodoCard } from "../lib/cards";
import { TRANSITIONS, ACTION_VERB, type ActionName, type StateName } from "../lib/state";

const KNOWN_ACTIONS = new Set<string>(Object.keys(TRANSITIONS));

/**
 * 飞书卡片按钮回调(card.action.trigger)。
 * 解析 event.action.value → {action, itemId, title} → 状态转换 → 返回新卡片(Method A 就地更新)。
 *
 * Method A:在 200 响应体里返回 {card:{type:"raw", data}, toast},飞书单往返就地换卡。
 */
export async function handleCardCallback(env: Env, body: any): Promise<Record<string, unknown>> {
  const value = body?.event?.action?.value ?? {};
  const action = value.action as string | undefined;
  const itemId = value.itemId as string | undefined;
  const title = (value.title as string) ?? "(无标题)";

  if (!action || !KNOWN_ACTIONS.has(action) || !itemId) {
    return ack("error", "无效的按钮操作");
  }
  const target = TRANSITIONS[action as ActionName] as StateName;

  try {
    // Slice 2:WIP 检查(start 时目标状态不得超 WIP_LIMITS,用 countItemsByStatus)
    await updateItemStatus(env, itemId, target);
    // 返回刷新后的 /today 列表(被操作项移到新分组),保持列表上下文
    const todos = await fetchTodos(env);
    return { card: { type: "raw", data: buildTodoCard(todos) }, toast: { type: "success", content: `已${ACTION_VERB[action as ActionName]}` } };
  } catch (e) {
    return ack("error", (e as Error).message);
  }
}

function ack(type: "success" | "error", content: string): Record<string, unknown> {
  return { toast: { type, content } };
}
