import { Hono } from "hono";
import type { Env } from "./types";
import { isChallenge, verifyToken } from "./lib/verify";
import { handleAdd } from "./commands/add";
import { handleToday } from "./commands/today";

/**
 * 创建 Hono app(platform-agnostic)。
 * env 由入口(index.ts)注入(方案 A)——lib/commands 不改,仍传 env 参数。
 */
export function createApp(env: Env): Hono {
  const app = new Hono();

  app.get("/", (c) => c.text("野薯(Yeshu)Worker 运行中 🥔"));

  app.post("/webhook", async (c) => {
    const body = await c.req.json();

    // 1. URL 验证(challenge)
    if (isChallenge(body)) {
      return c.json({ challenge: body.challenge });
    }

    // 2. Verification Token 校验
    if (!verifyToken(body, env)) {
      return c.json({ error: "invalid token" }, 401);
    }

    // 3. 命令路由:im.message.receive_v1
    const eventType = body?.header?.event_type;
    const msg = body?.event?.message;
    const senderOpenId = body?.event?.sender?.sender_id?.open_id;
    if (eventType === "im.message.receive_v1" && msg?.message_type === "text" && senderOpenId) {
      let text = "";
      try {
        text = JSON.parse(msg.content).text ?? "";
      } catch {
        text = "";
      }
      if (/^\s*\/add\b/i.test(text)) {
        await handleAdd(env, senderOpenId, text);
      } else if (/^\s*\/today\b/i.test(text)) {
        await handleToday(env, senderOpenId);
      }
    }

    return c.json({ ok: true });
  });

  return app;
}
