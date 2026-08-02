/**
 * 官方 `tablestore` 包的最小环境类型声明。
 *
 * 该包不自带类型、无匹配版本的 @types(@types/tablestore 5.1.3 对应旧 SDK)。
 * 本声明只覆盖本仓库适配器用到的导出,结构以 SDK 运行时实测为准
 * (lib/client.js Promise 化 makeRequest;lib/metadata.js Condition /
 * SingleColumnCondition 实例属性;samples/ 参数形状;extractError 的
 * 结构化 error.code)。升级 SDK 时以实际行为复核本文件。
 */
declare module "tablestore" {
  /** 行存在性条件(数值与 SDK 运行时枚举一致:IGNORE=0 / EXPECT_EXIST=1 / EXPECT_NOT_EXIST=2)。 */
  export const RowExistenceExpectation: {
    readonly IGNORE: number;
    readonly EXPECT_EXIST: number;
    readonly EXPECT_NOT_EXIST: number;
  };

  /** 列条件比较符(EQUAL=1 … LESS_EQUAL=6,以运行时为准)。 */
  export const ComparatorType: {
    readonly EQUAL: number;
    readonly NOT_EQUAL: number;
    readonly GREATER_THAN: number;
    readonly GREATER_EQUAL: number;
    readonly LESS_THAN: number;
    readonly LESS_EQUAL: number;
  };

  export class SingleColumnCondition {
    constructor(columnName: string, columnValue: string | number | Long, comparator: number);
    columnName: string;
    columnValue: string | number | Long;
    comparator: number;
    /** 列缺失时条件是否通过(默认 true)。 */
    passIfMissing: boolean;
    latestVersionOnly: boolean;
  }

  export class Condition {
    constructor(rowExistenceExpectation: number, columnCondition: SingleColumnCondition | null);
    rowExistenceExpectation: number;
    columnCondition: SingleColumnCondition | null;
  }

  /** 64 位整数列值(SDK 的 Long;INTEGER 列读回亦为此类型)。 */
  export class Long {
    static fromNumber(value: number): Long;
    toNumber(): number;
  }

  export interface ClientConfig {
    accessKeyId: string;
    /** 与 secretAccessKey 等价,二选一。 */
    accessKeySecret?: string;
    secretAccessKey?: string;
    /** 可选 STS 临时凭证 token。 */
    stsToken?: string;
    endpoint: string;
    /** 实例名(注意 SDK 键名为全小写 instancename)。 */
    instancename: string;
  }

  export class Client {
    constructor(config: ClientConfig);
    // 参数与返回的精细结构由适配器侧 TablestoreClientLike 约束;
    // SDK 无官方类型,此处用 any 保持赋值兼容(与未类型化包的常规做法一致)。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    putRow(params: any): Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getRow(params: any): Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateRow(params: any): Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteRow(params: any): Promise<any>;
  }
}
