import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 幂等守卫完整矩阵(app.ts 集成层)。handler 全 mock;store 用真实 Memory 实例
 * (并发语义可信)或结构化错误 fake(模拟 Tablestore 不可用)。
 * 核心契约:at-most-once —— claim 成功才执行 Handler;duplicate / 缺 key /
 * store 失败 一律不 mutation,且响应稳定脱敏。
 */
vi.mock("./commands/add", () => ({ handleAdd: vi.fn() }));
vi.mock("./commands/today", () => ({ handleToday: vi.fn() }));
vi.mock("./commands/callback", () => ({ handleCardCallback: vi.fn() }));

import { handleAdd } from "./commands/add";
import { handleToday } from "./commands/today";
import { handleCardCallback } from "./commands/callback";
import type { Env, LarkWebhookBody } from "./types";
import { createApp } from "./app";
import type { AppDependencies } from "./app";
import type { AtomicKeyStore } from "./lib/atomic-key-store";
import { MemoryAtomicKeyStore } from "./lib/memory-atomic-key-store";

const ENV: Env = {
  GITHUB_TOKEN: "gh-token",
  GITHUB_LOGIN: "login",
  GITHUB_PROJECT_NUMBER: "1",
  LARK_APP_ID: "app-id",
  LARK_APP_SECRET: "app-secret",
  LARK_OPEN_ID: "open-id",
  LARK_VERIFICATION_TOKEN: "v-token",
};

const TOKEN = ENV.LARK_VERIFICATION_TOKEN;
const OPEN_ID = "ou_sender";

function messageBody(text: string, messageId?: string): LarkWebhookBody {
  return {
    schema: "2.0",
    header: { event_id: "ev_msg_envelope", event_type: "im.message.receive_v1", token: TOKEN },
    event: {
      sender: { sender_id: { open_id: OPEN_ID } },
      message: {
        message_id: messageId ?? "om_default",
        message_type: "text",
        content: JSON.stringify({ text }),
      },
    },
  };
}

function cardBody(value: Record<string, unknown>, eventId?: string): LarkWebhookBody {
  return {
    schema: "2.0",
    header: { event_id: eventId ?? "ev_default", event_type: "card.action.trigger", token: TOKEN },
    event: { action: { value } },
  };
}

function makeApp(deps: Partial<AppDependencies> = {}) {
  const store = deps.atomicKeyStore ?? new MemoryAtomicKeyStore();
  const app = createApp(ENV, { atomicKeyStore: store, ...deps });
  function post(body: unknown) {
    return app.request("/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  return { app, store, post };
}

/** 模拟 Tablestore 不可用:tryAcquire 抛结构化错误(release 永不被幂等路径调用)。 */
function failingStore(): AtomicKeyStore {
  return {
    tryAcquire: vi.fn(async () => {
      throw Object.assign(new Error("OTSAuthFailed: secret detail"), { code: "OTSAuthFailed" });
    }),
    release: vi.fn(async () => false),
  };
}

/** 模拟损坏行:适配器抛 AtomicKeyStoreCorruptRowError(脱敏)。 */
function corruptRowStore(): AtomicKeyStore {
  return {
    tryAcquire: vi.fn(async () => {
      throw new Error("AtomicKeyStore: 幂等 claim 行损坏 (missing-expires-at)", {
        cause: "corrupt",
      });
    }),
    release: vi.fn(async () => false),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("duplicate /add(message_id 重推)", () => {
  it("同一 message_id 第二次投递 → {ok:true,duplicate:true},Handler 恰好一次", async () => {
    const { post } = makeApp();
    const body = messageBody("/add 买牛奶", "om_dup_1");

    const first = await post(body);
    const second = await post(body);

    expect(await first.json()).toEqual({ ok: true });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, duplicate: true });
    expect(handleAdd).toHaveBeenCalledTimes(1);
  });

  it("duplicate 响应不再次发送成功卡 / 错误卡(Handler 零调用)", async () => {
    const { post } = makeApp();
    await post(messageBody("/add 任务A", "om_dup_2"));
    vi.clearAllMocks();
    const res = await post(messageBody("/add 任务A", "om_dup_2"));
    expect(await res.json()).toEqual({ ok: true, duplicate: true });
    expect(handleAdd).not.toHaveBeenCalled();
  });
});

describe("/add key 选取", () => {
  it("使用 message:<message_id>,不使用 header.event_id 替代", async () => {
    const store = new MemoryAtomicKeyStore();
    const spy = vi.spyOn(store, "tryAcquire");
    const { post } = makeApp({ atomicKeyStore: store });

    await post(messageBody("/add x", "om_key_1"));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ key: "message:om_key_1" }),
    );
    // 即便事件体 envelope 上有 event_id,也不能作为消息去重键
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ key: "card:ev_msg_envelope" }));
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ key: "message:ev_msg_envelope" }));
  });

  it("相同标题、不同 message_id → 两个任务都允许创建(Handler 两次)", async () => {
    const { post } = makeApp();
    await post(messageBody("/add 同一标题", "om_a"));
    await post(messageBody("/add 同一标题", "om_b"));
    expect(handleAdd).toHaveBeenCalledTimes(2);
  });
});

