import { describe, expect, it } from "vitest";
import type { Todo } from "../types";
import { BUTTONS, type StateName } from "./state";
import { buildAddedCard, buildItemCard, buildTodoCard, buildWipFullCard, interactiveMessage } from "./cards";

/**
 * V2-a 卡片契约(替代 PR-A 的 V1-b 断言):
 * 状态分组(Doing→Next→Paused→Backlog)、状态按钮、按钮 value 仅 {action,itemId}(不携带 title)、
 * 放弃确认弹窗、metadata 标签、单项庆祝卡、WIP 拦截卡。
 * 断言关键结构而非完整快照,文案微调不应造成大面积失败。
 */

type El = Record<string, any>;

function els(card: Record<string, unknown>): El[] {
  return (card.elements ?? []) as El[];
}

function divTexts(card: Record<string, unknown>): string[] {
  return els(card)
    .filter((e) => e.tag === "div")
    .map((e) => e.text?.content ?? "");
}

function headerOf(card: Record<string, unknown>): { content: string; template: string } {
  const h = card.header as { title: { content: string }; template: string };
  return { content: h.title.content, template: h.template };
}

/** 卡片内全部按钮(action 行展平) */
function buttons(card: Record<string, unknown>): El[] {
  return els(card)
    .filter((e) => e.tag === "action")
    .flatMap((e) => (e.actions ?? []) as El[]);
}

function todo(itemId: string, title: string, status: StateName, extra?: Partial<Todo>): Todo {
  return { itemId, title, status, ...extra };
}

describe("buildTodoCard · 空列表", () => {
  it("合法卡片:header 含「今日待办」,orange 模板,空态提示,无按钮", () => {
    const card = buildTodoCard([]);
    expect(headerOf(card).content).toContain("今日待办");
    expect(headerOf(card).template).toBe("orange");
    expect(card.config).toEqual({ wide_screen: true });

    const texts = divTexts(card);
    expect(texts.some((t) => t.includes("今天没有待办"))).toBe(true);
    expect(buttons(card)).toEqual([]);
  });
});

describe("buildTodoCard · 多状态分组", () => {
  const todos: Todo[] = [
    todo("PVTI_b1", "收信箱整理", "Backlog"),
    todo("PVTI_d1", "写 CI 门禁", "Doing"),
    todo("PVTI_n1", "迁移测试", "Next"),
    todo("PVTI_p1", "重构回调", "Paused"),
    todo("PVTI_d2", "修热修", "Doing"),
  ];

  it("header 总数正确", () => {
    expect(headerOf(buildTodoCard(todos)).content).toBe("🥔 今日待办 · 5");
  });

  it("分组顺序固定:Doing → Next → Paused → Backlog", () => {
    // 组标题形如 **🔥 Doing · 2**(概览条不以 ** 结尾,借此区分)
    const groupHeads = divTexts(buildTodoCard(todos)).filter((t) => /^\*\*.+ · \d+\*\*$/.test(t));
    const order = groupHeads.map((t) => (/🔥/.test(t) ? "Doing" : /👉/.test(t) ? "Next" : /⏸️/.test(t) ? "Paused" : "Backlog"));
    expect(order).toEqual(["Doing", "Next", "Paused", "Backlog"]);
  });

  it("各组数量与标题正确出现", () => {
    const texts = divTexts(buildTodoCard(todos));
    expect(texts.some((t) => t.includes("Doing · 2"))).toBe(true);
    expect(texts.some((t) => t.includes("Next · 1"))).toBe(true);
    expect(texts.some((t) => t.includes("Paused · 1"))).toBe(true);
    expect(texts.some((t) => t.includes("Backlog · 1"))).toBe(true);
    for (const t of todos) {
      expect(texts.some((d) => d.includes(t.title))).toBe(true);
    }
    expect(texts.some((t) => t.includes("今天没有待办"))).toBe(false);
  });
});

