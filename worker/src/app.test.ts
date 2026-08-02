import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Webhook 路由层测试:锁定 app.ts 路由行为 + 幂等守卫接入点。
 * 三个 command handler 全部 mock;store 用真实 Memory 实例 + tryAcquire spy,
 * 不触 GitHub / 飞书 / FC / 网络 / 生产 secret。
 * 覆盖:GET /、challenge 回显、token fail-closed、card.action.trigger、/add、/today、
 * 非路由事件、非法 message.content 容错;challenge/token/today/普通文本零 store 调用;
 * /add 用 message:<message_id> claim、card 用 card:<event_id> claim。
 * (duplicate / store 失败 / 缺 key / 并发 等完整幂等矩阵见 app.idempotency.test.ts)
 */
vi.mock("./commands/add", () => ({ handleAdd: vi.fn() }));
vi.mock("./commands/today", () => ({ handleToday: vi.fn() }));
vi.mock("./commands/callback", () => ({ handleCardCallback: vi.fn() }));

import { handleAdd } from "./commands/add";
import { handleToday } from "./commands/today";
import { handleCardCallback } from "./commands/callback";
import type { Env } from "./types";
import { createApp } from "./app";
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

const store = new MemoryAtomicKeyStore();
const tryAcquireSpy = vi.spyOn(store, "tryAcquire");
const app = createApp(ENV, { atomicKeyStore: store });

let messageSeq = 0;
let cardSeq = 0;

function post(body: unknown) {
  return app.request("/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** 卡片回调事件体(card.action.trigger),event_id 自增保证各用例 key 独立 */
function cardBody(value: Record<string, unknown> = { action: "start", itemId: "PVTI_1" }) {
  cardSeq += 1;
  return {
    schema: "2.0",
    header: { event_id: `ev_test_${cardSeq}`, event_type: "card.action.trigger", token: TOKEN },
    event: { action: { value } },
  };
}

/** 文本消息事件体(im.message.receive_v1),message_id 自增;content 按飞书要求再套一层 JSON 字符串 */
function messageBody(text: string) {
  messageSeq += 1;
  return {
    schema: "2.0",
    header: { event_type: "im.message.receive_v1", token: TOKEN },
    event: {
      sender: { sender_id: { open_id: OPEN_ID } },
      message: {
        message_id: `om_test_${messageSeq}`,
        message_type: "text",
        content: JSON.stringify({ text }),
      },
    },
  };
}

function expectNoHandlers() {
  expect(handleAdd).not.toHaveBeenCalled();
  expect(handleToday).not.toHaveBeenCalled();
  expect(handleCardCallback).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /", () => {
  it("返回 200 与 Worker 运行中提示", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Worker 运行中");
    expect(text).toContain("野薯");
    expect(tryAcquireSpy).not.toHaveBeenCalled();
  });
});

describe("URL 验证(challenge)", () => {
  it("type=url_verification 且有 challenge → 原样回显,不触任何 handler,零 store 调用", async () => {
    const res = await post({ type: "url_verification", challenge: "abc-123", token: TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ challenge: "abc-123" });
    expectNoHandlers();
    expect(tryAcquireSpy).not.toHaveBeenCalled();
  });

  it("challenge 分支先于 token 校验(token 错误也回显,锁定现有顺序),零 store 调用", async () => {
    const res = await post({ type: "url_verification", challenge: "xyz", token: "wrong-token" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ challenge: "xyz" });
    expectNoHandlers();
    expect(tryAcquireSpy).not.toHaveBeenCalled();
  });
});

describe("Token 校验(fail-closed)", () => {
  it("错误 token → 401 invalid token,零 handler,零 store 调用(即便是回调路由也先被拒)", async () => {
    const body = cardBody();
    body.header.token = "wrong-token";
    const res = await post(body);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid token" });
    expectNoHandlers();
    expect(tryAcquireSpy).not.toHaveBeenCalled();
  });

  it("缺失 token → 401,零 handler,零 store 调用", async () => {
    const res = await post({ schema: "2.0", header: { event_type: "card.action.trigger" }, event: {} });
    expect(res.status).toBe(401);
    expectNoHandlers();
    expect(tryAcquireSpy).not.toHaveBeenCalled();
  });
});