describe("/add 缺失 message_id", () => {
  it("无 message_id → 400 message_id_missing,零 Handler、零 GitHub", async () => {
    const { post } = makeApp();
    const body = messageBody("/add 缺 id", undefined);
    if (body.event?.message) delete body.event.message.message_id;

    const res = await post(body);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "message_id_missing" });
    expect(handleAdd).not.toHaveBeenCalled();
  });

  it("即便存在 header.event_id,缺 message_id 仍 400(不回退 event_id)", async () => {
    const { post } = makeApp();
    const body = messageBody("/add 缺 id", undefined);
    if (body.event?.message) delete body.event.message.message_id;

    const res = await post(body);
    expect(res.status).toBe(400);
    expect(handleAdd).not.toHaveBeenCalled();
  });
});

describe("/add store 不可用(fail-closed)", () => {
  it("→ 503 + 稳定脱敏错误码;零 Handler;不泄露 SDK 原始 message", async () => {
    const { post } = makeApp({ atomicKeyStore: failingStore() });
    const res = await post(messageBody("/add x", "om_fail_1"));

    expect(res.status).toBe(503);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({ error: "idempotency_store_unavailable" });
    expect(JSON.stringify(json)).not.toContain("OTSAuthFailed");
    expect(JSON.stringify(json)).not.toContain("secret detail");
    expect(handleAdd).not.toHaveBeenCalled();
  });
});

describe("duplicate card callback(event_id 重推)", () => {
  it("同一 event_id 第二次 → 200 warning toast,Handler 恰好一次", async () => {
    const { post } = makeApp();
    vi.mocked(handleCardCallback).mockResolvedValue({ toast: { type: "success", content: "已开始" } });
    const body = cardBody({ action: "start", itemId: "PVTI_1" }, "ev_dup_1");

    const first = await post(body);
    const second = await post(body);

    expect(((await first.json()) as { toast: { content: string } }).toast.content).toBe("已开始");
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      toast: { type: "warning", content: "该操作已处理,请发送 /today 刷新" },
    });
    expect(handleCardCallback).toHaveBeenCalledTimes(1);
  });

  it("相同 item/action、不同 event_id → 都进入 Handler(用户重点击是新操作)", async () => {
    const { post } = makeApp();
    vi.mocked(handleCardCallback).mockResolvedValue({ toast: { type: "success", content: "ok" } });
    await post(cardBody({ action: "start", itemId: "PVTI_1" }, "ev_x1"));
    await post(cardBody({ action: "start", itemId: "PVTI_1" }, "ev_x2"));
    expect(handleCardCallback).toHaveBeenCalledTimes(2);
  });
});

describe("card callback 缺失 event_id", () => {
  it("→ 200 error toast「缺少事件标识」,零 Handler、不 mutation", async () => {
    const { post } = makeApp();
    const body = cardBody({ action: "start", itemId: "PVTI_1" }, undefined);
    if (body.header) delete body.header.event_id;

    const res = await post(body);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      toast: { type: "error", content: "缺少事件标识,请发送 /today 刷新" },
    });
    expect(handleCardCallback).not.toHaveBeenCalled();
  });
});

