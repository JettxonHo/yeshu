import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { handleToday } from "./today";
import { fetchTodos } from "../lib/github";
import { sendCard } from "../lib/lark";

vi.mock("../lib/github", () => ({ fetchTodos: vi.fn() }));
vi.mock("../lib/lark", () => ({ sendCard: vi.fn() }));
vi.mock("../lib/cards", () => ({ buildTodoCard: () => ({ card: "today" }) }));

const ENV = {} as Env;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("handleToday 错误边界", () => {
  it("读取失败时发送固定脱敏错误卡", async () => {
    vi.mocked(fetchTodos).mockRejectedValue(new Error("private graphql body"));
    vi.mocked(sendCard).mockResolvedValue("message-id");

    await handleToday(ENV, "ou_test");

    expect(sendCard).toHaveBeenCalledTimes(1);
    const card = vi.mocked(sendCard).mock.calls[0][2];
    expect(JSON.stringify(card)).toContain("暂时没能读取任务,请稍后重试");
    expect(JSON.stringify(card)).not.toContain("private graphql body");
  });

  it("读取成功但卡片发送失败时不再发送误导性的第二张错误卡", async () => {
    vi.mocked(fetchTodos).mockResolvedValue([]);
    vi.mocked(sendCard).mockRejectedValue(new Error("lark failed"));

    await expect(handleToday(ENV, "ou_test")).resolves.toBeUndefined();
    expect(sendCard).toHaveBeenCalledTimes(1);
  });
});
