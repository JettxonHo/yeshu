import type { Env } from "../types";
import { fetchTodos } from "../lib/github";
import { buildTodoCard } from "../lib/cards";
import { sendCard } from "../lib/lark";
import { externalErrorContext } from "../lib/http";

/** /today → 发今日待办卡片给发送者 */
export async function handleToday(
  env: Env,
  senderOpenId: string,
): Promise<void> {
  let todos;
  try {
    todos = await fetchTodos(env);
  } catch (error) {
    console.error("today failed", externalErrorContext(error));
    try {
      await sendCard(env, senderOpenId, {
        config: { wide_screen: true },
        header: {
          title: { tag: "plain_text", content: "❌ 失败" },
          template: "red",
        },
        elements: [
          {
            tag: "div",
            text: { tag: "lark_md", content: "暂时没能读取任务,请稍后重试" },
          },
        ],
      });
    } catch (feedbackError) {
      console.error(
        "today failure card could not be sent",
        externalErrorContext(feedbackError),
      );
    }
    return;
  }

  try {
    await sendCard(env, senderOpenId, buildTodoCard(todos));
  } catch (error) {
    // 数据读取已成功时不再发送第二张错误卡,避免把“反馈失败”误报成“读取失败”。
    console.error("today card could not be sent", externalErrorContext(error));
  }
}