describe("card.action.trigger 路由", () => {
  it("正确 token → 先以 card:<event_id> claim,再 handleCardCallback 一次;响应即其返回;不触 add/today", async () => {
    const marker = { toast: { type: "success", content: "CB_MARKER" } };
    vi.mocked(handleCardCallback).mockResolvedValue(marker);
    const body = cardBody({ action: "complete", itemId: "PVTI_9" });

    const res = await post(body);

    expect(tryAcquireSpy).toHaveBeenCalledTimes(1);
    expect(tryAcquireSpy).toHaveBeenCalledWith(
      expect.objectContaining({ key: `card:${body.header.event_id}`, kind: "idempotency" }),
    );
    expect(handleCardCallback).toHaveBeenCalledTimes(1);
    expect(handleCardCallback).toHaveBeenCalledWith(ENV, body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(marker);
    expect(handleAdd).not.toHaveBeenCalled();
    expect(handleToday).not.toHaveBeenCalled();
  });
});

describe("/add 路由", () => {
  it("text=/add … → 先以 message:<message_id> claim,再 handleAdd(ENV, openId, 原文),{ok:true};不触 today/callback", async () => {
    const body = messageBody("/add 买牛奶");
    const res = await post(body);

    expect(tryAcquireSpy).toHaveBeenCalledTimes(1);
    expect(tryAcquireSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `message:${body.event.message.message_id}`,
        kind: "idempotency",
      }),
    );
    expect(handleAdd).toHaveBeenCalledTimes(1);
    expect(handleAdd).toHaveBeenCalledWith(ENV, OPEN_ID, "/add 买牛奶");
    expect(await res.json()).toEqual({ ok: true });
    expect(handleToday).not.toHaveBeenCalled();
    expect(handleCardCallback).not.toHaveBeenCalled();
  });

  it("前导空白 + 大写 /ADD 同样路由(锁定 ^\\s* + /i 行为)", async () => {
    const body = messageBody("  /ADD 修门禁");
    await post(body);
    expect(handleAdd).toHaveBeenCalledTimes(1);
    expect(handleAdd).toHaveBeenCalledWith(ENV, OPEN_ID, "  /ADD 修门禁");
    expect(tryAcquireSpy).toHaveBeenCalledWith(
      expect.objectContaining({ key: `message:${body.event.message.message_id}` }),
    );
  });
});

describe("/today 路由", () => {
  it("text=/today → handleToday(ENV, openId),{ok:true};只读命令零 store 调用;不触 add/callback", async () => {
    const res = await post(messageBody("/today"));

    expect(handleToday).toHaveBeenCalledTimes(1);
    expect(handleToday).toHaveBeenCalledWith(ENV, OPEN_ID);
    expect(await res.json()).toEqual({ ok: true });
    expect(handleAdd).not.toHaveBeenCalled();
    expect(handleCardCallback).not.toHaveBeenCalled();
    expect(tryAcquireSpy).not.toHaveBeenCalled();
  });
});

describe("不路由的情况(一律 {ok:true},零 handler,零 store 调用)", () => {
  it("普通文本(非命令)→ {ok:true}", async () => {
    const res = await post(messageBody("你好呀"));
    expect(await res.json()).toEqual({ ok: true });
    expectNoHandlers();
    expect(tryAcquireSpy).not.toHaveBeenCalled();
  });

  it("未知 event_type → {ok:true}", async () => {
    const res = await post({ schema: "2.0", header: { event_type: "im.chat.updated", token: TOKEN }, event: {} });
    expect(await res.json()).toEqual({ ok: true });
    expectNoHandlers();
    expect(tryAcquireSpy).not.toHaveBeenCalled();
  });

  it("非 text 消息类型(image)→ {ok:true}", async () => {
    const res = await post({
      schema: "2.0",
      header: { event_type: "im.message.receive_v1", token: TOKEN },
      event: {
        sender: { sender_id: { open_id: OPEN_ID } },
        message: { message_id: "om_image_1", message_type: "image", content: "{}" },
      },
    });
    expect(await res.json()).toEqual({ ok: true });
    expectNoHandlers();
    expect(tryAcquireSpy).not.toHaveBeenCalled();
  });

  it("缺失 sender open_id → {ok:true}", async () => {
    const res = await post({
      schema: "2.0",
      header: { event_type: "im.message.receive_v1", token: TOKEN },
      event: {
        sender: {},
        message: { message_id: "om_nosender_1", message_type: "text", content: JSON.stringify({ text: "/today" }) },
      },
    });
    expect(await res.json()).toEqual({ ok: true });
    expectNoHandlers();
    expect(tryAcquireSpy).not.toHaveBeenCalled();
  });
});

describe("非法 message.content(容错,不崩溃,零 store 调用)", () => {
  it("content 不是合法 JSON → {ok:true},零 handler", async () => {
    const res = await post({
      schema: "2.0",
      header: { event_type: "im.message.receive_v1", token: TOKEN },
      event: {
        sender: { sender_id: { open_id: OPEN_ID } },
        message: { message_id: "om_badjson_1", message_type: "text", content: "{oops not json" },
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expectNoHandlers();
    expect(tryAcquireSpy).not.toHaveBeenCalled();
  });

  it("content 合法 JSON 但无 text 字段 → {ok:true},零 handler", async () => {
    const res = await post({
      schema: "2.0",
      header: { event_type: "im.message.receive_v1", token: TOKEN },
      event: {
        sender: { sender_id: { open_id: OPEN_ID } },
        message: { message_id: "om_notext_1", message_type: "text", content: JSON.stringify({ nope: true }) },
      },
    });
    expect(await res.json()).toEqual({ ok: true });
    expectNoHandlers();
    expect(tryAcquireSpy).not.toHaveBeenCalled();
  });
});
