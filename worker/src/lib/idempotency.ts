import type { AtomicKeyStore } from "./atomic-key-store";

/**
 * 幂等协调器:从飞书事件体提取去重 key,在一切外部 mutation(GitHub GraphQL /
 * 飞书发卡片)之前完成原子 claim。本模块不做业务逻辑、不记录 Secret 或完整 body。
 *
 * key 选取理由:
 * - 消息命令(/add)用 event.message.message_id:同一条消息重推应合并;
 *   不使用 header.event_id 作为消息命令主去重键(语义不同,且卡片回调才以 event_id 为准);
 * - 卡片回调(card.action.trigger)用 header.event_id:同一次回调重推应合并;
 *   用户再次点击会生成新的 event_id,视为新操作,必须允许进入 Handler;
 * - 不把 sender open_id / title / itemId / action / Token 单独作为幂等 key
 *   (相同标题的两个 /add 必须允许创建两个任务;同任务不同次点击必须可操作)。
 *
 * 语义是 at-most-once mutation protection,不是 exactly-once 分布式事务:
 * GitHub、飞书与 Tablestore 不在同一事务中。claim 成功后即使后续 Handler 出错
 * 也不释放 key——宁可让用户重发(新 message_id / 新 event_id),也不冒重复 mutation。
 */

/** 幂等 claim 默认 TTL(秒):7 天。表级 TTL 只做长期清理,实时判断以此为据。 */
export const IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60;

/** 消息命令去重 key:`message:<message_id>`;缺失/非法 → null。 */
export function extractMessageIdempotencyKey(body: unknown): string | null {
  const messageId = (body as { event?: { message?: { message_id?: unknown } } })?.event?.message
    ?.message_id;
  if (typeof messageId !== "string" || messageId.length === 0) return null;
  return `message:${messageId}`;
}

/** 卡片回调去重 key:`card:<event_id>`;缺失/非法 → null。 */
export function extractCardIdempotencyKey(body: unknown): string | null {
  const eventId = (body as { header?: { event_id?: unknown } })?.header?.event_id;
  if (typeof eventId !== "string" || eventId.length === 0) return null;
  return `card:${eventId}`;
}

export type IdempotencyClaimStatus = "acquired" | "duplicate";

export interface ClaimIdempotencyKeyInput {
  store: AtomicKeyStore;
  /** 已由调用方用 extract* 生成(带 message: / card: 前缀)。 */
  key: string;
  /** 调用方生成(建议 crypto.randomUUID());idempotency 场景不会用它 release。 */
  owner: string;
  nowMs: number;
  ttlSeconds?: number;
}

/**
 * Claim 幂等 key。acquired = 本次 delivery 应继续执行业务 Handler;
 * duplicate = 已处理过,跳过全部 Handler 与 mutation。
 * 存储后端异常 → 抛错,由调用方 fail-closed(绝不降级为「继续 mutation」)。
 *
 * TTL 在本地校验(不只依赖 env parser):正整数秒、expiresAtMs 为安全整数且
 * 大于 nowMs——即使 AppDependencies 直接注入非法值,也不得生成非法 claim。
 */
export async function claimIdempotencyKey(
  input: ClaimIdempotencyKeyInput,
): Promise<IdempotencyClaimStatus> {
  // 仅 undefined 回退默认值;显式传入的 null / 非法值一律校验拒绝(不用 ??,
  // 那会把 null 静默替换为默认 TTL,生成「看似合法」的 claim)。
  const ttlSeconds = input.ttlSeconds === undefined ? IDEMPOTENCY_TTL_SECONDS : input.ttlSeconds;
  if (
    typeof ttlSeconds !== "number" ||
    !Number.isFinite(ttlSeconds) ||
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds <= 0
  ) {
    throw new Error("claimIdempotencyKey: ttlSeconds 必须为正整数(单位:秒)");
  }
  const expiresAtMs = input.nowMs + ttlSeconds * 1000;
  if (!Number.isSafeInteger(expiresAtMs) || !(expiresAtMs > input.nowMs)) {
    throw new Error("claimIdempotencyKey: expiresAtMs 超出安全整数范围或不大于 nowMs");
  }
  const result = await input.store.tryAcquire({
    key: input.key,
    owner: input.owner,
    kind: "idempotency",
    nowMs: input.nowMs,
    expiresAtMs,
  });
  return result.acquired ? "acquired" : "duplicate";
}
