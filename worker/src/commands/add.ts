import type { Env } from "../types";
import { addDraftIssue } from "../lib/github";
import { shortenTitle } from "../lib/ai";
import { buildAddedCard } from "../lib/cards";
import { sendCard } from "../lib/lark";
import { externalErrorContext } from "../lib/http";

/** /add <内容> → 创建 Backlog 待办卡,发反馈卡片给发送者 */
export async function handleAdd(
  env: Env,
  senderOpenId: string,
  text: string,
): Promise<void> {
  const content = text.replace(/^\s*\/add\s*/i, "").trim();
  if (!content) {
    await sendCard(env, senderOpenId, {
      config: { wide_screen: true },
      header: {
        title: { tag: "plain_text", content: "用法" },
        template: "orange",
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: "`/add <内容>` —— 如 `/add 买牛奶`",
          },
        },
      ],
    });
    return;
  }
  const title = shortenTitle(content);
  try {
    await addDraftIssue(env, title);
  } catch (error) {
    console.error(
      "add failed before confirmation",
      externalErrorContext(error),
    );
    await sendFailureCard(env, senderOpenId);
    return;
  }

  try {
    await sendCard(env, senderOpenId, buildAddedCard(title));
  } catch (error) {
    // GitHub 已成功时不再发送第二张错误卡,避免把“反馈失败”误报成“建卡失败”。
    console.error(
      "add succeeded but confirmation card failed",
      externalErrorContext(error),
    );
  }
}

async function sendFailureCard(env: Env, senderOpenId: string): Promise<void> {
  try {
    await sendCard(env, senderOpenId, errorCard());
  } catch (error) {
    // 反馈发送失败不再抛到 webhook,避免飞书重推同一已 claim 的事件。
    console.error(
      "add failure card could not be sent",
      externalErrorContext(error),
    );
  }
}

function errorCard(): Record<string, unknown> {
  return {
    config: { wide_screen: true },
    header: {
      title: { tag: "plain_text", content: "❌ 失败" },
      template: "red",
    },
    elements: [
      {
        tag: "div",
        text: { tag: "lark_md", content: "暂时没能创建任务,请稍后重试" },
      },
    ],
  };
}
