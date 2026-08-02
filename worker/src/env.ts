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

// ---------- 幂等后端(Tablestore)配置 ----------

/**
 * Tablestore idempotency key table connection configuration (struct after parsing; credentials are not included in the generic Env type).
 *
 * 当前唯一批准的生产凭证模式:专用最小权限 RAM 用户 AccessKey。
 * 静态 STS token 不受支持(无自动刷新机制;延期为独立设计项,见运行手册)。
 */
export interface TablestoreConfig {
  endpoint: string;
  instanceName: string;
  tableName: string;
  accessKeyId: string;
  accessKeySecret: string;
}

/** 幂等 claim TTL 默认值(秒):7 天。表级 TTL 只负责长期清理,实时判断以此为据。 */
export const IDEMPOTENCY_TTL_SECONDS_DEFAULT = 7 * 24 * 60 * 60;

/**
 * 解析 Tablestore 配置。错误只列变量名,绝不输出变量值(脱敏)。
 * AccessKey ID / Secret 必须成对;严禁主账号 AccessKey(最小权限 RAM)。
 */
export function parseTablestoreEnv(
  record: Readonly<Record<string, string | undefined>>,
): TablestoreConfig {
  const endpoint = (record.TABLESTORE_ENDPOINT ?? "").trim();
  const instanceName = (record.TABLESTORE_INSTANCE_NAME ?? "").trim();
  const tableName = (record.TABLESTORE_TABLE_NAME ?? "").trim();
  const accessKeyId = (record.TABLESTORE_ACCESS_KEY_ID ?? "").trim();
  const accessKeySecret = (record.TABLESTORE_ACCESS_KEY_SECRET ?? "").trim();

  // AK 成对校验先于 missing 汇总:只配一半是配置错误,单独报错更明确
  if (!!accessKeyId !== !!accessKeySecret) {
    throw new Error(
      "Tablestore AccessKey 配置不完整:TABLESTORE_ACCESS_KEY_ID 与 TABLESTORE_ACCESS_KEY_SECRET 必须成对存在",
    );
  }

  const missing: string[] = [];
  if (!endpoint) missing.push("TABLESTORE_ENDPOINT");
  if (!instanceName) missing.push("TABLESTORE_INSTANCE_NAME");
  if (!tableName) missing.push("TABLESTORE_TABLE_NAME");
  if (!accessKeyId) missing.push("TABLESTORE_ACCESS_KEY_ID");
  if (!accessKeySecret) missing.push("TABLESTORE_ACCESS_KEY_SECRET");
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return { endpoint, instanceName, tableName, accessKeyId, accessKeySecret };
}

/**
 * 生产入口(fc.ts)幂等后端必须是 tablestore:缺失或其他取值 → 冷启动失败。
 * 禁止生产静默回退 Memory(多实例内存互不可见,回退等于关闭跨实例幂等)。
 */
export function assertTablestoreBackend(record: Readonly<Record<string, string | undefined>>): void {
  const backend = (record.IDEMPOTENCY_BACKEND ?? "").trim();
  if (backend !== "tablestore") {
    throw new Error('IDEMPOTENCY_BACKEND 必须配置为 "tablestore"(生产不允许静默回退内存后端)');
  }
}

/** 解析 IDEMPOTENCY_TTL_SECONDS(正整数秒);未配置 → 默认 7 天;非法 → 抛错。 */
export function parseIdempotencyTtlSeconds(
  record: Readonly<Record<string, string | undefined>>,
): number {
  const raw = (record.IDEMPOTENCY_TTL_SECONDS ?? "").trim();
  if (!raw) return IDEMPOTENCY_TTL_SECONDS_DEFAULT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("IDEMPOTENCY_TTL_SECONDS 必须为正整数(单位:秒)");
  }
  return n;
}
