import type { Env, Todo } from "../types";
import { fetchTodos, updateItemStatus } from "../lib/github";
import { buildTodoCard, buildItemCard, buildWipFullCard } from "../lib/cards";
import { TRANSITIONS, ACTION_VERB, WIP_LIMITS, type ActionName, type StateName } from "../lib/state";
import { rollReward } from "../lib/reward";

const KNOWN_ACTIONS = new Set<string>(Object.keys(TRANSITIONS));

/**
 * 飞书卡片按钮回调(card.action.trigger)。
 * 解析 event.action.value → {action, itemId, title} → WIP 检查 → 状态转换 → 返回新卡(Method A 就地更新)。
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
    // complete 走庆祝卡,不需要列表;其余先拉列表(WIP 检查 + 乐观更新复用)
    const todos: Todo[] = action === "complete" ? [] : await fetchTodos(env);

    // WIP 检查:目标状态有上限(Doing 3 / Next 5 / Paused 5)且已达上限 → 拦截
    const limit = WIP_LIMITS[target];
    if (limit !== undefined && todos.filter((t) => t.status === target).length >= limit) {
      return {
        card: { type: "raw", data: buildWipFullCard(target, limit) },
        toast: { type: "warning", content: `${target} 已满(${limit}/${limit})` },
      };
    }

    await updateItemStatus(env, itemId, target);

    // 完成:庆祝卡 + Variable Reward 搞怪文案
    if (action === "complete") {
      return {
        card: { type: "raw", data: buildItemCard({ itemId, title, status: "Done" }, `🎉 ${rollReward()}`) },
        toast: { type: "success", content: "已完成" },
      };
    }

    // 其它:乐观更新列表(项移到新分组;终态 Done/Abandoned 移除)
    const updated = todos
      .map((t) => (t.itemId === itemId ? { ...t, status: target } : t))
      .filter((t) => t.status !== "Done" && t.status !== "Abandoned");
    return {
      card: { type: "raw", data: buildTodoCard(updated) },
      toast: { type: "success", content: `已${ACTION_VERB[action as ActionName]}` },
    };
  } catch (e) {
    return ack("error", (e as Error).message);
  }
}

function ack(type: "success" | "error", content: string): Record<string, unknown> {
  return { toast: { type, content } };
}
