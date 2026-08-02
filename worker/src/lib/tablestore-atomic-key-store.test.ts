import { describe, expect, it, vi } from "vitest";
import { ComparatorType, Long, RowExistenceExpectation } from "tablestore";
import { TablestoreAtomicKeyStore } from "./tablestore-atomic-key-store";
import type { TablestoreClientLike } from "./tablestore-atomic-key-store";
import type { AcquireInput } from "./atomic-key-store";

/**
 * Tablestore 适配器测试:全程 mock client,零真实网络 / 零凭证 / 零云资源。
 * 同时验证请求参数的条件结构(EXPECT_NOT_EXIST / EXPECT_EXIST + 列条件)
 * 与基于结构化 error.code 的错误分流。
 */

const T0 = 2_000_000;

function input(over: Partial<AcquireInput> = {}): AcquireInput {
  return {
    key: "card:ev_1",
    owner: "owner-a",
    kind: "idempotency",
    nowMs: T0,
    expiresAtMs: T0 + 604_800_000,
    ...over,
  };
}

function mockClient(): { client: TablestoreClientLike; putRow: ReturnType<typeof vi.fn>; getRow: ReturnType<typeof vi.fn>; updateRow: ReturnType<typeof vi.fn>; deleteRow: ReturnType<typeof vi.fn> } {
  const putRow = vi.fn();
  const getRow = vi.fn();
  const updateRow = vi.fn();
  const deleteRow = vi.fn();
  return { client: { putRow, getRow, updateRow, deleteRow }, putRow, getRow, updateRow, deleteRow };
}

/** 结构化 Tablestore 错误:带 code 字段(与 SDK extractError 形状一致)。 */
function otsError(code: string, message = "mock"): Error {
  return Object.assign(new Error(message), { code });
}

function storeOf(client: TablestoreClientLike): TablestoreAtomicKeyStore {
  return new TablestoreAtomicKeyStore({ client, tableName: "idempotency_keys" });
}

describe("TablestoreAtomicKeyStore: tryAcquire 主路径", () => {
  it("EXPECT_NOT_EXIST 写入成功 → acquired;参数结构正确;不触发 get/update/delete", async () => {
    const m = mockClient();
    m.putRow.mockResolvedValue({});
    const res = await storeOf(m.client).tryAcquire(input());

    expect(res).toEqual({ acquired: true, owner: "owner-a" });
    expect(m.putRow).toHaveBeenCalledTimes(1);
    const params = m.putRow.mock.calls[0][0];
    expect(params.tableName).toBe("idempotency_keys");
    expect(params.condition.rowExistenceExpectation).toBe(RowExistenceExpectation.EXPECT_NOT_EXIST);
    expect(params.condition.columnCondition).toBeNull();
    expect(params.primaryKey).toEqual([{ key: "card:ev_1" }]);
    const byName = Object.assign({}, ...params.attributeColumns);
    expect(byName.owner).toBe("owner-a");
    expect(byName.kind).toBe("idempotency");
    expect(byName.expires_at_ms.toNumber()).toBe(T0 + 604_800_000);
    expect(byName.created_at_ms.toNumber()).toBe(T0);
    expect(m.getRow).not.toHaveBeenCalled();
    expect(m.updateRow).not.toHaveBeenCalled();
    expect(m.deleteRow).not.toHaveBeenCalled();
  });

  it("行已存在且未过期 → held;只读一次,不接管", async () => {
    const m = mockClient();
    m.putRow.mockRejectedValue(otsError("OTSConditionCheckFail"));
    m.getRow.mockResolvedValue({
      row: {
        attributes: [
          { columnName: "owner", columnValue: "someone-else" },
          { columnName: "expires_at_ms", columnValue: Long.fromNumber(T0 + 10_000) },
        ],
      },
    });

    const res = await storeOf(m.client).tryAcquire(input());

    expect(res).toEqual({ acquired: false, reason: "held" });
    expect(m.getRow).toHaveBeenCalledTimes(1);
    expect(m.updateRow).not.toHaveBeenCalled();
    expect(m.deleteRow).not.toHaveBeenCalled();
  });

  it("行已存在且已过期 → 条件接管成功;updateRow 带 EXPECT_EXIST + expires_at_ms<=nowMs", async () => {
    const m = mockClient();
    m.putRow.mockRejectedValue(otsError("OTSConditionCheckFail"));
    m.getRow.mockResolvedValue({
      row: { attributes: [{ columnName: "expires_at_ms", columnValue: Long.fromNumber(T0 - 1) }] },
    });
    m.updateRow.mockResolvedValue({});

    const res = await storeOf(m.client).tryAcquire(input({ owner: "owner-b" }));

    expect(res).toEqual({ acquired: true, owner: "owner-b" });
    const params = m.updateRow.mock.calls[0][0];
    expect(params.condition.rowExistenceExpectation).toBe(RowExistenceExpectation.EXPECT_EXIST);
    const cc = params.condition.columnCondition;
    expect(cc.columnName).toBe("expires_at_ms");
    expect(cc.comparator).toBe(ComparatorType.LESS_EQUAL);
    expect(cc.columnValue.toNumber()).toBe(T0);
    expect(params.primaryKey).toEqual([{ key: "card:ev_1" }]);
    const put = Object.assign({}, ...params.updateOfAttributeColumns[0].PUT);
    expect(put.owner).toBe("owner-b");
    expect(put.expires_at_ms.toNumber()).toBe(T0 + 604_800_000);
  });

  it("接管竞争失败(updateRow 条件失败)→ held,不抛错", async () => {
    const m = mockClient();
    m.putRow.mockRejectedValue(otsError("OTSConditionCheckFail"));
    m.getRow.mockResolvedValue({
      row: { attributes: [{ columnName: "expires_at_ms", columnValue: Long.fromNumber(T0 - 1) }] },
    });
    m.updateRow.mockRejectedValue(otsError("OTSConditionCheckFail"));

    const res = await storeOf(m.client).tryAcquire(input());
    expect(res).toEqual({ acquired: false, reason: "held" });
  });

  it("边界 expires_at_ms == nowMs 视为已过期 → 走接管路径", async () => {
    const m = mockClient();
    m.putRow.mockRejectedValue(otsError("OTSConditionCheckFail"));
    m.getRow.mockResolvedValue({
      row: { attributes: [{ columnName: "expires_at_ms", columnValue: Long.fromNumber(T0) }] },
    });
    m.updateRow.mockResolvedValue({});

    const res = await storeOf(m.client).tryAcquire(input());
    expect(res.acquired).toBe(true);
    expect(m.updateRow).toHaveBeenCalledTimes(1);
  });
});

