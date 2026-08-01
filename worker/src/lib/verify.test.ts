import { describe, expect, it } from "vitest";
import type { Env } from "../types";
import { isChallenge, verifyToken } from "./verify";

/**
 * 锁定 verify.ts 当前行为(V1-b Verification Token 简化版)。
 * 注:timing-safe 比较与 Encrypt Key 签名是后续安全加固,不在本基线。
 */

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    GITHUB_TOKEN: "gh-token",
    GITHUB_LOGIN: "login",
    GITHUB_PROJECT_NUMBER: "1",
    LARK_APP_ID: "app-id",
    LARK_APP_SECRET: "app-secret",
    LARK_OPEN_ID: "open-id",
    LARK_VERIFICATION_TOKEN: "v-token",
    ...overrides,
  };
}

describe("verifyToken", () => {
  it("env 未配 token(空串)→ fail-closed 拒绝", () => {
    const env = makeEnv({ LARK_VERIFICATION_TOKEN: "" });
    expect(verifyToken({ header: { token: "anything" } }, env)).toBe(false);
    expect(verifyToken({ header: { token: "" } }, env)).toBe(false);
  });

  it("body 缺 token → 拒绝", () => {
    const env = makeEnv();
    expect(verifyToken({}, env)).toBe(false);
    expect(verifyToken({ header: {} }, env)).toBe(false);
    expect(verifyToken(null, env)).toBe(false);
    expect(verifyToken(undefined, env)).toBe(false);
  });

  it("token 错误 → 拒绝", () => {
    expect(verifyToken({ header: { token: "wrong" } }, makeEnv())).toBe(false);
  });

  it("body.header.token 正确 → 放行", () => {
    expect(verifyToken({ header: { token: "v-token" } }, makeEnv())).toBe(true);
  });

  it("旧格式 body.token 正确 → 放行(当前实现 header ?? body 回退)", () => {
    expect(verifyToken({ token: "v-token" }, makeEnv())).toBe(true);
  });

  it("header.token 存在但错误时不回退 body.token(锁定 ?? 语义)", () => {
    const body = { header: { token: "wrong" }, token: "v-token" };
    expect(verifyToken(body, makeEnv())).toBe(false);
  });
});

describe("isChallenge", () => {
  it("url_verification 且带 challenge → true", () => {
    expect(isChallenge({ type: "url_verification", challenge: "abc123" })).toBe(true);
  });

  it("url_verification 缺 challenge → false", () => {
    expect(isChallenge({ type: "url_verification" })).toBe(false);
    expect(isChallenge({ type: "url_verification", challenge: "" })).toBe(false);
  });

  it("普通事件 / 异常输入 → false", () => {
    expect(isChallenge({ type: "event_callback", header: { event_type: "im.message.receive_v1" } })).toBe(false);
    expect(isChallenge({})).toBe(false);
    expect(isChallenge(null)).toBe(false);
  });
});
