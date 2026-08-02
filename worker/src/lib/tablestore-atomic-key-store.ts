import { ComparatorType, Condition, Long, RowExistenceExpectation, SingleColumnCondition } from "tablestore";
import type { AcquireInput, AcquireResult, AtomicKeyStore } from "./atomic-key-store";
import { assertAcquireInput } from "./atomic-key-store";

/**
 * 阿里云 Tablestore(表格存储)版 AtomicKeyStore —— 生产跨实例持久化幂等后端。
 *
 * 表结构(人工创建,Worker 不建表、不改 Schema):
 *   Primary Key:key STRING
 *   Attribute Columns:owner STRING / kind STRING / expires_at_ms INTEGER / created_at_ms INTEGER
 *   表级 TTL 只负责长期清理;短租约实时判断以 expires_at_ms 为准。
 *
 * tryAcquire(原子,无「先读后写」竞态):
 *   1) PutRow + EXPECT_NOT_EXIST → 行不存在则直接 claim 成功;
 *   2) 条件失败(行已存在)→ GetRow 读取行状态(三种,见 StoredClaimState):
 *      - valid 未过期(expires_at_ms > nowMs)→ held;
 *      - valid 已过期 → UpdateRow(EXPECT_EXIST + expires_at_ms <= nowMs,
 *        passIfMissing=false)原子接管;接管条件失败 → held;
 *      - corrupt(缺 expires_at_ms / 值非法)→ 抛 AtomicKeyStoreCorruptRowError,
 *        不接管、不猜测,由调用方 fail-closed(人工介入修数);
 *      - missing-row(PutRow 冲突后被并发删除)→ 最多一次 EXPECT_NOT_EXIST 重试;
 *        重试条件失败 → held(让出本次 delivery,绝不无条件 PutRow)。
 *
 * release:DeleteRow(EXPECT_EXIST + owner == 传入 owner,passIfMissing=false),
 * owner 缺失 / 不一致 / 行不存在一律 false,绝不删除他人或损坏的 claim。
 *
 * 错误识别基于 SDK 结构化 error.code(见 lib/client.js extractError),
 * 不用 error.message.includes():条件失败 → held/false 语义;
 * 其余(网络 / 鉴权 / 表缺失 / 未知)一律向上抛,由调用方 fail-closed。
 */

/** getRow 返回行中的属性列(SDK 形状:{ columnName, columnValue })。 */
export interface TablestoreRowColumn {
  columnName: string;
  columnValue: unknown;
}

export interface TablestoreGetRowResponse {
  row?: {
    primaryKey?: unknown;
    attributes?: TablestoreRowColumn[];
  } | null;
}

type PrimaryKey = Array<Record<string, string>>;
type AttributeColumn = Record<string, string | Long>;

/** 适配器依赖的 client 结构子集(官方 Client 满足;测试注入 mock)。 */
export interface TablestoreClientLike {
  putRow(params: {
    tableName: string;
    condition: Condition;
    primaryKey: PrimaryKey;
    attributeColumns: AttributeColumn[];
  }): Promise<unknown>;

  getRow(params: {
    tableName: string;
    primaryKey: PrimaryKey;
    maxVersions: number;
  }): Promise<TablestoreGetRowResponse>;

  updateRow(params: {
    tableName: string;
    condition: Condition;
    primaryKey: PrimaryKey;
    updateOfAttributeColumns: Array<{ PUT: AttributeColumn[] }>;
  }): Promise<unknown>;

  deleteRow(params: {
    tableName: string;
    condition: Condition;
    primaryKey: PrimaryKey;
  }): Promise<unknown>;
}

export interface TablestoreAtomicKeyStoreConfig {
  /** 构造函数注入;适配器不读 process.env。 */
  client: TablestoreClientLike;
  tableName: string;
}

/** Tablestore 结构化错误码:行存在性 / 列条件检查失败。 */
const CONDITION_CHECK_FAIL_CODE = "OTSConditionCheckFail";

