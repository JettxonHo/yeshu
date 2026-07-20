import type { Env } from "../types";

const FEISHU_BASE = "https://open.feishu.cn";

// token 缓存(Worker 实例内复用;实例不保证持久,过期会重换)
let cachedToken: { token: string; exp: number } | null = null;

async function getTenantToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.token;
  const resp = await fetch(`${FEISHU_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: env.LARK_APP_ID, app_secret: env.LARK_APP_SECRET }),
  });
  if (!resp.ok) throw new Error(`换 tenant token ${resp.status}`);
  const data: any = await resp.json();
  if (data.code !== 0) throw new Error(`飞书换 token:${data.msg}`);
  cachedToken = { token: data.tenant_access_token, exp: now + (data.expire ?? 7200) };
  return data.tenant_access_token;
}

/** 发 interactive 卡片到 open_id,返回 message_id */
export async function sendCard(env: Env, openId: string, card: Record<string, unknown>): Promise<string> {
  const token = await getTenantToken(env);
  const resp = await fetch(`${FEISHU_BASE}/open-apis/im/v1/messages?receive_id_type=open_id`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      receive_id: openId,
      msg_type: "interactive",
      content: JSON.stringify(card),
    }),
  });
  if (!resp.ok) throw new Error(`飞书发消息 ${resp.status}: ${await resp.text()}`);
  const data: any = await resp.json();
  if (data.code !== 0) throw new Error(`飞书发消息:${data.msg}`);
  return data.data?.message_id ?? "";
}
