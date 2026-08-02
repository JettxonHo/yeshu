import { describe, expect, it } from "vitest";
import { MemoryAtomicKeyStore } from "./memory-atomic-key-store";
import type { AcquireInput } from "./atomic-key-store";

/**
 * AtomicKeyStore 行为契约测试(以 Memory 参考实现锁定)。
 * 确定性时间:nowMs 全部显式注入,不依赖真实时钟与定时器。
 */

const T0 = 1_000_000;

function input(over: Partial<AcquireInput> = {}): AcquireInput {
  return {
    key: "message:om_1",
    owner: "owner-a",
    kind: "idempotency",
    nowMs: T0,
    expiresAtMs: T0 + 60_000,
    ...over,
  };
}

describe("MemoryAtomicKeyStore: acquire 基本语义", () => {
  it("首次 acquire 新 key → acquired,回传调用方 owner", async () => {
    const store = new MemoryAtomicKeyStore();
    const res = await store.tryAcquire(input());
    expect(res).toEqual({ acquired: true, owner: "owner-a" });
    expect(store.size).toBe(1);
  });

  it("未过期 key 重复 acquire(同 owner 也一样)→ held", async () => {
    const store = new MemoryAtomicKeyStore();
    await store.tryAcquire(input());
    const again = await store.tryAcquire(input());
    expect(again).toEqual({ acquired: false, reason: "held" });
  });

  it("不同 key 互不影响", async () => {
    const store = new MemoryAtomicKeyStore();
    await store.tryAcquire(input({ key: "message:om_1" }));
    const res = await store.tryAcquire(input({ key: "card:ev_1", owner: "owner-b" }));
    expect(res.acquired).toBe(true);
    expect(store.size).toBe(2);
  });

  it("边界 expiresAtMs == nowMs 视为已过期 → 可接管", async () => {
    const store = new MemoryAtomicKeyStore();
    await store.tryAcquire(input({ owner: "owner-a", expiresAtMs: T0 + 1_000 }));
    const res = await store.tryAcquire(input({ owner: "owner-b", nowMs: T0 + 1_000, expiresAtMs: T0 + 61_000 }));
    expect(res).toEqual({ acquired: true, owner: "owner-b" });
  });
});

describe("MemoryAtomicKeyStore: 过期接管", () => {
  it("已过期 key → 新 owner 原子接管成功", async () => {
    const store = new MemoryAtomicKeyStore();
    await store.tryAcquire(input({ owner: "owner-a", expiresAtMs: T0 + 1_000 }));
    const res = await store.tryAcquire(input({ owner: "owner-b", nowMs: T0 + 2_000, expiresAtMs: T0 + 62_000 }));
    expect(res).toEqual({ acquired: true, owner: "owner-b" });
    // 接管后旧 owner 无法 release 新 claim
    expect(await store.release("message:om_1", "owner-a")).toBe(false);
    expect(store.size).toBe(1);
  });

  it("接管后原 owner release → false,不得删除新 owner 的 claim", async () => {
    const store = new MemoryAtomicKeyStore();
    await store.tryAcquire(input({ owner: "owner-a", expiresAtMs: T0 + 1_000 }));
    await store.tryAcquire(input({ owner: "owner-b", nowMs: T0 + 2_000, expiresAtMs: T0 + 62_000 }));
    expect(await store.release("message:om_1", "owner-a")).toBe(false);
    // 新 owner 仍持有:第三方 acquire 仍 held
    const third = await store.tryAcquire(input({ owner: "owner-c", nowMs: T0 + 3_000, expiresAtMs: T0 + 63_000 }));
    expect(third).toEqual({ acquired: false, reason: "held" });
  });
});

describe("MemoryAtomicKeyStore: release owner 保护", () => {
  it("正确 owner release → true,release 后可重新 acquire", async () => {
    const store = new MemoryAtomicKeyStore();
    await store.tryAcquire(input({ owner: "owner-a" }));
    expect(await store.release("message:om_1", "owner-a")).toBe(true);
    expect(store.size).toBe(0);
    const res = await store.tryAcquire(input({ owner: "owner-b", nowMs: T0 + 1 }));
    expect(res).toEqual({ acquired: true, owner: "owner-b" });
  });

  it("错误 owner release → false,claim 不受影响", async () => {
    const store = new MemoryAtomicKeyStore();
    await store.tryAcquire(input({ owner: "owner-a" }));
    expect(await store.release("message:om_1", "owner-evil")).toBe(false);
    expect(store.size).toBe(1);
    const res = await store.tryAcquire(input({ owner: "owner-evil", nowMs: T0 + 1 }));
    expect(res).toEqual({ acquired: false, reason: "held" });
  });

  it("release 不存在的 key → false", async () => {
    const store = new MemoryAtomicKeyStore();
    expect(await store.release("message:om_none", "owner-a")).toBe(false);
  });
});

describe("MemoryAtomicKeyStore: 并发与入参校验", () => {
  it("同一 key 并发 acquire → 恰好一个成功", async () => {
    const store = new MemoryAtomicKeyStore();
    const results = await Promise.all([
      store.tryAcquire(input({ owner: "owner-a" })),
      store.tryAcquire(input({ owner: "owner-b" })),
      store.tryAcquire(input({ owner: "owner-c" })),
    ]);
    const acquired = results.filter((r) => r.acquired);
    expect(acquired).toHaveLength(1);
    expect(store.size).toBe(1);
  });

  it("空 key → 抛错", async () => {
    const store = new MemoryAtomicKeyStore();
    await expect(store.tryAcquire(input({ key: "" }))).rejects.toThrow(/key/);
  });

  it("空 owner → 抛错", async () => {
    const store = new MemoryAtomicKeyStore();
    await expect(store.tryAcquire(input({ owner: "" }))).rejects.toThrow(/owner/);
  });

  it("expiresAtMs <= nowMs → 抛错", async () => {
    const store = new MemoryAtomicKeyStore();
    await expect(store.tryAcquire(input({ expiresAtMs: T0 }))).rejects.toThrow(/expiresAtMs/);
    await expect(store.tryAcquire(input({ expiresAtMs: T0 - 1 }))).rejects.toThrow(/expiresAtMs/);
  });

  it("release 空 key → 抛错", async () => {
    const store = new MemoryAtomicKeyStore();
    await expect(store.release("", "owner-a")).rejects.toThrow(/key/);
  });

  it("release 空 owner → 抛错(与 Tablestore 适配器契约统一)", async () => {
    const store = new MemoryAtomicKeyStore();
    await store.tryAcquire(input({ owner: "owner-a" }));
    await expect(store.release("message:om_1", "")).rejects.toThrow(/owner/);
    // 抛错不得影响 claim
    expect(store.size).toBe(1);
  });

  it("每个测试新建实例,状态不跨用例泄漏(本用例起始 size=0)", () => {
    expect(new MemoryAtomicKeyStore().size).toBe(0);
  });
});
