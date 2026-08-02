/**
 * 通用原子 key 存储抽象(与业务无关)。
 *
 * 语义:对 string key 做「最多一次」的原子 claim。两个使用场景:
 * - idempotency:飞书事件去重。claim 成功后不 release(即使后续 Handler 出错也保留),
 *   防止 mutation 成功但进程崩溃 / 飞书重推 / 多实例并发导致重复执行;
 * - lock(未来 WIP 并发保护用):claim 后业务完成时按 owner 条件 release。
 *
 * 时间由调用方注入 nowMs(确定性测试;生产用 Date.now());owner 由调用方生成
 * (建议 crypto.randomUUID())。接口本身不读时钟、不生成随机数、不含业务 Handler。
 */

/** key 用途:幂等 claim 不释放;锁 claim 由 owner 条件释放。 */
export type KeyKind = "idempotency" | "lock";

/** tryAcquire 结果:acquired=本次 claim 成功;held=key 被未过期的 claim 占用。 */
export type AcquireResult =
  | { acquired: true; owner: string }
  | { acquired: false; reason: "held" };

export interface AcquireInput {
  /** 非空。如 `message:om_xxx` / `card:ev_xxx` / `wip:Doing`。 */
  key: string;
  /** 本次 claim 的持有者标识(调用方生成,release 时做条件匹配)。 */
  owner: string;
  kind: KeyKind;
  /** 调用方注入的当前时间(epoch ms)。 */
  nowMs: number;
  /** 逻辑过期时间(epoch ms),必须大于 nowMs。表级 TTL 只做长期清理,实时判断以此为准。 */
  expiresAtMs: number;
}

export interface AtomicKeyStore {
  /**
   * 原子 claim。key 不存在或已过期 → acquired;被未过期 claim 占用 → held。
   * 实现必须保证并发下同一 key 至多一个调用方拿到 acquired。
   * 存储后端不可用(网络/鉴权/表缺失等)→ 抛错,由调用方 fail-closed。
   */
  tryAcquire(input: AcquireInput): Promise<AcquireResult>;

  /**
   * 条件释放:仅当当前 claim 的 owner 与传入一致时删除,返回 true;
   * owner 不一致或 key 不存在 → false(绝不删除他人 claim)。
   * idempotency 场景不调用本方法。
   */
  release(key: string, owner: string): Promise<boolean>;
}

/** 入参校验(各实现共用):key/owner 非空,expiresAtMs > nowMs。 */
export function assertAcquireInput(input: AcquireInput): void {
  if (!input.key) {
    throw new Error("AtomicKeyStore: key 不允许为空");
  }
  if (!input.owner) {
    throw new Error("AtomicKeyStore: owner 不允许为空");
  }
  if (!(input.expiresAtMs > input.nowMs)) {
    throw new Error("AtomicKeyStore: expiresAtMs 必须大于 nowMs");
  }
}
