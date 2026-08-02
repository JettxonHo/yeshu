import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import * as TableStore from "tablestore";

/**
 * 真实 SDK Runtime Contract Test。
 *
 * 使用实际安装的 `tablestore` 包(不 mock 模块),但全程零网络:
 * 只构造对象与调用纯内存的协议编解码,不创建 Client 请求、不连任何服务。
 * 所有凭证 / endpoint 均为 FAKE_* 与 IANA 保留 example 域。
 *
 * 用途:
 * 1. 锁定适配器依赖的 SDK 公开接口(导出存在性 + 构造 + 运行时属性);
 * 2. 作为 protobufjs 跨 major override(6.x → 7.x)的兼容性证据:
 *    SDK 的协议编码层(encoder/decoder,基于 protobufjs)在覆盖版本下
 *    必须仍能对 PutRow/GetRow/UpdateRow/DeleteRow 参数做往返序列化。
 *
 * encoder/decoder 是 SDK 顶层公开导出,但属内部协议层:本文件只用作
 * 兼容性证据,生产代码不得依赖(见 types/tablestore.d.ts 注释)。
 */

const require = createRequire(import.meta.url);

describe("SDK 导出与版本状态", () => {
  it("适配器依赖的全部导出存在", () => {
    expect(TableStore.Client).toBeTypeOf("function");
    expect(TableStore.Condition).toBeTypeOf("function");
    expect(TableStore.SingleColumnCondition).toBeTypeOf("function");
    // protobufjs 7 的 Long 以对象形态导出(非构造函数),断言功能性而非类型
    expect(TableStore.Long).toBeTruthy();
    expect(TableStore.Long.fromNumber(5).toNumber()).toBe(5);
    expect(TableStore.RowExistenceExpectation).toBeTruthy();
    expect(TableStore.ComparatorType).toBeTruthy();
  });

  it("实际安装的 protobufjs 为已修复的 7.x(override 生效证据)", () => {
    const pkg = require("protobufjs/package.json") as { version: string };
    expect(pkg.version).toMatch(/^7\./);
    // 7.6.3+ 修复全部当前 advisory(GHSA-xq3m-2v4x-88gg 等 11 项)
    const [major, minor, patch] = pkg.version.split(".").map(Number);
    expect(major > 7 || (major === 7 && (minor > 6 || (minor === 6 && patch >= 3)))).toBe(true);
  });

  it("实际安装的 tablestore 为 5.6.x 官方包", () => {
    const pkg = require("tablestore/package.json") as { name: string; version: string };
    expect(pkg.name).toBe("tablestore");
    expect(pkg.version).toMatch(/^5\.6\./);
  });
});

describe("条件对象构造与运行时属性", () => {
  it("EXPECT_NOT_EXIST Condition 构造成功,rowExistenceExpectation 与 columnCondition 正确", () => {
    const condition = new TableStore.Condition(TableStore.RowExistenceExpectation.EXPECT_NOT_EXIST, null);
    expect(condition.rowExistenceExpectation).toBe(TableStore.RowExistenceExpectation.EXPECT_NOT_EXIST);
    expect(condition.columnCondition).toBeNull();
  });

  it("EXPECT_EXIST + expires_at_ms LESS_EQUAL 条件:列名/比较符/passIfMissing 可读可写", () => {
    const cc = new TableStore.SingleColumnCondition(
      "expires_at_ms",
      TableStore.Long.fromNumber(1_000),
      TableStore.ComparatorType.LESS_EQUAL,
    );
    cc.passIfMissing = false;
    expect(cc.columnName).toBe("expires_at_ms");
    expect(cc.comparator).toBe(TableStore.ComparatorType.LESS_EQUAL);
    expect(cc.passIfMissing).toBe(false);
    expect((cc.columnValue as { toNumber(): number }).toNumber()).toBe(1_000);

    const condition = new TableStore.Condition(TableStore.RowExistenceExpectation.EXPECT_EXIST, cc);
    expect(condition.rowExistenceExpectation).toBe(TableStore.RowExistenceExpectation.EXPECT_EXIST);
    expect(condition.columnCondition).toBe(cc);
  });

  it("owner EQUAL 条件:构造成功且 passIfMissing 可置 false", () => {
    const cc = new TableStore.SingleColumnCondition("owner", "owner-a", TableStore.ComparatorType.EQUAL);
    cc.passIfMissing = false;
    expect(cc.columnName).toBe("owner");
    expect(cc.columnValue).toBe("owner-a");
    expect(cc.comparator).toBe(TableStore.ComparatorType.EQUAL);
    expect(cc.passIfMissing).toBe(false);
  });

  it("Long.fromNumber / toNumber 往返一致(毫秒时间戳精度)", () => {
    const ms = 1_754_000_000_123;
    expect(TableStore.Long.fromNumber(ms).toNumber()).toBe(ms);
  });
});

