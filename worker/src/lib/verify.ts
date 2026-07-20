import type { Env } from "../types";

/**
 * 飞书事件校验(V1-b 简化版)。
 *
 * V1-b 用 Verification Token 校验(body.header.token)。
 * Encrypt Key 签名(X-Lark-Signature SHA256)+ 事件加密(AES-256-CBC)留 V2+,
 * 届时改这里(加签名校验 + 解密)。参见飞书文档:
 * https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/encrypt-key-encryption-configuration-case
 */

/** Verification Token 校验 */
export function verifyToken(body: any, env: Env): boolean {
  const expected = env.LARK_VERIFICATION_TOKEN;
  if (!expected) return true; // 未配 token 则跳过(仅本地调试,生产必配)
  const token = body?.header?.token ?? body?.token;
  return token === expected;
}

/** 飞书 URL 验证(challenge):配 webhook 时原样返回 challenge */
export function isChallenge(body: any): boolean {
  return body?.type === "url_verification" && !!body?.challenge;
}
