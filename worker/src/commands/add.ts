import type { Env } from "../types";
import { addDraftIssue } from "../lib/github";
import { shortenTitle } from "../lib/ai";
import { buildAddedCard } from "../lib/cards";
import { sendCard } from "../lib/lark";

/** /add <内容> → 创建待办卡(简化:Status=Todo),发反馈卡片给发送者 */
export async function handleAdd(env: Env, senderOpenId: string, text: string): Promise<void> {
  const content = text.replace(/^\s*\/add\s*/i, "").trim();
  if (!content) {
    await sendCard(env, senderOpenId, {
      config: { wide_screen: true },
      header: { title: { tag: "plain_text", content: "用法" }, template: "orange" },
      elements: [
        { tag: "div", text: { tag: "lark_md", content: "`/add <内容>` —— 如 `/add 买牛奶`" } },
      ],
    });
    return;
  }
  const title = shortenTitle(content);
  try {
    await addDraftIssue(env, title);
    await sendCard(env, senderOpenId, buildAddedCard(title));
  } catch (e) {
    await sendCard(env, senderOpenId, errorCard((e as Error).message));
  }
}

function errorCard(msg: string): Record<string, unknown> {
  return {
    config: { wide_screen: true },
    header: { title: { tag: "plain_text", content: "❌ 失败" }, template: "red" },
    elements: [{ tag: "div", text: { tag: "lark_md", content: msg } }],
  };
}
