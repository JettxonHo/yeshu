import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * callback 服务端校验测试:全程 mock,不触真实 GitHub / 飞书 / 生产数据。
 * 锁定 PR-B 契约:只信任 value.action + value.itemId;来源校验先于 WIP;
 * 客户端 title 一律忽略;找不到 item(终态/删除/过期卡)与非法来源一律拒绝且不 mutation。
 */
vi.mock("../lib/github", () => ({
  fetchTodos: vi.fn(),
  updateItemStatus: vi.fn(),
}));
vi.mock("../lib/reward", () => ({
  rollReward: () => "REWARD_STUB",
}));

import { fetchTodos, updateItemStatus } from "../lib/github";
import type { Env, Todo } from "../types";
import { handleCardCallback } from "./callback";

const ENV: Env = {
  GITHUB_TOKEN: "gh-token",
  GITHUB_LOGIN: "login",
  GITHUB_PROJECT_NUMBER: "1",
  LARK_APP_ID: "app-id",
  LARK_APP_SECRET: "app-secret",
  LARK_OPEN_ID: "open-id",
  LARK_VERIFICATION_TOKEN: "v-token",
};

function cbBody(value: unknown): unknown {
  return { event: { action: { value } } };
}

function makeTodo(itemId: string, title: string, status: string): Todo {
  return { itemId, title, status, type: "", effort: "", priority: "" };
}

function mockTodos(...todos: Todo[]): void {
  vi.mocked(fetchTodos).mockResolvedValue(todos);
}

function asJson(res: unknown): string {
  return JSON.stringify(res);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateItemStatus).mockResolvedValue(undefined);
});

describe("9.1 输入校验(先于一切 IO)", () => {
  it.each([
    ["action 缺失", { itemId: "PVTI_1" }],
    ["itemId 缺失", { action: "start" }],
    ["未知 action", { action: "fly", itemId: "PVTI_1" }],
    ["原型属性 action toString", { action: "toString", itemId: "PVTI_1" }],
    ["原型属性 action constructor", { action: "constructor", itemId: "PVTI_1" }],
    ["action 为空串", { action: "", itemId: "PVTI_1" }],
    ["value 整体缺失", undefined],
  ])("%s → 无效操作,不触 IO", async (_name, value) => {
    const res = await handleCardCallback(ENV, cbBody(value));
    expect(res).toEqual({ toast: { type: "error", content: "无效的按钮操作" } });
    expect(fetchTodos).not.toHaveBeenCalled();
    expect(updateItemStatus).not.toHaveBeenCalled();
  });

  it("body 为 null / 缺 event → 无效操作", async () => {
    expect(await handleCardCallback(ENV, null)).toEqual({ toast: { type: "error", content: "无效的按钮操作" } });
    expect(await handleCardCallback(ENV, {})).toEqual({ toast: { type: "error", content: "无效的按钮操作" } });
    expect(fetchTodos).not.toHaveBeenCalled();
  });
});

