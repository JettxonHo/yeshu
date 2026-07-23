import type { Env } from "./types";

/**
 * 从 process.env 构造 Env。
 * - 本地:index.ts 入口 `import "dotenv/config"` 把 .env 注入 process.env。
 * - 阿里云 FC:平台「环境变量」直接注入 process.env(见 s.yaml environmentVariables)。
 */
export function loadEnv(): Env {
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

/** worker 运行真正依赖的必填 secret(缺失则功能不可用或鉴权失效) */
const REQUIRED_ENV: ReadonlyArray<keyof Env> = [
  "GITHUB_TOKEN",
  "GITHUB_LOGIN",
  "GITHUB_PROJECT_NUMBER",
  "LARK_APP_ID",
  "LARK_APP_SECRET",
  "LARK_VERIFICATION_TOKEN",
];

/**
 * 冷启动校验:必填 secret 缺失/为空即抛错,函数起不来。
 * 防止新克隆/CI 把空值推上线(叠加 verifyToken fail-closed,杜绝静默无鉴权)。
 * AI_* 可选(V1-b 未接);LARK_OPEN_ID worker 不读取(推送 openId 取自事件体)。
 */
export function validateEnv(env: Env): void {
  const missing = REQUIRED_ENV.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`缺少必填环境变量:${missing.join(", ")}`);
  }
}