describe("card callback store 不可用(fail-closed)", () => {
  it("→ 200 安全 toast;零 Handler;不返回 Tablestore 原始错误", async () => {
    const { post } = makeApp({ atomicKeyStore: failingStore() });
    const res = await post(cardBody({ action: "start", itemId: "PVTI_1" }, "ev_fail_1"));

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({ toast: { type: "error", content: "系统暂时无法确认操作,请稍后重试" } });
    expect(JSON.stringify(json)).not.toContain("OTSAuthFailed");
    expect(handleCardCallback).not.toHaveBeenCalled();
  });
});

describe("只读与前置路由:零 store 访问", () => {
  it("/today 不接入幂等:相同 message_id 两次都执行,store 零调用", async () => {
    const store = new MemoryAtomicKeyStore();
    const spy = vi.spyOn(store, "tryAcquire");
    const { post } = makeApp({ atomicKeyStore: store });

    await post(messageBody("/today", "om_today_1"));
    await post(messageBody("/today", "om_today_1"));

    expect(handleToday).toHaveBeenCalledTimes(2);
    expect(spy).not.toHaveBeenCalled();
  });

  it("challenge / 错误 token / 普通文本 → store 零调用", async () => {
    const store = new MemoryAtomicKeyStore();
    const spy = vi.spyOn(store, "tryAcquire");
    const { post } = makeApp({ atomicKeyStore: store });

    await post({ type: "url_verification", challenge: "c", token: TOKEN });
    await post({ schema: "2.0", header: { event_type: "card.action.trigger", token: "bad" }, event: {} });
    await post(messageBody("随便聊聊", "om_chat_1"));

    expect(spy).not.toHaveBeenCalled();
  });
});

describe("corrupt row fail-closed(损坏行不进入 Handler,响应脱敏)", () => {
  it("/add:store 抛损坏行错误 → 503,零 Handler,响应不含 key / 损坏细节", async () => {
    const { post } = makeApp({ atomicKeyStore: corruptRowStore() });
    const res = await post(messageBody("/add x", "om_corrupt_1"));

    expect(res.status).toBe(503);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({ error: "idempotency_store_unavailable" });
    const raw = JSON.stringify(json);
    expect(raw).not.toContain("om_corrupt_1");
    expect(raw).not.toContain("missing-expires-at");
    expect(raw).not.toContain("claim 行损坏");
    expect(handleAdd).not.toHaveBeenCalled();
  });

  it("card callback:store 抛损坏行错误 → 200 安全 toast,零 Handler", async () => {
    const { post } = makeApp({ atomicKeyStore: corruptRowStore() });
    const res = await post(cardBody({ action: "start", itemId: "PVTI_C" }, "ev_corrupt_1"));

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({ toast: { type: "error", content: "系统暂时无法确认操作,请稍后重试" } });
    expect(JSON.stringify(json)).not.toContain("ev_corrupt_1");
    expect(handleCardCallback).not.toHaveBeenCalled();
  });
});

describe("acquire 成功 → Handler 恰好一次;并发同一 key 仅一次", () => {
  it("正常单次投递:claim 一次,Handler 一次", async () => {
    const store = new MemoryAtomicKeyStore();
    const spy = vi.spyOn(store, "tryAcquire");
    const { post } = makeApp({ atomicKeyStore: store });

    await post(messageBody("/add 单次", "om_once"));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(handleAdd).toHaveBeenCalledTimes(1);
  });

  it("同一 message_id 并发两次投递 → Handler 恰好一次,一个响应为 duplicate", async () => {
    const { post } = makeApp();
    const body = messageBody("/add 并发", "om_race");

    const [r1, r2] = await Promise.all([post(body), post(body)]);
    const [j1, j2] = [await r1.json(), await r2.json()];

    const outcomes = [j1, j2].sort((a, b) => JSON.stringify(a).length - JSON.stringify(b).length);
    expect(outcomes[0]).toEqual({ ok: true });
    expect(outcomes[1]).toEqual({ ok: true, duplicate: true });
    expect(handleAdd).toHaveBeenCalledTimes(1);
  });

  it("同一 event_id 并发两次卡片回调 → Handler 恰好一次", async () => {
    const { post } = makeApp();
    vi.mocked(handleCardCallback).mockResolvedValue({ toast: { type: "success", content: "ok" } });
    const body = cardBody({ action: "start", itemId: "PVTI_R" }, "ev_race");

    await Promise.all([post(body), post(body)]);

    expect(handleCardCallback).toHaveBeenCalledTimes(1);
  });
});
