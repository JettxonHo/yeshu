import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types";

const ENV: Env = {
  GITHUB_TOKEN: "test-token",
  GITHUB_LOGIN: "test-user",
  GITHUB_PROJECT_NUMBER: "1",
  LARK_APP_ID: "test-app",
  LARK_APP_SECRET: "test-secret",
  LARK_OPEN_ID: "",
  LARK_VERIFICATION_TOKEN: "test-verification",
  AI_BASE_URL: "https://ai.example.com/v1",
  AI_MODEL: "test-model",
  AI_API_KEY: "test-ai-key",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("GitHub GraphQL 请求策略", () => {
  it("query 遇到 503 时重试一次并成功", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("temporary private detail", { status: 503 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: { user: { projectV2: { items: { nodes: [] } } } },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchTodos } = await import("./github");

    await expect(fetchTodos(ENV)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("mutation 遇到 503 只调用一次且错误不含响应体", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            user: {
              projectV2: {
                id: "project-1",
                fields: {
                  nodes: [
                    {
                      id: "status-field",
                      name: "Status",
                      options: [{ id: "backlog-option", name: "Backlog" }],
                    },
                  ],
                },
              },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response("secret mutation detail", { status: 503 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { addDraftIssue } = await import("./github");

    const promise = addDraftIssue(ENV, "测试任务");
    await expect(promise).rejects.toMatchObject({ kind: "http", status: 503 });
    await expect(promise).rejects.not.toThrow(/secret mutation detail/);
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 次 meta query + 1 次 add mutation
  });

  it("GraphQL errors 不透传上游 path/message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: null,
        errors: [
          { message: "private node id abc", path: ["user", "projectV2"] },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchTodos } = await import("./github");

    const promise = fetchTodos(ENV);
    await expect(promise).rejects.toMatchObject({ kind: "remote-error" });
    await expect(promise).rejects.not.toThrow(/private node id abc/);
  });
});

describe("飞书与 AI mutation 策略", () => {
  it("飞书发卡片 503 不自动重试", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          tenant_access_token: "tenant-token",
          expire: 7200,
        }),
      )
      .mockResolvedValueOnce(
        new Response("private lark response", { status: 503 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { sendCard } = await import("./lark");

    const promise = sendCard(ENV, "ou_test", { config: { wide_screen: true } });
    await expect(promise).rejects.toMatchObject({ kind: "http", status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(2); // 换 token + 发卡片,发卡片本身仅一次
  });

  it("飞书 HTTP 200 + 非零业务码会清 token,下一次操作重新获取", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          tenant_access_token: "tenant-token-1",
          expire: 7200,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ code: 99991663, msg: "private invalid token detail" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          tenant_access_token: "tenant-token-2",
          expire: 7200,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ code: 0, data: { message_id: "message-2" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { sendCard } = await import("./lark");

    const first = sendCard(ENV, "ou_test", { config: { wide_screen: true } });
    await expect(first).rejects.toMatchObject({ kind: "remote-error" });
    await expect(first).rejects.not.toThrow(/private invalid token detail/);
    await expect(
      sendCard(ENV, "ou_test", { config: { wide_screen: true } }),
    ).resolves.toBe("message-2");

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: "Bearer tenant-token-1",
    });
    expect(fetchMock.mock.calls[3][1]?.headers).toMatchObject({
      Authorization: "Bearer tenant-token-2",
    });
  });

  it("AI 生成 503 不自动重试", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("private ai response", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const { callAI } = await import("./ai");

    await expect(callAI(ENV, "测试")).rejects.toMatchObject({
      kind: "http",
      status: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
