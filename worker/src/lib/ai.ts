import type { Env } from "../types";

/**
 * AI 抽象层(OpenAI 兼容,spec §11.5)。
 * 切 provider 改 AI_BASE_URL/AI_API_KEY/AI_MODEL,代码不动。
 * V1-b:标题生成留壳子(AI_API_KEY 未配);/add 超 20 字先截断。
 */
export async function callAI(env: Env, prompt: string): Promise<string> {
  if (!env.AI_API_KEY || !env.AI_BASE_URL) {
    throw new Error("AI 未配置(AI_API_KEY / AI_BASE_URL)");
  }
  const resp = await fetch(`${env.AI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.AI_MODEL, messages: [{ role: "user", content: prompt }] }),
  });
  if (!resp.ok) {
    throw new Error(`AI ${resp.status}: ${await resp.text()}`);
  }
  const data: any = await resp.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/** 标题超 20 字时生成短标题。V1-b 简化:直接截断(AI 生成留后续) */
export function shortenTitle(raw: string): string {
  const t = raw.trim();
  return t.length <= 20 ? t : t.slice(0, 20) + "…";
}