describe("9.2 八种合法转换(服务端来源 + 目标)", () => {
  const CASES: Array<[source: string, action: string, target: string, verb: string]> = [
    ["Backlog", "schedule", "Next", "排期"],
    ["Next", "defer", "Backlog", "改天"],
    ["Next", "start", "Doing", "开始"],
    ["Doing", "complete", "Done", "完成"],
    ["Doing", "pause", "Paused", "暂停"],
    ["Paused", "resume", "Doing", "恢复"],
    ["Paused", "demote", "Backlog", "降级"],
  ];

  it.each(CASES)("%s + %s → %s", async (source, action, target, verb) => {
    mockTodos(makeTodo("PVTI_1", "真实标题", source));
    const res = await handleCardCallback(ENV, cbBody({ action, itemId: "PVTI_1" }));

    expect(fetchTodos).toHaveBeenCalledTimes(1);
    expect(fetchTodos).toHaveBeenCalledWith(ENV);
    expect(updateItemStatus).toHaveBeenCalledTimes(1);
    expect(updateItemStatus).toHaveBeenCalledWith(ENV, "PVTI_1", target);
    expect((res as any).toast.type).toBe("success");

    const json = asJson(res);
    if (action === "complete") {
      expect((res as any).toast.content).toBe("已完成");
      expect(json).toContain("真实标题"); // 庆祝卡用服务端 title
      expect(json).toContain("Done");
      expect(json).toContain("REWARD_STUB");
    } else {
      expect((res as any).toast.content).toBe(`已${verb}`);
      expect(json).toContain("真实标题"); // 乐观更新列表用服务端数据
      expect(json).toContain(target);
    }
  });

  it.each(["Backlog", "Next", "Doing", "Paused"])("abandon:%s → Abandoned(四种来源全覆盖)", async (source) => {
    mockTodos(makeTodo("PVTI_1", "真实标题", source));
    const res = await handleCardCallback(ENV, cbBody({ action: "abandon", itemId: "PVTI_1" }));

    expect(updateItemStatus).toHaveBeenCalledTimes(1);
    expect(updateItemStatus).toHaveBeenCalledWith(ENV, "PVTI_1", "Abandoned");
    expect((res as any).toast).toEqual({ type: "success", content: "已放弃" });
    expect(asJson(res)).not.toContain("真实标题"); // 终态从列表移除
  });
});