describe("buildTodoCard · 按钮", () => {
  const cases: StateName[] = ["Backlog", "Next", "Doing", "Paused"];

  it.each(cases)("%s 组展示且仅展示 BUTTONS 定义的按钮", (status) => {
    const card = buildTodoCard([todo("PVTI_x", "一张任务", status)]);
    const labels = buttons(card).map((b) => b.text?.content);
    expect(labels).toEqual(BUTTONS[status].map((b) => b.label));
  });

  it("按钮 value 只含 action + itemId,绝不携带 title(PR-B)", () => {
    const card = buildTodoCard([todo("PVTI_42", "敏感标题", "Next")]);
    const btns = buttons(card);
    expect(btns.length).toBeGreaterThan(0);
    for (const b of btns) {
      expect(Object.keys(b.value).sort()).toEqual(["action", "itemId"]);
      expect(b.value.itemId).toBe("PVTI_42");
      expect(b.value).not.toHaveProperty("title");
    }
    const actions = btns.map((b) => b.value.action).sort();
    expect(actions).toEqual(BUTTONS.Next.map((b) => b.action).sort());
  });

  it("终态 Done/Abandoned 不进 /today 卡片(无按钮来源)", () => {
    // buildTodoCard 只渲染四个活跃状态;终态 item 即便误入也不产生按钮
    const card = buildTodoCard([
      { itemId: "PVTI_done", title: "已完成", status: "Done" } as Todo,
      { itemId: "PVTI_ab", title: "已放弃", status: "Abandoned" } as Todo,
    ]);
    expect(buttons(card)).toEqual([]);
    expect(headerOf(card).content).toContain("今日待办");
  });
});

describe("buildTodoCard · 放弃确认", () => {
  it("abandon 按钮带确认弹窗;其它按钮不带", () => {
    const card = buildTodoCard([todo("PVTI_1", "待放弃", "Doing")]);
    const btns = buttons(card);
    const abandon = btns.find((b) => b.value.action === "abandon");
    const others = btns.filter((b) => b.value.action !== "abandon");
    expect(abandon?.confirm).toBeDefined();
    expect(abandon?.confirm?.text?.content).toContain("待放弃");
    for (const b of others) expect(b.confirm).toBeUndefined();
  });
});

describe("buildTodoCard · metadata", () => {
  it("Type/Effort/Priority 有值时显示", () => {
    const card = buildTodoCard([todo("PVTI_m", "带属性", "Next", { type: "Bug", effort: "M", priority: "P0" })]);
    const line = divTexts(card).find((t) => t.includes("带属性"));
    expect(line).toContain("Bug");
    expect(line).toContain("M");
    expect(line).toContain("P0");
  });

  it("缺失时不得出现 undefined/null/多余分隔符", () => {
    const card = buildTodoCard([todo("PVTI_plain", "朴素任务", "Backlog")]);
    for (const t of divTexts(card)) {
      expect(t).not.toContain("undefined");
      expect(t).not.toContain("null");
    }
    const line = divTexts(card).find((t) => t.includes("朴素任务"));
    expect(line).toBe("**朴素任务**"); // 无 meta 尾缀,无「 · 」残片
  });

  it("未知枚举值(不在 emoji 表)不显示", () => {
    const card = buildTodoCard([todo("PVTI_u", "怪属性", "Next", { type: "Alien", effort: "?", priority: "P9" })]);
    const line = divTexts(card).find((t) => t.includes("怪属性"));
    expect(line).toBe("**怪属性**");
  });
});

describe("buildItemCard · 单项卡(完成庆祝卡)", () => {
  it("Done 卡片:使用服务端标题,无 action,奖励文案出现", () => {
    const card = buildItemCard({ itemId: "PVTI_9", title: "服务端真实标题", status: "Done" }, "🎉 奖励文案XYZ");
    expect(headerOf(card).content).toContain("服务端真实标题");
    expect(headerOf(card).template).toBe("green");
    expect(buttons(card)).toEqual([]);
    const texts = divTexts(card);
    expect(texts.some((t) => t.includes("Done"))).toBe(true);
    expect(texts.some((t) => t.includes("奖励文案XYZ"))).toBe(true);
  });

  it("未知状态回退 Backlog(渲染不崩溃)", () => {
    const card = buildItemCard({ itemId: "PVTI_8", title: "X", status: "Weird" });
    expect(headerOf(card).content).toContain("X");
  });
});

describe("buildWipFullCard", () => {
  it("显示目标状态与上限,且不含可执行按钮", () => {
    const card = buildWipFullCard("Doing", 3);
    expect(headerOf(card).content).toContain("Doing");
    expect(headerOf(card).content).toContain("3/3");
    expect(buttons(card)).toEqual([]);
    expect(divTexts(card).some((t) => t.includes("Doing"))).toBe(true);
  });
});

describe("buildAddedCard / interactiveMessage", () => {
  it("添加反馈:绿色 header「已加入 Backlog」+ 标题", () => {
    const card = buildAddedCard("新任务 A");
    expect(headerOf(card).content).toBe("✅ 已加入 Backlog");
    expect(headerOf(card).template).toBe("green");
    expect(divTexts(card).some((t) => t.includes("新任务 A"))).toBe(true);
  });

  it("包装为飞书 interactive 消息体", () => {
    const card = buildTodoCard([]);
    expect(interactiveMessage(card)).toEqual({ msg_type: "interactive", card });
  });
});
