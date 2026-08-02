import { serve } from "@hono/node-server";
import "dotenv/config"; // 本地读 .env
import { createApp } from "./app";
import { loadEnv, validateEnv } from "./env";
import { createMemoryAtomicKeyStore } from "./lib/atomic-key-store-factory";

/**
 * 本地开发入口(tsx 启动常驻 HTTP 服务)。
 * 生产入口在 src/fc.ts(FC handler 模型),经 esbuild 打包上阿里云 FC。
 *
 * 幂等后端:本地固定使用 Memory(单进程有效,仅用于开发/调试;
 * 无跨实例语义,生产绝不用)。不读取 TABLESTORE_* 配置,不打印事件 key。
 */
const env = loadEnv();
validateEnv(env); // 必填 secret 缺失即报错(.env 没填全)

console.log("[idempotency] backend=memory(local-dev-only)");

const port = Number(process.env.PORT) || 9000; // 本地 dev 端口;生产走 fc.ts handler 模型,不监听端口
serve(
  { fetch: createApp(env, { atomicKeyStore: createMemoryAtomicKeyStore() }).fetch, port },
  (info) => {
    console.log(`野薯 Worker 监听 http://localhost:${info.port}`);
  },
);
