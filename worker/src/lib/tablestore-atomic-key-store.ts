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
 *   2) 条件失败(行已存在)→ GetRow 读 expires_at_ms;未过期(> nowMs)→ held;
 *   3) 已过期 / 属性损坏 / 行被并发删除 → UpdateRow(EXPECT_EXIST +
 *      SingleColumnCondition(expires_at_ms <= nowMs))原子接管;
 *   4) 接管条件失败 = 其他实例先接管(或行不存在)→ held。
 *
 * release:DeleteRow(EXPECT_EXIST + owner == 传入 owner),绝不删除他人 claim。
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
      await this.client.putRow({
        tableName: this.tableName,
        condition: new Condition(RowExistenceExpectation.EXPECT_NOT_EXIST, null),
        primaryKey: [{ key: input.key }],
        attributeColumns: claimColumns(input),
      });
      return { acquired: true, owner: input.owner };
    } catch (err) {
      // 非条件失败(网络/鉴权/表缺失/未知)→ 向上抛,由调用方 fail-closed
      if (!isConditionCheckFail(err)) throw err;
    }

    // 第二步:行已存在。读当前过期时间;网络等错误向上抛(不误判为 duplicate)。
    const expiryMs = await this.readExpiryMs(input.key);
    if (expiryMs !== null && expiryMs > input.nowMs) {
      return { acquired: false, reason: "held" };
    }

    // 第三步:已过期 / 行被并发删除 / 属性损坏 → 条件接管(原子校验)。
    // SingleColumnCondition(expires_at_ms <= nowMs);passIfMissing=true 使
    // 缺失属性(损坏行)也可接管;EXPECT_EXIST 使「行已消失」时条件失败 → held。
    const columnCondition = new SingleColumnCondition(
      "expires_at_ms",
      Long.fromNumber(input.nowMs),
      ComparatorType.LESS_EQUAL,
    );
    columnCondition.passIfMissing = true;
    try {
      await this.client.updateRow({
        tableName: this.tableName,
        condition: new Condition(RowExistenceExpectation.EXPECT_EXIST, columnCondition),
        primaryKey: [{ key: input.key }],
        updateOfAttributeColumns: [{ PUT: claimColumns(input) }],
      });
      return { acquired: true, owner: input.owner };
    } catch (err) {
      // 其他实例先接管,或行已不存在 → 让出;其余错误向上抛。
      if (isConditionCheckFail(err)) {
        return { acquired: false, reason: "held" };
      }
      throw err;
    }
  }

  async release(key: string, owner: string): Promise<boolean> {
    if (!key) {
      throw new Error("AtomicKeyStore: key 不允许为空");
    }
    if (!owner) {
      throw new Error("AtomicKeyStore: owner 不允许为空");
    }
    try {
      await this.client.deleteRow({
        tableName: this.tableName,
        condition: new Condition(
          RowExistenceExpectation.EXPECT_EXIST,
          new SingleColumnCondition("owner", owner, ComparatorType.EQUAL),
        ),
        primaryKey: [{ key }],
      });
      return true;
    } catch (err) {
      if (isConditionCheckFail(err)) {
        return false; // owner 不匹配(他人 claim)或行不存在 → 不删除
      }
      throw err;
    }
  }

  /** 读当前 claim 的 expires_at_ms;行不存在 / 无属性 / 值损坏 → null(走接管路径)。 */
  private async readExpiryMs(key: string): Promise<number | null> {
    const resp = await this.client.getRow({
      tableName: this.tableName,
      primaryKey: [{ key }],
      maxVersions: 1,
    });
    const attributes = resp?.row?.attributes;
    if (!Array.isArray(attributes) || attributes.length === 0) {
      return null;
    }
    for (const attr of attributes) {
      if (attr.columnName === "expires_at_ms") {
        return toFiniteNumber(attr.columnValue);
      }
    }
    return null;
  }
}
