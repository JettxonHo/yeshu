import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IDEMPOTENCY_TTL_SECONDS_DEFAULT,
  assertTablestoreBackend,
  loadEnv,
  parseIdempotencyTtlSeconds,
  parseTablestoreEnv,
  validateEnv,
} from "./env";
import type { Env } from "./types";

/**
 * 锁定 env.ts 当前行为:必填 secret 冷启动校验(fail-fast)+ 缺失回退空串。
 * 不修改生产逻辑,仅通过注入 process.env 测试纯函数。
 */

function fullEnv(): Env {
  return {
    GITHUB_TOKEN: "gh-token",
    GITHUB_LOGIN: "login",
    GITHUB_PROJECT_NUMBER: "1",
    LARK_APP_ID: "app-id",
    LARK_APP_SECRET: "app-secret",
    LARK_OPEN_ID: "open-id",
    LARK_VERIFICATION_TOKEN: "v-token",
    AI_PROVIDER: "deepseek",
    AI_BASE_URL: "https://api.deepseek.com",
    AI_MODEL: "deepseek-chat",
    AI_API_KEY: "sk-test",
  };
}

describe("validateEnv", () => {
  it("必填项齐全 → 不抛错", () => {
    expect(() => validateEnv(fullEnv())).not.toThrow();
  });

  it("必填项缺失/空串 → 抛错并列出缺失键", () => {
    const env = fullEnv();
    env.GITHUB_TOKEN = "";
    env.LARK_APP_SECRET = "";
    expect(() => validateEnv(env)).toThrow(/GITHUB_TOKEN/);
    expect(() => validateEnv(env)).toThrow(/LARK_APP_SECRET/);
  });

  it("可选 AI_* 全缺 → 不抛错", () => {
    const env = fullEnv();
    delete env.AI_PROVIDER;
    delete env.AI_BASE_URL;
    delete env.AI_MODEL;
    delete env.AI_API_KEY;
    expect(() => validateEnv(env)).not.toThrow();
  });

  it("LARK_OPEN_ID 不在必填列表(锁定现状:worker 不读取,推送 openId 取自事件体)", () => {
    const env = fullEnv();
    env.LARK_OPEN_ID = "";
    expect(() => validateEnv(env)).not.toThrow();
  });
});

describe("loadEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("读取 process.env;必填缺失回退空串,可选缺失为 undefined", () => {
    vi.stubEnv("GITHUB_TOKEN", "abc");
    vi.stubEnv("GITHUB_LOGIN", "me");
    vi.stubEnv("GITHUB_PROJECT_NUMBER", "7");
    vi.stubEnv("LARK_APP_ID", "");
    vi.stubEnv("LARK_APP_SECRET", "");
    vi.stubEnv("LARK_OPEN_ID", "");
    vi.stubEnv("LARK_VERIFICATION_TOKEN", "");
    delete process.env.AI_API_KEY;

    const env = loadEnv();
    expect(env.GITHUB_TOKEN).toBe("abc");
    expect(env.GITHUB_PROJECT_NUMBER).toBe("7");
    expect(env.LARK_APP_ID).toBe("");
    expect(env.AI_API_KEY).toBeUndefined();
  });

  it("loadEnv + validateEnv 联动:空环境校验失败", () => {
    for (const k of [
      "GITHUB_TOKEN",
      "GITHUB_LOGIN",
      "GITHUB_PROJECT_NUMBER",
      "LARK_APP_ID",
      "LARK_APP_SECRET",
      "LARK_VERIFICATION_TOKEN",
    ]) {
      vi.stubEnv(k, "");
    }
    expect(() => validateEnv(loadEnv())).toThrow(/缺少必填环境变量/);
  });
});

// ---------- 幂等后端(Tablestore)配置解析 ----------

function fullTablestoreRecord(): Record<string, string> {
  return {
    TABLESTORE_ENDPOINT: "https://example.cn-hangzhou.ots-inner.aliyuncs.com",
    TABLESTORE_INSTANCE_NAME: "example-instance",
    TABLESTORE_TABLE_NAME: "idempotency_keys",
    TABLESTORE_ACCESS_KEY_ID: "FAKE_AK_ID",
    TABLESTORE_ACCESS_KEY_SECRET: "FAKE_AK_SECRET",
  };
}