function errorCodeOf(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function isConditionCheckFail(err: unknown): boolean {
  return errorCodeOf(err) === CONDITION_CHECK_FAIL_CODE;
}

/** INTEGER 列值兼容 Long 与 number 两种读回形状;无法解析 → null。 */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object" && value !== null) {
    const toNumber = (value as { toNumber?: unknown }).toNumber;
    if (typeof toNumber === "function") {
      const n = (toNumber as () => unknown).call(value);
      if (typeof n === "number" && Number.isFinite(n)) return n;
    }
  }
  return null;
}

/**
 * 行损坏错误:claim 行存在但 expires_at_ms 缺失或非法。
 *
 * fail-closed 语义:不接管损坏行(接管可能吞掉尚有效的他人 claim),抛错让
 * 调用方走 503 / 安全 toast 路径并触发人工修数。错误信息严格脱敏——
 * 只含损坏类型,不含 key / message_id / event_id / owner / endpoint / SDK 原始响应。
 */
export class AtomicKeyStoreCorruptRowError extends Error {
  readonly reason: "missing-expires-at" | "invalid-expires-at";

  constructor(reason: "missing-expires-at" | "invalid-expires-at") {
    super(`AtomicKeyStore: 幂等 claim 行损坏 (${reason})`);
    this.name = "AtomicKeyStoreCorruptRowError";
    this.reason = reason;
  }
}

/** GetRow 之后的三种行状态。 */
type StoredClaimState =
  /** 行不存在(PutRow 冲突后被并发删除等)。 */
  | { state: "missing-row" }
  /** 行存在且 expires_at_ms 可读有效。 */
  | { state: "valid"; expiresAtMs: number }
  /** 行存在但 expires_at_ms 缺失或非法:不接管,抛错。 */
  | { state: "corrupt"; reason: "missing-expires-at" | "invalid-expires-at" };

function claimColumns(input: AcquireInput): AttributeColumn[] {
  return [
    { owner: input.owner },
    { kind: input.kind },
    { expires_at_ms: Long.fromNumber(input.expiresAtMs) },
    { created_at_ms: Long.fromNumber(input.nowMs) },
  ];
}

export class TablestoreAtomicKeyStore implements AtomicKeyStore {
  private readonly client: TablestoreClientLike;
  private readonly tableName: string;

  constructor(config: TablestoreAtomicKeyStoreConfig) {
    if (!config.client) {
      throw new Error("TablestoreAtomicKeyStore: client 必填(构造函数注入)");
    }
    if (!config.tableName) {
      throw new Error("TablestoreAtomicKeyStore: tableName 不允许为空");
    }
    this.client = config.client;
    this.tableName = config.tableName;
  }

  async tryAcquire(input: AcquireInput): Promise<AcquireResult> {
    assertAcquireInput(input);

    // 第一步:EXPECT_NOT_EXIST 原子写入。行不存在 → claim 成功。
    try {
      await this.putClaim(input);
      return { acquired: true, owner: input.owner };
    } catch (err) {
      // 非条件失败(网络/鉴权/表缺失/未知)→ 向上抛,由调用方 fail-closed
      if (!isConditionCheckFail(err)) throw err;
    }

    // 第二步:行已存在。读行状态;网络等错误向上抛(不误判为 duplicate)。
    const claim = await this.readClaimState(input.key);

    if (claim.state === "valid") {
      if (claim.expiresAtMs > input.nowMs) {
        return { acquired: false, reason: "held" };
      }
      return this.takeOverExpiredClaim(input);
    }

    if (claim.state === "missing-row") {
      // 罕见竞态:PutRow 条件失败后行又被并发删除。最多一次 EXPECT_NOT_EXIST
      // 重试;重试仍条件失败说明他人先写入 → held(让出本次 delivery,安全侧)。
      // 不做无限重试,也绝不无条件 PutRow。
      try {
        await this.putClaim(input);
        return { acquired: true, owner: input.owner };
      } catch (err) {
        if (isConditionCheckFail(err)) {
          return { acquired: false, reason: "held" };
        }
        throw err;
      }
    }

    // claim.state === "corrupt":fail-closed,不接管、不猜测。
    throw new AtomicKeyStoreCorruptRowError(claim.reason);
  }

