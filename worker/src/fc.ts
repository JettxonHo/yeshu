import { handle } from "hono-alibaba-cloud-fc3-adapter";
import { createApp } from "./app";
import {
  assertTablestoreBackend,
  loadEnv,
  parseIdempotencyTtlSeconds,
  parseTablestoreEnv,
  validateEnv,
} from "./env";
import { createTablestoreAtomicKeyStore } from "./lib/atomic-key-store-factory";

/**
 * 阿里云 FC 3.0 入口(官方 handler 模型,非常驻 server)。
 * 适配器把 FC 调用转成 Hono 请求;app 复用 createApp(平台无关,方案 A)。
 *
 * 经 esbuild 打包成 dist/index.js:`handler: index.handler` 指向此处的 handler。
 *
 * 幂等后端:生产必须 Tablestore,配置缺失冷启动即失败——不允许静默回退 Memory
 * (FC 多实例内存互不可见,回退等于关闭跨实例幂等)。凭证仅用于构造 SDK client,
 * 不进入日志;错误只指出缺失的变量名,不打印值。
 */
const env = loadEnv();
validateEnv(env); // 必填 secret 缺失 → 冷启动抛错(优于静默 fail-open)

assertTablestoreBackend(process.env); // IDEMPOTENCY_BACKEND 必须为 "tablestore"
const atomicKeyStore = createTablestoreAtomicKeyStore(parseTablestoreEnv(process.env));
const idempotencyTtlSeconds = parseIdempotencyTtlSeconds(process.env);

export const handler = handle(createApp(env, { atomicKeyStore, idempotencyTtlSeconds }));
