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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function projectItemsPage(
  nodes: unknown[],
  hasNextPage: boolean,
  endCursor: string | null,
): unknown {
  return {
    data: {
      user: {
        projectV2: {
          items: { nodes, pageInfo: { hasNextPage, endCursor } },
        },
      },
    },
  };
}

function todoItem(
  itemId: string,
  title: string,
  status: string,
  fields: Record<string, string> = {},
): unknown {
  return {
    id: itemId,
    content: { title },
    fieldValues: {
      nodes: [
        { name: status, field: { name: "Status" } },
        ...Object.entries(fields).map(([name, value]) => ({
          name: value,
          field: { name },
        })),
      ],
    },
  };
}

function statusItem(status: string): unknown {
  return {
    fieldValues: {
      nodes: [{ name: status, field: { name: "Status" } }],
    },
  };
}

function requestAfter(init: RequestInit | undefined): string | null {
  const body = JSON.parse(String(init?.body)) as {
    variables: { after: string | null };
  };
  return body.variables.after;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("GitHub ProjectV2 items cursor 分页", () => {
  it("fetchTodos 聚合两页并保留状态过滤与字段解析", async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) =>
      todoItem(
        `PVTI_${index + 1}`,
        `第一页任务 ${index + 1}`,
        ["Backlog", "Next", "Doing", "Paused"][index % 4],
        index === 0
          ? { Type: "Feature", Effort: "M", Priority: "P0" }
          : undefined,
      ),
    );
    const secondPage = [
      todoItem("PVTI_51", "第二页任务", "Paused"),
      todoItem("PVTI_done", "已完成", "Done"),
    ];
    const fetchMock = vi.fn((_input: unknown, init?: RequestInit) => {
      const after = requestAfter(init);
      if (after === null)
        return Promise.resolve(
          jsonResponse(projectItemsPage(firstPage, true, "cursor-page-1")),
        );
      if (after === "cursor-page-1")
        return Promise.resolve(
          jsonResponse(projectItemsPage(secondPage, false, "cursor-page-2")),
        );
      throw new Error(`unexpected cursor: ${after}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchTodos } = await import("./github");
    const todos = await fetchTodos(ENV);

    expect(todos).toHaveLength(51);
    expect(todos.map((todo) => todo.itemId)).toHaveLength(
      new Set(todos.map((todo) => todo.itemId)).size,
    );
    expect(todos[0]).toEqual({
      itemId: "PVTI_1",
      title: "第一页任务 1",
      status: "Backlog",
      type: "Feature",
      effort: "M",
      priority: "P0",
    });
    expect(todos.some((todo) => todo.status === "Paused")).toBe(true);
    expect(todos.some((todo) => todo.status === "Done")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([, init]) => requestAfter(init))).toEqual([
      null,
      "cursor-page-1",
    ]);
  });

  it("countItemsByStatus 跨页计数并在 hasNextPage=false 后停止", async () => {
    const firstPage = [
      statusItem("Doing"),
      statusItem("Next"),
      statusItem("Doing"),
    ];
    const secondPage = [statusItem("Doing"), statusItem("Paused")];
    const fetchMock = vi.fn((_input: unknown, init?: RequestInit) => {
      const after = requestAfter(init);
      if (after === null)
        return Promise.resolve(
          jsonResponse(projectItemsPage(firstPage, true, "cursor-count-1")),
        );
      if (after === "cursor-count-1")
        return Promise.resolve(
          jsonResponse(projectItemsPage(secondPage, false, "cursor-count-2")),
        );
      throw new Error(`unexpected cursor: ${after}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { countItemsByStatus } = await import("./github");
    await expect(countItemsByStatus(ENV, "Doing")).resolves.toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([, init]) => requestAfter(init))).toEqual([
      null,
      "cursor-count-1",
    ]);
  });
});