describe("TablestoreAtomicKeyStore: 缺失属性与行消失(安全处理)", () => {
  it("行存在但无属性列 → 走条件接管路径(不崩溃)", async () => {
    const m = mockClient();
    m.putRow.mockRejectedValue(otsError("OTSConditionCheckFail"));
    m.getRow.mockResolvedValue({ row: { attributes: [] } });
    m.updateRow.mockResolvedValue({});

    const res = await storeOf(m.client).tryAcquire(input());
    expect(res.acquired).toBe(true);
    expect(m.updateRow).toHaveBeenCalledTimes(1);
  });

  it("expires_at_ms 为损坏字符串 → 走条件接管路径(不崩溃)", async () => {
    const m = mockClient();
    m.putRow.mockRejectedValue(otsError("OTSConditionCheckFail"));
    m.getRow.mockResolvedValue({
      row: { attributes: [{ columnName: "expires_at_ms", columnValue: "not-a-number" }] },
    });
    m.updateRow.mockResolvedValue({});

    const res = await storeOf(m.client).tryAcquire(input());
    expect(res.acquired).toBe(true);
  });

  it("行被并发删除(getRow 空行)→ 接管 updateRow;EXPECT_EXIST 失败时 held", async () => {
    const m = mockClient();
    m.putRow.mockRejectedValue(otsError("OTSConditionCheckFail"));
    m.getRow.mockResolvedValue({ row: { attributes: [] } });
    m.updateRow.mockRejectedValue(otsError("OTSConditionCheckFail"));

    const res = await storeOf(m.client).tryAcquire(input());
    expect(res).toEqual({ acquired: false, reason: "held" });
  });

  it("expires_at_ms 以普通 number 读回同样可解析(未过期 held)", async () => {
    const m = mockClient();
    m.putRow.mockRejectedValue(otsError("OTSConditionCheckFail"));
    m.getRow.mockResolvedValue({
      row: { attributes: [{ columnName: "expires_at_ms", columnValue: T0 + 5_000 }] },
    });

    const res = await storeOf(m.client).tryAcquire(input());
    expect(res).toEqual({ acquired: false, reason: "held" });
  });
});