describe("9.3 旧卡片 / 非法来源:拒绝且不 mutation", () => {
  it("itemId 不在活跃列表(已 Done/Abandoned/删除/过期卡)→ /today 刷新,零 mutation", async () => {
    mockTodos(); // 空列表:fetchTodos 只返回活跃态,终态 item 天然查不到
    const res = await handleCardCallback(ENV, cbBody({ action: "complete", itemId: "PVTI_gone" }));
    expect((res as any).toast.type).toBe("error");
    expect((res as any).toast.content).toContain("/today");
    expect(updateItemStatus).not.toHaveBeenCalled();
    expect(res).not.toHaveProperty("card");
  });

  it("列表非空但目标 item 已终态 → 同样拒绝", async () => {
    mockTodos(makeTodo("PVTI_other", "别的任务", "Next"));
    const res = await handleCardCallback(ENV, cbBody({ action: "start", itemId: "PVTI_gone" }));
    expect((res as any).toast.content).toContain("/today");
    expect(updateItemStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["旧 Doing 卡点 pause,服务端已是 Next", "Next", "pause"],
    ["旧 Backlog 卡点 schedule,服务端已是 Doing", "Doing", "schedule"],
    ["旧 Next 卡点 start,服务端已是 Paused", "Paused", "start"],
    ["旧 Doing 卡点 complete,服务端已回 Next", "Next", "complete"],
  ])("%s → 拒绝,零 mutation", async (_name, serverStatus, action) => {
    mockTodos(makeTodo("PVTI_1", "真实标题", serverStatus));
    const res = await handleCardCallback(ENV, cbBody({ action, itemId: "PVTI_1" }));
    expect((res as any).toast.type).toBe("error");
    expect((res as any).toast.content).toContain("/today");
    expect(updateItemStatus).not.toHaveBeenCalled();
  });

  it("非法来源时不先触发 WIP 提示(来源校验先于 WIP)", async () => {
    // Doing 已满 3 张,但旧 Backlog 卡点 complete:应报来源非法,而不是 WIP 满
    mockTodos(
      makeTodo("PVTI_1", "真实标题", "Backlog"),
      makeTodo("PVTI_d1", "d1", "Doing"),
      makeTodo("PVTI_d2", "d2", "Doing"),
      makeTodo("PVTI_d3", "d3", "Doing"),
    );
    const res = await handleCardCallback(ENV, cbBody({ action: "complete", itemId: "PVTI_1" }));
    expect((res as any).toast.content).toContain("/today");
    expect((res as any).toast.content).not.toContain("已满");
    expect(updateItemStatus).not.toHaveBeenCalled();
  });
});

describe("9.4 不信任客户端 title", () => {
  it("complete:响应只含服务端标题,忽略客户端伪造标题,mutation 照常", async () => {
    mockTodos(makeTodo("PVTI_1", "真实标题", "Doing"));
    const res = await handleCardCallback(
      ENV,
      cbBody({ action: "complete", itemId: "PVTI_1", title: "伪造标题" }), // 旧卡片可能仍带 title
    );
    const json = asJson(res);
    expect(json).toContain("真实标题");
    expect(json).not.toContain("伪造标题");
    expect(updateItemStatus).toHaveBeenCalledWith(ENV, "PVTI_1", "Done");
  });

  it("乐观更新列表同样只用服务端标题", async () => {
    mockTodos(makeTodo("PVTI_1", "真实标题", "Next"));
    const res = await handleCardCallback(ENV, cbBody({ action: "start", itemId: "PVTI_1", title: "伪造标题" }));
    const json = asJson(res);
    expect(json).toContain("真实标题");
    expect(json).not.toContain("伪造标题");
    expect(updateItemStatus).toHaveBeenCalledTimes(1);
  });
});

describe("9.5 WIP(来源校验通过后才检查)", () => {
  it("Next → Doing 但 Doing 已满 3 张 → WIP 提示,零 mutation", async () => {
    mockTodos(
      makeTodo("PVTI_1", "想开始", "Next"),
      makeTodo("PVTI_d1", "d1", "Doing"),
      makeTodo("PVTI_d2", "d2", "Doing"),
      makeTodo("PVTI_d3", "d3", "Doing"),
    );
    const res = await handleCardCallback(ENV, cbBody({ action: "start", itemId: "PVTI_1" }));
    expect((res as any).toast).toEqual({ type: "warning", content: "Doing 已满(3/3)" });
    expect(asJson(res)).toContain("已满");
    expect(updateItemStatus).not.toHaveBeenCalled();
  });

  it("Doing 只有 2 张 → 允许开始", async () => {
    mockTodos(
      makeTodo("PVTI_1", "想开始", "Next"),
      makeTodo("PVTI_d1", "d1", "Doing"),
      makeTodo("PVTI_d2", "d2", "Doing"),
    );
    const res = await handleCardCallback(ENV, cbBody({ action: "start", itemId: "PVTI_1" }));
    expect(updateItemStatus).toHaveBeenCalledTimes(1);
    expect(updateItemStatus).toHaveBeenCalledWith(ENV, "PVTI_1", "Doing");
    expect((res as any).toast.type).toBe("success");
  });
});

describe("9.6 complete 专项", () => {
  it("complete 也先调用 fetchTodos(不再跳过)", async () => {
    mockTodos(makeTodo("PVTI_1", "真实标题", "Doing"));
    await handleCardCallback(ENV, cbBody({ action: "complete", itemId: "PVTI_1" }));
    expect(fetchTodos).toHaveBeenCalledTimes(1);
  });

  it("当前 Doing → Done 庆祝卡(服务端标题 + 奖励文案)", async () => {
    mockTodos(makeTodo("PVTI_1", "真实标题", "Doing"));
    const res = await handleCardCallback(ENV, cbBody({ action: "complete", itemId: "PVTI_1" }));
    const json = asJson(res);
    expect((res as any).toast).toEqual({ type: "success", content: "已完成" });
    expect(json).toContain("真实标题");
    expect(json).toContain("Done");
    expect(json).toContain("REWARD_STUB");
  });

  it.each(["Backlog", "Next", "Paused"])("非 Doing(%s)点 complete → 拒绝,零 mutation", async (status) => {
    mockTodos(makeTodo("PVTI_1", "真实标题", status));
    const res = await handleCardCallback(ENV, cbBody({ action: "complete", itemId: "PVTI_1" }));
    expect((res as any).toast.type).toBe("error");
    expect((res as any).toast.content).toContain("/today");
    expect(updateItemStatus).not.toHaveBeenCalled();
  });

  it("IO 异常 → error toast(错误脱敏保持原样透传 message,不在本 PR 改)", async () => {
    vi.mocked(fetchTodos).mockRejectedValue(new Error("boom"));
    const res = await handleCardCallback(ENV, cbBody({ action: "start", itemId: "PVTI_1" }));
    expect((res as any).toast).toEqual({ type: "error", content: "boom" });
    expect(updateItemStatus).not.toHaveBeenCalled();
  });
});
