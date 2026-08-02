import { Hono } from "hono";
import type { Env } from "./types";
import { isChallenge, verifyToken } from "./lib/verify";
import { handleAdd } from "./commands/add";
import { handleToday } from "./commands/today";
import { handleCardCallback } from "./commands/callback";
import type { AtomicKeyStore } from "./lib/atomic-key-store";
import {
  claimIdempotencyKey,
  extractCardIdempotencyKey,
  extractMessageIdempotencyKey,
} from "./lib/idempotency";

/**
 * createApp 显式依赖注入:
 * - atomicKeyStore:幂等后端(生产 Tablestore;本地/测试 Memory);
 * - now / randomUUID:可注入时钟与 owner 生成器(确定性测试);
 * - idempotencyTtlSeconds:claim TTL,缺省 7 天。
 */
export interface AppDependencies {
  atomicKeyStore: AtomicKeyStore;
  now?: () => number;
  randomUUID?: () => string;
  idempotencyTtlSeconds?: number;
}

/**
 * 创建 Hono app(platform-agnostic)。
 * env 与依赖由入口(index.ts / fc.ts)注入——lib/commands 不改,仍传 env 参数。
 *
 * 幂等守卫顺序:challenge / Token 校验 / 只读路由(普通文本、/today)在存储之前
 * 完成处理,不访问 store;只有会 mutation 外部状态的 /add 与 card callback
 * 先 claim 再执行 Handler(at-most-once,fail-closed)。
 */
export function createApp(env: Env, dependencies: AppDependencies): Hono {
  const app = new Hono();
  const now = dependencies.now ?? Date.now;
  const randomUUID = dependencies.randomUUID ?? ((): string => crypto.randomUUID());
  const ttlSeconds = dependencies.idempotencyTtlSeconds;

  app.get("/", (c) => c.text("野薯(Yeshu)Worker 运行中 🥔"));

  app.post("/webhook", async (c) => {
    const body = await c.req.json();

    // 1. URL 验证(challenge)——不访问 store
    if (isChallenge(body)) {
      return c.json({ challenge: body.challenge });
    }

    // 2. Verification Token 校验——不访问 store
    if (!verifyToken(body, env)) {
      return c.json({ error: "invalid token" }, 401);
    }

    const eventType = body?.header?.event_type;

    // 3. 卡片按钮回调:先幂等 claim,再 handleCardCallback
    if (eventType === "card.action.trigger") {
      const cardKey = extractCardIdempotencyKey(body);
      if (cardKey === null) {
        // 缺 event_id:不执行 mutation;HTTP 200 + 安全 toast(飞书卡片需 200 才展示)
        console.error("card callback rejected: header.event_id missing");
        return c.json({ toast: { type: "error", content: "缺少事件标识,请发送 /today 刷新" } });
      }
      let status: "acquired" | "duplicate";
      try {
        status = await claimIdempotencyKey({
          store: dependencies.atomicKeyStore,
          key: cardKey,
          owner: randomUUID(),
          nowMs: now(),
          ttlSeconds,
        });
      } catch (err) {
        // 存储不可用:fail-closed,不执行 Handler,不泄露 SDK 原始错误
        console.error("card callback fail-closed: idempotency store unavailable", {
          errorName: (err as Error)?.name ?? "unknown",
        });
        return c.json({ toast: { type: "error", content: "系统暂时无法确认操作,请稍后重试" } });
      }
      if (status === "duplicate") {
        return c.json({ toast: { type: "warning", content: "该操作已处理,请发送 /today 刷新" } });
      }
      return c.json(await handleCardCallback(env, body));
    }

    // 4. 命令路由:im.message.receive_v1
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
        const messageKey = extractMessageIdempotencyKey(body);
        if (messageKey === null) {
          // 缺 message_id:不调 GitHub、不发卡片,稳定脱敏错误码
          console.error("add rejected: event.message.message_id missing");
          return c.json({ error: "message_id_missing" }, 400);
        }
        let status: "acquired" | "duplicate";
        try {
          status = await claimIdempotencyKey({
            store: dependencies.atomicKeyStore,
            key: messageKey,
            owner: randomUUID(),
            nowMs: now(),
            ttlSeconds,
          });
        } catch (err) {
          // 存储不可用:503 + 稳定错误码;绝不降级为继续 mutation
          console.error("add fail-closed: idempotency store unavailable", {
            errorName: (err as Error)?.name ?? "unknown",
          });
          return c.json({ error: "idempotency_store_unavailable" }, 503);
        }
        if (status === "duplicate") {
          // 重复投递:不再次执行 Handler、不再次发成功/错误卡
          return c.json({ ok: true, duplicate: true });
        }
        await handleAdd(env, senderOpenId, text);
        return c.json({ ok: true });
      } else if (/^\s*\/today\b/i.test(text)) {
        // 只读命令:不接入幂等保护,不访问 store
        await handleToday(env, senderOpenId);
      }
    }

    return c.json({ ok: true });
  });

  return app;
}