describe("TablestoreAtomicKeyStore: 错误分流(结构化 code,不误判 duplicate)", () => {
  it("putRow 网络错误(无 code)→ 向上抛出", async () => {
    const m = mockClient();
    m.putRow.mockRejectedValue(new Error("socket hang up"));
    await expect(storeOf(m.client).tryAcquire(input())).rejects.toThrow(/socket hang up/);
    expect(m.getRow).not.toHaveBeenCalled();
  });

  it("putRow 未知服务端错误(OTSInternalServerError)→ 抛出,不判为 held", async () => {
    const m = mockClient();
    m.putRow.mockRejectedValue(otsError("OTSInternalServerError"));
    await expect(storeOf(m.client).tryAcquire(input())).rejects.toThrow();
    expect(m.updateRow).not.toHaveBeenCalled();
  });

  it("表不存在(OTSObjectNotExist)→ 抛出(配置/资源问题,fail-closed)", async () => {
    const m = mockClient();
    m.putRow.mockRejectedValue(otsError("OTSObjectNotExist"));
    await expect(storeOf(m.client).tryAcquire(input())).rejects.toThrow();
  });

  it("getRow 网络错误 → 抛出,不误判为 held", async () => {
    const m = mockClient();
    m.putRow.mockRejectedValue(otsError("OTSConditionCheckFail"));
    m.getRow.mockRejectedValue(otsError("OTSRequestTimeout"));
    await expect(storeOf(m.client).tryAcquire(input())).rejects.toThrow();
    expect(m.updateRow).not.toHaveBeenCalled();
  });

  it("接管 updateRow 非条件错误 → 抛出", async () => {
    const m = mockClient();
    m.putRow.mockRejectedValue(otsError("OTSConditionCheckFail"));
    m.getRow.mockResolvedValue({ row: { attributes: [] } });
    m.updateRow.mockRejectedValue(otsError("OTSQuotaExhausted"));
    await expect(storeOf(m.client).tryAcquire(input())).rejects.toThrow();
  });

  it("仅凭 error.message 含 'condition' 不触发 held(必须结构化 code)", async () => {
    const m = mockClient();
    m.putRow.mockRejectedValue(new Error("weird condition in message but no code"));
    await expect(storeOf(m.client).tryAcquire(input())).rejects.toThrow(/condition/);
    expect(m.getRow).not.toHaveBeenCalled();
  });
});

describe("TablestoreAtomicKeyStore: release owner 保护", () => {
  it("正确 owner → deleteRow(EXPECT_EXIST + owner==owner),返回 true", async () => {
    const m = mockClient();
    m.deleteRow.mockResolvedValue({});

    const ok = await storeOf(m.client).release("card:ev_1", "owner-a");

    expect(ok).toBe(true);
    const params = m.deleteRow.mock.calls[0][0];
    expect(params.condition.rowExistenceExpectation).toBe(RowExistenceExpectation.EXPECT_EXIST);
    const cc = params.condition.columnCondition;
    expect(cc.columnName).toBe("owner");
    expect(cc.columnValue).toBe("owner-a");
    expect(cc.comparator).toBe(ComparatorType.EQUAL);
    expect(params.primaryKey).toEqual([{ key: "card:ev_1" }]);
  });

  it("owner 不匹配(条件失败)→ false,不抛错", async () => {
    const m = mockClient();
    m.deleteRow.mockRejectedValue(otsError("OTSConditionCheckFail"));
    expect(await storeOf(m.client).release("card:ev_1", "owner-evil")).toBe(false);
  });

  it("deleteRow 网络错误 → 抛出(不吞)", async () => {
    const m = mockClient();
    m.deleteRow.mockRejectedValue(new Error("ECONNRESET"));
    await expect(storeOf(m.client).release("card:ev_1", "owner-a")).rejects.toThrow(/ECONNRESET/);
  });

  it("空 key / 空 owner → 抛错,不触 client", async () => {
    const m = mockClient();
    await expect(storeOf(m.client).release("", "owner-a")).rejects.toThrow(/key/);
    await expect(storeOf(m.client).release("card:ev_1", "")).rejects.toThrow(/owner/);
    expect(m.deleteRow).not.toHaveBeenCalled();
  });
});

describe("TablestoreAtomicKeyStore: 构造校验", () => {
  it("缺 client / 空 tableName → 抛错", () => {
    expect(() => new TablestoreAtomicKeyStore({ client: undefined as never, tableName: "t" })).toThrow(/client/);
    expect(() => new TablestoreAtomicKeyStore({ client: mockClient().client, tableName: "" })).toThrow(/tableName/);
  });
});
