import type { Env } from "../types";
import { ExternalHttpError, fetchJsonWithPolicy } from "./http";

const FEISHU_BASE = "https://open.feishu.cn";

// token 缓存(Worker 实例内复用;实例不保证持久,过期会重换)
let cachedToken: { token: string; exp: number } | null = null;

async function getTenantToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.token;
  const data = await fetchJsonWithPolicy<Record<string, unknown>>(
    `${FEISHU_BASE}/open-apis/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: env.LARK_APP_ID,
        app_secret: env.LARK_APP_SECRET,
      }),
    },
    {
      service: "feishu",
      // token 创建接口仍按副作用请求处理,不自动重试。
      retry: "none",
    },
  );
  if (data.code !== 0 || typeof data.tenant_access_token !== "string") {
    throw new ExternalHttpError({
      service: "feishu",
      kind: "remote-error",
      retryable: false,
    });
  }
  const expiresIn =
    typeof data.expire === "number" && data.expire > 0 ? data.expire : 7200;
  cachedToken = { token: data.tenant_access_token, exp: now + expiresIn };
  return data.tenant_access_token;
}

/** 发 interactive 卡片到 open_id,返回 message_id */
export async function sendCard(
  env: Env,
  openId: string,
  card: Record<string, unknown>,
): Promise<string> {
  const token = await getTenantToken(env);
  try {
    const data = await fetchJsonWithPolicy<{
      code?: unknown;
      data?: { message_id?: unknown };
    }>(
      `${FEISHU_BASE}/open-apis/im/v1/messages?receive_id_type=open_id`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receive_id: openId,
          msg_type: "interactive",
          content: JSON.stringify(card),
        }),
      },
      {
        service: "feishu",
        // 发卡片是 mutation:响应丢失时重试会重复发消息,因此只尝试一次。
        retry: "none",
      },
    );
    if (data.code !== 0) {
      // 飞书 OpenAPI 常用 HTTP 200 + 非零业务码表达失败。mutation 不重试,
      // 但清缓存可保证下一次用户操作重新取 token;其他业务错误最多多换一次 token。
      cachedToken = null;
      throw new ExternalHttpError({
        service: "feishu",
        kind: "remote-error",
        retryable: false,
      });
    }
    return typeof data.data?.message_id === "string"
      ? data.data.message_id
      : "";
  } catch (error) {
    // 401 表示实例缓存 token 已失效;清缓存,下次用户操作重新获取。
    if (error instanceof ExternalHttpError && error.status === 401)
      cachedToken = null;
    throw error;
  }
}