  async release(key: string, owner: string): Promise<boolean> {
    if (!key) {
      throw new Error("AtomicKeyStore: key 不允许为空");
    }
    if (!owner) {
      throw new Error("AtomicKeyStore: owner 不允许为空");
    }
    // owner 列缺失同样不满足条件(passIfMissing=false):不删除损坏或他人的 claim。
    const ownerCondition = new SingleColumnCondition("owner", owner, ComparatorType.EQUAL);
    ownerCondition.passIfMissing = false;
    try {
      await this.client.deleteRow({
        tableName: this.tableName,
        condition: new Condition(RowExistenceExpectation.EXPECT_EXIST, ownerCondition),
        primaryKey: [{ key }],
      });
      return true;
    } catch (err) {
      if (isConditionCheckFail(err)) {
        return false; // owner 不匹配 / owner 缺失 / 行不存在 → 不删除
      }
      throw err;
    }
  }

  /** EXPECT_NOT_EXIST 写入一次完整 claim。 */
  private putClaim(input: AcquireInput): Promise<unknown> {
    return this.client.putRow({
      tableName: this.tableName,
      condition: new Condition(RowExistenceExpectation.EXPECT_NOT_EXIST, null),
      primaryKey: [{ key: input.key }],
      attributeColumns: claimColumns(input),
    });
  }

  /** 过期 claim 的条件接管:EXPECT_EXIST + expires_at_ms <= nowMs(passIfMissing=false)。 */
  private async takeOverExpiredClaim(input: AcquireInput): Promise<AcquireResult> {
    const columnCondition = new SingleColumnCondition(
      "expires_at_ms",
      Long.fromNumber(input.nowMs),
      ComparatorType.LESS_EQUAL,
    );
    // 属性缺失不得视为过期:接管条件必须命中真实的过期时间戳。
    columnCondition.passIfMissing = false;
    try {
      await this.client.updateRow({
        tableName: this.tableName,
        condition: new Condition(RowExistenceExpectation.EXPECT_EXIST, columnCondition),
        primaryKey: [{ key: input.key }],
        updateOfAttributeColumns: [{ PUT: claimColumns(input) }],
      });
      return { acquired: true, owner: input.owner };
    } catch (err) {
      // 其他实例先接管 / 行在两步之间消失 → 让出;其余错误向上抛。
      if (isConditionCheckFail(err)) {
        return { acquired: false, reason: "held" };
      }
      throw err;
    }
  }

  /**
   * 读当前行状态。网络 / 鉴权等错误向上抛;
   * 空行(无属性列)→ missing-row;缺 expires_at_ms / 值非法 → corrupt。
   */
  private async readClaimState(key: string): Promise<StoredClaimState> {
    const resp = await this.client.getRow({
      tableName: this.tableName,
      primaryKey: [{ key }],
      maxVersions: 1,
    });
    const attributes = resp?.row?.attributes;
    if (!Array.isArray(attributes) || attributes.length === 0) {
      return { state: "missing-row" };
    }
    const expiryColumn = attributes.find((a) => a.columnName === "expires_at_ms");
    if (!expiryColumn) {
      return { state: "corrupt", reason: "missing-expires-at" };
    }
    const expiresAtMs = toFiniteNumber(expiryColumn.columnValue);
    if (expiresAtMs === null) {
      return { state: "corrupt", reason: "invalid-expires-at" };
    }
    return { state: "valid", expiresAtMs };
  }
}
