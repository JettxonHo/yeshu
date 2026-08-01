import { describe, expect, it } from "vitest";
import type { Todo } from "../types";
import { buildAddedCard, buildTodoCard, interactiveMessage } from "./cards";

/**
 * 锁定 cards.ts 当前行为(V1-b 简化卡片:header + div 列表 + 签名,无按钮)。
 * 断言关键结构而非完整快照,文案微调不应造成大面积失败。
 * V2-a 的分组/按钮/WIP 卡片测试待 PR #2 代码进入基线后补充。
 */

function divTexts(card: Record<string, unknown>): string[] {
  const els = (card.elements ?? []) as Array<{ tag: string; text?: { content?: string } }>;
  return els.filter((e) => e.tag === "div").map((e) => e.text?.content ?? "");
}

function noteTexts(card: Record<string, unknown>): string[] {
  const els = (card.elements ?? []) as Array<{ tag: string; elements?: Array<{ content?: string }> }>;
  return els
    .filter((e) => e.tag === "note")
    .flatMap((e) => (e.elements ?? []).map((n) => n.content ?? ""));
}

function headerOf(card: Record<string, unknown>): { content: string; template: string } {
  const h = card.header as { title: { content: string }; template: string };
  return { content: h.title.content, template: h.template };
}

describe("buildTodoCard", () => {
  it("空待办:默认标题「今日待办」+ 空状态提示,无任务条目", () => {
    const card = buildTodoCard([]);
    expect(headerOf(card).content).toBe("今日待办");
    expect(headerOf(card).template).toBe("orange");
    expect(card.config).toEqual({ wide_screen: true });

    const texts = divTexts(card);
    expect(texts.some((t) => t.includes("今天没有待办"))).toBe(true);
    expect(texts.some((t) => t.startsWith("• "))).toBe(false);
  });

  it("非空待办:逐条展示标题,不出现空状态提示", () => {
    const todos: Todo[] = [
      { title: "写测试", status: "Doing" },
      { title: "修 bug", status: "Next" },
    ];
    const texts = divTexts(buildTodoCard(todos));
    expect(texts).toContain("• 写测试");
    expect(texts).toContain("• 修 bug");
    expect(texts.some((t) => t.includes("今天没有待办"))).toBe(false);
  });

  it("自定义标题覆盖默认值", () => {
    expect(headerOf(buildTodoCard([], "野薯待办")).content).toBe("野薯待办");
  });

  it("基础结构:elements 末尾为 hr + note 签名「—— 野薯」", () => {
    const els = buildTodoCard([]).elements as Array<{ tag: string }>;
    expect(els[els.length - 2]?.tag).toBe("hr");
    expect(els[els.length - 1]?.tag).toBe("note");
    expect(noteTexts(buildTodoCard([]))).toContain("—— 野薯");
  });
});

describe("buildAddedCard", () => {
  it("成功反馈:绿色 header + 任务标题 + 签名", () => {
    const card = buildAddedCard("新任务 A");
    expect(headerOf(card).content).toBe("✅ 已加入待办");
    expect(headerOf(card).template).toBe("green");
    expect(divTexts(card)).toContain("新任务 A");
    expect(noteTexts(card)).toContain("—— 野薯");
  });
});

describe("interactiveMessage", () => {
  it("包装为飞书 interactive 消息体", () => {
    const card = buildTodoCard([]);
    expect(interactiveMessage(card)).toEqual({ msg_type: "interactive", card });
  });
});
