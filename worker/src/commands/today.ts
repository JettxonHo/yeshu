import type { Env } from "../types";
import { fetchTodos } from "../lib/github";
import { buildTodoCard } from "../lib/cards";
import { sendCard } from "../lib/lark";

/** /today → 发今日待办卡片给发送者 */
export async function handleToday(env: Env, senderOpenId: string): Promise<void> {
  try {
    const todos = await fetchTodos(env);
    await sendCard(env, senderOpenId, buildTodoCard(todos));
  } catch (e) {
    await sendCard(env, senderOpenId, {
      config: { wide_screen: true },
      header: { title: { tag: "plain_text", content: "❌ 失败" }, template: "red" },
      elements: [{ tag: "div", text: { tag: "lark_md", content: (e as Error).message } }],
    });
  }
}
