import type { Env } from "../types";
import { fetchTodos, updateItemStatus } from "../lib/github";
import { buildTodoCard, buildItemCard, buildWipFullCard } from "../lib/cards";
import { ACTION_VERB, WIP_LIMITS, getTransitionTarget, isActionName } from "../lib/state";
import { rollReward } from "../lib/reward";

/**
 * 飞书卡片按钮回调(card.action.trigger)。
 *
 * 服务端为唯一事实源:只信任 value.action 与 value.itemId。
 * 流程:解析 → action 合法校验 → fetchTodos 读服务端现状 → 按 itemId 找当前任务 →
 * getTransitionTarget(服务端 status, action) 来源校验 → WIP 检查 → mutation →
 * 用服务端 title 构造响应(Method A 就地更新)。
 *
 * 不信任客户端回传的 title:旧卡片可能仍携带 title 字段(向后兼容容忍),一律忽略;
 * 找不到 item(已 Done/Abandoned/删除/过期卡片)或来源状态非法 → 拒绝,不 mutation。
 */
export async function handleCardCallback(env: Env, body: any): Promise<Record<string, unknown>> {
  const value = body?.event?.action?.value ?? {};
  const action = value.action as string | undefined;
  const itemId = value.itemId as string | undefined;
  // 注:value.title 即使存在也完全忽略(旧卡片兼容),响应一律使用服务端 title。

  if (!action || !isActionName(action) || !itemId) {
    return ack("error", "无效的按钮操作");
  }

  try {
    // 所有 action(含 complete)都先读服务端任务列表:来源校验 + 服务端 title 的唯一出处
    const todos = await fetchTodos(env);
    const current = todos.find((t) => t.itemId === itemId);

    // 找不到:任务已 Done/Abandoned/被删除,或按钮来自过期卡片 → 统一拒绝
    if (!current) {
      return ack("error", "任务状态已变化,请发送 /today 刷新");
    }

    // 来源状态校验:当前状态不允许该 action → 拒绝,不纠正、不强转
    const target = getTransitionTarget(current.status, action);
    if (!target) {
      return ack("error", "该操作与当前状态不符,请发送 /today 刷新");
    }

    // WIP 检查:仅在来源校验通过之后。目标状态有上限(Doing 3 / Next 5 / Paused 5)且已达上限 → 拦截
    const limit = WIP_LIMITS[target];
    if (limit !== undefined && todos.filter((t) => t.status === target).length >= limit) {
      return {
        card: { type: "raw", data: buildWipFullCard(target, limit) },
        toast: { type: "warning", content: `${target} 已满(${limit}/${limit})` },
      };
    }

    await updateItemStatus(env, itemId, target);

    // 完成:庆祝卡 + Variable Reward 搞怪文案(title 取服务端)
    if (action === "complete") {
      return {
        card: { type: "raw", data: buildItemCard({ itemId, title: current.title, status: "Done" }, `🎉 ${rollReward()}`) },
        toast: { type: "success", content: "已完成" },
      };
    }

    // 其它:乐观更新列表(项移到新分组;终态 Done/Abandoned 移除)
    const updated = todos
      .map((t) => (t.itemId === itemId ? { ...t, status: target } : t))
      .filter((t) => t.status !== "Done" && t.status !== "Abandoned");
    return {
      card: { type: "raw", data: buildTodoCard(updated) },
      toast: { type: "success", content: `已${ACTION_VERB[action]}` },
    };
  } catch (e) {
    return ack("error", (e as Error).message);
  }
}

function ack(type: "success" | "error", content: string): Record<string, unknown> {
  return { toast: { type, content } };
}
