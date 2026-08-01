import { describe, expect, it } from "vitest";
import {
  BUTTONS,
  LEGAL_SOURCES,
  TRANSITIONS,
  WIP_LIMITS,
  getTransitionTarget,
  isActionName,
  isStateName,
  type ActionName,
  type StateName,
} from "./state";

/**
 * 锁定 V2-a 状态机契约:六状态、八 Action、来源矩阵、BUTTONS 一致性、WIP 上限。
 * 服务端来源校验(PR-B)的核心防线:getTransitionTarget 必须先过这一关再谈 WIP/mutation。
 */

const STATES: StateName[] = ["Backlog", "Next", "Doing", "Paused", "Done", "Abandoned"];
const ACTIONS: ActionName[] = ["schedule", "defer", "start", "complete", "pause", "resume", "demote", "abandon"];

/** 产品定义:每状态允许的 action 集合(§4.2 + Backlog 扩展) */
const LEGAL_MATRIX: Record<StateName, ActionName[]> = {
  Backlog: ["schedule", "abandon"],
  Next: ["start", "defer", "abandon"],
  Doing: ["complete", "pause", "abandon"],
  Paused: ["resume", "demote", "abandon"],
  Done: [],
  Abandoned: [],
};

describe("isStateName / isActionName 守卫", () => {
  it("六个状态合法", () => {
    for (const s of STATES) expect(isStateName(s)).toBe(true);
  });

  it("八个 Action 合法", () => {
    for (const a of ACTIONS) expect(isActionName(a)).toBe(true);
  });

  it("旧状态名 Todo / In Progress 非法(六状态迁移前的值)", () => {
    expect(isStateName("Todo")).toBe(false);
    expect(isStateName("In Progress")).toBe(false);
  });

  it("空串与随机字符串非法", () => {
    expect(isStateName("")).toBe(false);
    expect(isActionName("")).toBe(false);
    expect(isStateName("flying-potato")).toBe(false);
    expect(isActionName("fly")).toBe(false);
  });

  it("原型继承属性不得被识别为合法键(own-property 加固)", () => {
    for (const proto of ["toString", "constructor", "__proto__", "valueOf", "hasOwnProperty"]) {
      expect(isStateName(proto)).toBe(false);
      expect(isActionName(proto)).toBe(false);
    }
  });

  it("原型属性作为 action 时 getTransitionTarget 返回 null", () => {
    expect(getTransitionTarget("Doing", "toString")).toBeNull();
    expect(getTransitionTarget("constructor", "complete")).toBeNull();
    expect(getTransitionTarget("__proto__", "__proto__")).toBeNull();
  });
});

describe("TRANSITIONS 目标状态锁定", () => {
  const EXPECTED_TARGET: Record<ActionName, StateName> = {
    schedule: "Next",
    defer: "Backlog",
    start: "Doing",
    complete: "Done",
    pause: "Paused",
    resume: "Doing",
    demote: "Backlog",
    abandon: "Abandoned",
  };

  for (const a of ACTIONS) {
    it(`${a} → ${EXPECTED_TARGET[a]}`, () => {
      expect(TRANSITIONS[a]).toBe(EXPECTED_TARGET[a]);
    });
  }
});

describe("来源矩阵:6 source × 8 action = 48 组合", () => {
  let covered = 0;
  for (const source of STATES) {
    for (const action of ACTIONS) {
      const legal = LEGAL_MATRIX[source].includes(action);
      const expected = legal ? TRANSITIONS[action] : null;
      it(`${source} + ${action} → ${expected ?? "null(拒绝)"}`, () => {
        covered++;
        expect(getTransitionTarget(source, action)).toBe(expected);
        // LEGAL_SOURCES 与矩阵互为充要
        expect(LEGAL_SOURCES[action].includes(source)).toBe(legal);
      });
    }
  }

  it("确实覆盖了全部 48 个组合", () => {
    expect(covered).toBe(48);
  });

  it("关键非法样例:终态不可复活 / 跨状态按钮无效", () => {
    expect(getTransitionTarget("Done", "pause")).toBeNull();
    expect(getTransitionTarget("Done", "schedule")).toBeNull();
    expect(getTransitionTarget("Abandoned", "resume")).toBeNull();
    expect(getTransitionTarget("Backlog", "complete")).toBeNull();
  });

  it("非法输入(未知状态/未知 action)→ null", () => {
    expect(getTransitionTarget("Todo", "start")).toBeNull();
    expect(getTransitionTarget("Next", "explode")).toBeNull();
    expect(getTransitionTarget("", "")).toBeNull();
  });
});

describe("BUTTONS 与合法矩阵一致性", () => {
  for (const state of STATES) {
    it(`${state}:卡片按钮 action 集合 = 来源矩阵允许的 action 集合`, () => {
      const fromButtons = BUTTONS[state].map((b) => b.action).sort();
      const fromMatrix = LEGAL_MATRIX[state].slice().sort();
      expect(fromButtons).toEqual(fromMatrix);
    });
  }

  it("按钮不重复(同状态内一个 action 只出一个按钮)", () => {
    for (const state of STATES) {
      const actions = BUTTONS[state].map((b) => b.action);
      expect(new Set(actions).size).toBe(actions.length);
    }
  });

  it("每个合法 action 的目标仍等于 TRANSITIONS[action]", () => {
    for (const state of STATES) {
      for (const action of LEGAL_MATRIX[state]) {
        expect(getTransitionTarget(state, action)).toBe(TRANSITIONS[action]);
      }
    }
  });

  it("终态 Done/Abandoned 无任何按钮", () => {
    expect(BUTTONS.Done).toEqual([]);
    expect(BUTTONS.Abandoned).toEqual([]);
  });
});

describe("WIP 上限", () => {
  it("Doing 3 / Next 5 / Paused 5", () => {
    expect(WIP_LIMITS.Doing).toBe(3);
    expect(WIP_LIMITS.Next).toBe(5);
    expect(WIP_LIMITS.Paused).toBe(5);
  });

  it("其余状态无上限", () => {
    expect(WIP_LIMITS.Backlog).toBeUndefined();
    expect(WIP_LIMITS.Done).toBeUndefined();
    expect(WIP_LIMITS.Abandoned).toBeUndefined();
  });
});
