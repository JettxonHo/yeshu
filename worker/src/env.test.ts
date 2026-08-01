import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnv, validateEnv } from "./env";
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