describe("Client 构造(官方文档字段,零网络)", () => {
  it("accessKeyId / secretAccessKey / endpoint / instancename 构造成功", () => {
    const client = new TableStore.Client({
      accessKeyId: "FAKE_AK_ID",
      secretAccessKey: "FAKE_AK_SECRET",
      endpoint: "https://fake-instance.cn-hangzhou.ots.example.com",
      instancename: "fake-instance",
    });
    expect(client).toBeInstanceOf(TableStore.Client);
    expect(typeof client.putRow).toBe("function");
    expect(typeof client.getRow).toBe("function");
    expect(typeof client.updateRow).toBe("function");
    expect(typeof client.deleteRow).toBe("function");
  });
});

describe("协议编解码往返(protobufjs 跨 major 兼容性证据,纯内存)", () => {
  function encodeToBody(operation: string, params: unknown): Uint8Array {
    const message = TableStore.encoder.encode(operation, params);
    // 与 SDK lib/client.js buildContent 相同的序列化路径:原型构造器静态 encode → Writer.finish()
    const proto = Object.getPrototypeOf(message).constructor as {
      encode(m: unknown): { finish(): Uint8Array };
    };
    return proto.encode(message).finish();
  }

  it("PutRow 参数(与适配器请求同构)可编码为非空协议体", () => {
    const body = encodeToBody("putRow", {
      tableName: "idempotency_keys",
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.EXPECT_NOT_EXIST, null),
      primaryKey: [{ key: "message:om_contract_1" }],
      attributeColumns: [
        { owner: "owner-a" },
        { kind: "idempotency" },
        { expires_at_ms: TableStore.Long.fromNumber(1_754_000_000_123) },
        { created_at_ms: TableStore.Long.fromNumber(1_754_000_000_000) },
      ],
    });
    expect(body.length).toBeGreaterThan(0);
  });

  it("UpdateRow 条件接管参数(EXPECT_EXIST + 列条件)可编码", () => {
    const cc = new TableStore.SingleColumnCondition(
      "expires_at_ms",
      TableStore.Long.fromNumber(1_754_000_000_000),
      TableStore.ComparatorType.LESS_EQUAL,
    );
    cc.passIfMissing = false;
    const body = encodeToBody("updateRow", {
      tableName: "idempotency_keys",
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.EXPECT_EXIST, cc),
      primaryKey: [{ key: "card:ev_contract_1" }],
      updateOfAttributeColumns: [
        {
          PUT: [
            { owner: "owner-b" },
            { kind: "idempotency" },
            { expires_at_ms: TableStore.Long.fromNumber(1_754_604_800_000) },
            { created_at_ms: TableStore.Long.fromNumber(1_754_000_000_000) },
          ],
        },
      ],
    });
    expect(body.length).toBeGreaterThan(0);
  });

  it("DeleteRow owner 条件参数可编码", () => {
    const cc = new TableStore.SingleColumnCondition("owner", "owner-a", TableStore.ComparatorType.EQUAL);
    cc.passIfMissing = false;
    const body = encodeToBody("deleteRow", {
      tableName: "idempotency_keys",
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.EXPECT_EXIST, cc),
      primaryKey: [{ key: "card:ev_contract_1" }],
    });
    expect(body.length).toBeGreaterThan(0);
  });

  it("GetRow 参数可编码", () => {
    const body = encodeToBody("getRow", {
      tableName: "idempotency_keys",
      primaryKey: [{ key: "message:om_contract_1" }],
      maxVersions: 1,
    });
    expect(body.length).toBeGreaterThan(0);
  });

  it("decode 路径可执行(无 required 字段的响应体解码不抛错)", () => {
    // listTable 响应无 required 字段,空协议体合法;PutRow/GetRow 等响应含
    // required 字段(如 consumed),不适合作为空体解码样本。
    const decoded = TableStore.decoder.decode("listTable", new Uint8Array(0));
    expect(decoded).toBeTruthy();
  });
});