describe("parseTablestoreEnv", () => {
  it("全部配置齐全 → 解析成功(仅五个字段)", () => {
    const config = parseTablestoreEnv(fullTablestoreRecord());
    expect(config).toEqual({
      endpoint: "https://example.cn-hangzhou.ots-inner.aliyuncs.com",
      instanceName: "example-instance",
      tableName: "idempotency_keys",
      accessKeyId: "FAKE_AK_ID",
      accessKeySecret: "FAKE_AK_SECRET",
    });
  });

  it("静态 STS 不受支持:即便环境配置了 TABLESTORE_STS_TOKEN 也不读取、不进入 config", () => {
    const record = { ...fullTablestoreRecord(), TABLESTORE_STS_TOKEN: "FAKE_STS_SHOULD_NOT_BE_READ" };
    const config = parseTablestoreEnv(record);
    expect(Object.keys(config).sort()).toEqual([
      "accessKeyId",
      "accessKeySecret",
      "endpoint",
      "instanceName",
      "tableName",
    ]);
    expect((config as { stsToken?: unknown }).stsToken).toBeUndefined();
  });

  it("endpoint 缺失 → 抛错且仅列变量名", () => {
    const record = fullTablestoreRecord();
    delete record.TABLESTORE_ENDPOINT;
    expect(() => parseTablestoreEnv(record)).toThrow(/TABLESTORE_ENDPOINT/);
  });

  it("instance 缺失 → 抛错且仅列变量名", () => {
    const record = fullTablestoreRecord();
    delete record.TABLESTORE_INSTANCE_NAME;
    expect(() => parseTablestoreEnv(record)).toThrow(/TABLESTORE_INSTANCE_NAME/);
  });

  it("table 缺失 → 抛错且仅列变量名", () => {
    const record = fullTablestoreRecord();
    delete record.TABLESTORE_TABLE_NAME;
    expect(() => parseTablestoreEnv(record)).toThrow(/TABLESTORE_TABLE_NAME/);
  });

  it("AccessKey 只配置一半(ID)→ 抛错并点名两个变量", () => {
    const record = fullTablestoreRecord();
    delete record.TABLESTORE_ACCESS_KEY_SECRET;
    expect(() => parseTablestoreEnv(record)).toThrow(/TABLESTORE_ACCESS_KEY_ID/);
    expect(() => parseTablestoreEnv(record)).toThrow(/TABLESTORE_ACCESS_KEY_SECRET/);
  });

  it("AccessKey 只配置一半(Secret)→ 抛错", () => {
    const record = fullTablestoreRecord();
    delete record.TABLESTORE_ACCESS_KEY_ID;
    expect(() => parseTablestoreEnv(record)).toThrow(/必须成对存在/);
  });

  it("错误信息脱敏:不泄露任何配置值", () => {
    const record = fullTablestoreRecord();
    delete record.TABLESTORE_ENDPOINT;
    try {
      parseTablestoreEnv(record);
      expect.unreachable("应抛错");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain("FAKE_AK_ID");
      expect(msg).not.toContain("FAKE_AK_SECRET");
      expect(msg).not.toContain("example-instance");
      expect(msg).not.toContain("idempotency_keys");
    }
  });
});

describe("assertTablestoreBackend", () => {
  it('IDEMPOTENCY_BACKEND = "tablestore" → 通过', () => {
    expect(() => assertTablestoreBackend({ IDEMPOTENCY_BACKEND: "tablestore" })).not.toThrow();
  });

  it("缺失 → 抛错(生产不得静默回退 Memory)", () => {
    expect(() => assertTablestoreBackend({})).toThrow(/IDEMPOTENCY_BACKEND/);
  });

  it('其他取值(如 "memory")→ 抛错', () => {
    expect(() => assertTablestoreBackend({ IDEMPOTENCY_BACKEND: "memory" })).toThrow(/IDEMPOTENCY_BACKEND/);
  });
});

describe("parseIdempotencyTtlSeconds", () => {
  it("未配置 → 默认 7 天", () => {
    expect(parseIdempotencyTtlSeconds({})).toBe(IDEMPOTENCY_TTL_SECONDS_DEFAULT);
    expect(IDEMPOTENCY_TTL_SECONDS_DEFAULT).toBe(604_800);
  });

  it("合法正整数 → 采用", () => {
    expect(parseIdempotencyTtlSeconds({ IDEMPOTENCY_TTL_SECONDS: "3600" })).toBe(3600);
  });

  it("非法值(0 / 负数 / 小数 / 非数字)→ 抛错", () => {
    for (const bad of ["0", "-1", "1.5", "abc"]) {
      expect(() => parseIdempotencyTtlSeconds({ IDEMPOTENCY_TTL_SECONDS: bad })).toThrow(
        /IDEMPOTENCY_TTL_SECONDS/,
      );
    }
  });
});
