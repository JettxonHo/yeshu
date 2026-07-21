import { serve } from "@hono/node-server";
import "dotenv/config"; // 本地读 .env;阿里云 FC 用平台环境变量
import { createApp } from "./app";
import type { Env } from "./types";

/**
 * 入口(阿里云 FC Web 函数 / 本地 Node)。
 * 方案 A:从 process.env 构造 env 对象,注入 app;lib/commands 不改。
 */
function loadEnv(): Env {
  return {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? "",
    GITHUB_LOGIN: process.env.GITHUB_LOGIN ?? "",
    GITHUB_PROJECT_NUMBER: process.env.GITHUB_PROJECT_NUMBER ?? "",
    LARK_APP_ID: process.env.LARK_APP_ID ?? "",
    LARK_APP_SECRET: process.env.LARK_APP_SECRET ?? "",
    LARK_OPEN_ID: process.env.LARK_OPEN_ID ?? "",
    LARK_VERIFICATION_TOKEN: process.env.LARK_VERIFICATION_TOKEN ?? "",
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_MODEL: process.env.AI_MODEL,
    AI_API_KEY: process.env.AI_API_KEY,
  };
}

const port = Number(process.env.PORT) || 9000; // FC Web 函数默认监听 9000
serve({ fetch: createApp(loadEnv()).fetch, port }, (info) => {
  console.log(`野薯 Worker 监听 http://localhost:${info.port}`);
});
