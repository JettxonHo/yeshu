import { describe, expect, it, vi } from "vitest";
import {
  IDEMPOTENCY_TTL_SECONDS,
  claimIdempotencyKey,
  extractCardIdempotencyKey,
  extractMessageIdempotencyKey,
} from "./idempotency";
import { MemoryAtomicKeyStore } from "./memory-atomic-key-store";

/**
 * 幂等协调器单测:key 选取(message_id / event_id)、TTL、claim 分流。
 * 不触 GitHub / 飞书 / 网络。
 */

describe("key 提取", () => {
  it("消息 key 使用 event.message.message_id(message: 前缀)", () => {
    expect(
      extractMessageIdempotencyKey({ event: { message: { message_id: "om_1" } } }),
    ).toBe("message:om_1");
  });

  it("消息 key 不回退 header.event_id:缺 message_id → null(即便 event_id 存在)", () => {
    expect(
      extractMessageIdempotencyKey({ header: { event_id: "ev_1" }, event: { message: {} } }),
    ).toBeNull();
  });

  it("卡片 key 使用 header.event_id(card: 前缀)", () => {
    expect(extractCardIdempotencyKey({ header: { event_id: "ev_9" } })).toBe("card:ev_9");
  });

  it("缺失 / 空串 / 非字符串 → null", () => {
    expect(extractMessageIdempotencyKey({})).toBeNull();
    expect(extractMessageIdempotencyKey({ event: { message: { message_id: "" } } })).toBeNull();
    expect(extractMessageIdempotencyKey({ event: { message: { message_id: 42 } } })).toBeNull();
    expect(extractCardIdempotencyKey({})).toBeNull();
    expect(extractCardIdempotencyKey({ header: {} })).toBeNull();
    expect(extractCardIdempotencyKey(null)).toBeNull();
    expect(extractCardIdempotencyKey(undefined)).toBeNull();
  });
});

describe("claimIdempotencyKey", () => {
  it("首次 acquired;同 key 再 claim → duplicate", async () => {
    const store = new MemoryAtomicKeyStore();
    const input = { store, key: "message:om_x", owner: "o1", nowMs: 1_000 };
    expect(await claimIdempotencyKey(input)).toBe("acquired");
    expect(await claimIdempotencyKey({ ...input, owner: "o2" })).toBe("duplicate");
  });

  it("TTL 内 duplicate;TTL 过期后允许新 claim(默认 7 天)", async () => {
    const store = new MemoryAtomicKeyStore();
    expect(IDEMPOTENCY_TTL_SECONDS).toBe(604_800);
    await claimIdempotencyKey({ store, key: "card:ev_x", owner: "o1", nowMs: 1_000 });
    // TTL 内(expiresAtMs 前一毫秒)→ duplicate
    const within = await claimIdempotencyKey({
      store,
      key: "card:ev_x",
      owner: "o2",
      nowMs: 1_000 + IDEMPOTENCY_TTL_SECONDS * 1000 - 1,
    });
    expect(within).toBe("duplicate");
    // 恰好 expiresAtMs == nowMs → 视为过期,新 delivery(用户重发 / 重点击)可 acquired
    const after = await claimIdempotencyKey({
      store,
      key: "card:ev_x",
      owner: "o3",
      nowMs: 1_000 + IDEMPOTENCY_TTL_SECONDS * 1000,
    });
    expect(after).toBe("acquired");
  });

  it("自定义 ttlSeconds 生效", async () => {
    const store = new MemoryAtomicKeyStore();
    await claimIdempotencyKey({ store, key: "message:om_y", owner: "o1", nowMs: 1_000, ttlSeconds: 60 });
    expect(
      await claimIdempotencyKey({ store, key: "message:om_y", owner: "o2", nowMs: 61_001, ttlSeconds: 60 }),
    ).toBe("acquired");
  });

  it("store 抛错 → 向上传播(调用方 fail-closed,不吞为 duplicate)", async () => {
    const store = new MemoryAtomicKeyStore();
    const boom = Object.assign(new Error("OTSAuthFailed"), { code: "OTSAuthFailed" });
    store.tryAcquire = async () => {
      throw boom;
    };
    await expect(
      claimIdempotencyKey({ store, key: "message:om_z", owner: "o1", nowMs: 1 }),
    ).rejects.toBe(boom);
  });

  it("非法 TTL 一律拒绝(即使直接注入也不得生成非法 claim)", async () => {
    const store = new MemoryAtomicKeyStore();
    const spy = vi.spyOn(store, "tryAcquire");
    const bad: unknown[] = [0, -1, -604_800, 1.5, NaN, Infinity, -Infinity, "3600", null];
    for (const ttl of bad) {
      await expect(
        claimIdempotencyKey({
          store,
          key: "message:om_bad_ttl",
          owner: "o1",
          nowMs: 1_000,
          ttlSeconds: ttl as number,
        }),
      ).rejects.toThrow(/ttlSeconds/);
    }
    expect(spy).not.toHaveBeenCalled(); // 非法 TTL 不得触达 store
  });

  it("TTL 导致 expiresAtMs 溢出安全整数 → 拒绝", async () => {
    const store = new MemoryAtomicKeyStore();
    const spy = vi.spyOn(store, "tryAcquire");
    await expect(
      claimIdempotencyKey({
        store,
        key: "message:om_overflow",
        owner: "o1",
        nowMs: Number.MAX_SAFE_INTEGER - 100,
        ttlSeconds: 1,
      }),
    ).rejects.toThrow(/expiresAtMs/);
    expect(spy).not.toHaveBeenCalled();
  });
});
