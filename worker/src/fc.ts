import { handle } from "hono-alibaba-cloud-fc3-adapter";
import { createApp } from "./app";
import { loadEnv, validateEnv } from "./env";

/**
 * 阿里云 FC 3.0 入口(官方 handler 模型,非常驻 server)。
 * 适配器把 FC 调用转成 Hono 请求;app 复用 createApp(平台无关,方案 A)。
 *
 * 经 esbuild 打包成 dist/index.js:`handler: index.handler` 指向此处的 handler。
 */
const env = loadEnv();
validateEnv(env); // 必填 secret 缺失 → 冷启动抛错(优于静默 fail-open)

export const handler = handle(createApp(env));
