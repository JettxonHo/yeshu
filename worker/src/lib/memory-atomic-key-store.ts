import type { AcquireInput, AcquireResult, AtomicKeyStore, KeyKind } from "./atomic-key-store";
import { assertAcquireInput } from "./atomic-key-store";

interface MemoryEntry {
  owner: string;
  kind: KeyKind;
  expiresAtMs: number;
  createdAtMs: number;
}

/**
 * 内存版 AtomicKeyStore。
 *
 * 仅用于:本地开发、单元测试、明确标记的非生产环境。
 * 不是生产级跨实例幂等——FC 多实例各持有独立 Map,无法互相看见 claim。
 * 生产使用 TablestoreAtomicKeyStore。
 *
 * 无定时器、无后台 interval;过期判断完全依赖调用方注入的 nowMs。
 * JS 单线程 + 无 await 间隙 ⇒ 读写天然原子(并发 tryAcquire 至多一个成功)。
 */
export class MemoryAtomicKeyStore implements AtomicKeyStore {
  private readonly entries = new Map<string, MemoryEntry>();

  async tryAcquire(input: AcquireInput): Promise<AcquireResult> {
    assertAcquireInput(input);
    const existing = this.entries.get(input.key);
    // 未过期(expiresAtMs > nowMs)→ held;过期(expiresAtMs <= nowMs)→ 允许原子接管
    if (existing && existing.expiresAtMs > input.nowMs) {
      return { acquired: false, reason: "held" };
    }
    this.entries.set(input.key, {
      owner: input.owner,
      kind: input.kind,
      expiresAtMs: input.expiresAtMs,
      createdAtMs: input.nowMs,
    });
    return { acquired: true, owner: input.owner };
  }

  async release(key: string, owner: string): Promise<boolean> {
    if (!key) {
      throw new Error("AtomicKeyStore: key 不允许为空");
    }
    if (!owner) {
      throw new Error("AtomicKeyStore: owner 不允许为空");
    }
    const existing = this.entries.get(key);
    if (!existing || existing.owner !== owner) {
      return false;
    }
    this.entries.delete(key);
    return true;
  }

  /** 测试辅助:当前条目数(用于断言不泄漏无限增长状态)。 */
  get size(): number {
    return this.entries.size;
  }
}
