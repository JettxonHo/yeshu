import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { handleAdd } from "./add";
import { addDraftIssue } from "../lib/github";
import { sendCard } from "../lib/lark";

vi.mock("../lib/github", () => ({ addDraftIssue: vi.fn() }));
vi.mock("../lib/lark", () => ({ sendCard: vi.fn() }));
vi.mock("../lib/ai", () => ({ shortenTitle: (value: string) => value }));
vi.mock("../lib/cards", () => ({
  buildAddedCard: (title: string) => ({ title }),
}));

const ENV = {} as Env;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("handleAdd 错误边界", () => {
  it("GitHub 失败时只发送固定脱敏错误卡", async () => {
    vi.mocked(addDraftIssue).mockRejectedValue(
      new Error("private github body"),
    );
    vi.mocked(sendCard).mockResolvedValue("message-id");

    await handleAdd(ENV, "ou_test", "/add 测试任务");

    expect(sendCard).toHaveBeenCalledTimes(1);
    const card = vi.mocked(sendCard).mock.calls[0][2];
    expect(JSON.stringify(card)).toContain("暂时没能创建任务,请稍后重试");
    expect(JSON.stringify(card)).not.toContain("private github body");
  });

  it("建卡成功但确认卡失败时不再发送误导性的第二张错误卡", async () => {
    vi.mocked(addDraftIssue).mockResolvedValue("item-1");
    vi.mocked(sendCard).mockRejectedValue(new Error("lark failed"));

    await expect(
      handleAdd(ENV, "ou_test", "/add 测试任务"),
    ).resolves.toBeUndefined();
    expect(sendCard).toHaveBeenCalledTimes(1);
  });

  it("错误卡也发送失败时仍正常收口,不抛到 webhook", async () => {
    vi.mocked(addDraftIssue).mockRejectedValue(new Error("github failed"));
    vi.mocked(sendCard).mockRejectedValue(new Error("lark failed"));

    await expect(
      handleAdd(ENV, "ou_test", "/add 测试任务"),
    ).resolves.toBeUndefined();
  });
});
