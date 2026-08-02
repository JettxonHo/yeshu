import * as TableStore from "tablestore";
import type { AtomicKeyStore } from "./atomic-key-store";
import { MemoryAtomicKeyStore } from "./memory-atomic-key-store";
import { TablestoreAtomicKeyStore } from "./tablestore-atomic-key-store";
import type { TablestoreConfig } from "../env";

/**
 * AtomicKeyStore 工厂:把「选哪个后端」收敛到入口层。
 * - 本地开发入口(index.ts)→ createMemoryAtomicKeyStore(日志标记 backend=memory);
 * - 生产入口(fc.ts)→ createTablestoreAtomicKeyStore(配置缺失冷启动失败,不回退 Memory)。
 */

/** 本地 / 测试后端:内存版(单进程有效,无跨实例语义)。 */
export function createMemoryAtomicKeyStore(): AtomicKeyStore {
  return new MemoryAtomicKeyStore();
}

/**
 * 生产后端:Tablestore。client 由工厂用解析后的配置构造;
 * 适配器与 app 层都不读 process.env、不接触凭证。
 *
 * 构造字段使用官方文档命名(secretAccessKey,见 samples/client.js)。
 * 当前唯一批准的生产凭证模式:专用最小权限 RAM 用户 AccessKey;
 * 不支持静态 STS token(无自动刷新,见运行手册)。
 */
export function createTablestoreAtomicKeyStore(config: TablestoreConfig): AtomicKeyStore {
  const client = new TableStore.Client({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.accessKeySecret,
    endpoint: config.endpoint,
    instancename: config.instanceName,
  });
  return new TablestoreAtomicKeyStore({ client, tableName: config.tableName });
}
