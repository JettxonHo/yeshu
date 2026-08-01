import { afterEach, describe, expect, it, vi } from "vitest";
import { REWARD_POOLS, rollReward } from "./reward";

/**
 * 锁定 reward.ts:rollReward 永远返回文案池中的非空字符串。
 * 不做统计概率测试;用 Math.random mock 精确命中四个分布区间,验证各区间归属。
 */

const ALL_REWARDS: string[] = Object.values(REWARD_POOLS).flat();

afterEach(() => {
  vi.restoreAllMocks();
});

describe("REWARD_POOLS 文案池", () => {
  it("四个池均非空,且文案互不重复", () => {
    expect(REWARD_POOLS.serious.length).toBeGreaterThan(0);
    expect(REWARD_POOLS.abstract.length).toBeGreaterThan(0);
    expect(REWARD_POOLS.chuunibyou.length).toBeGreaterThan(0);
    expect(REWARD_POOLS.easter.length).toBeGreaterThan(0);
    expect(new Set(ALL_REWARDS).size).toBe(ALL_REWARDS.length);
  });
});

describe("rollReward", () => {
  it("真实调用始终返回非空字符串且属于文案池", () => {
    for (let i = 0; i < 50; i++) {
      const text = rollReward();
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
      expect(ALL_REWARDS).toContain(text);
    }
  });

  // r = Math.random()*100;r<30 serious / <80 abstract / <95 chuunibyou / else easter。
  // mock 值同时决定区间与池内下标(floor(mock*len)),断言只做"归属池"。
  it.each([
    ["serious", 0.1],
    ["abstract", 0.5],
    ["chuunibyou", 0.9],
    ["easter", 0.99],
  ] as const)("r=%s 区间(mock=%d)命中对应池", (poolName, mockValue) => {
    vi.spyOn(Math, "random").mockReturnValue(mockValue);
    const text = rollReward();
    expect((REWARD_POOLS[poolName] as readonly string[])).toContain(text);
  });

  it("边界:r=30 落入 abstract(非 serious),r=80 落入 chuunibyou", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3); // r=30,!(r<30) → abstract
    expect(REWARD_POOLS.abstract as readonly string[]).toContain(rollReward());
    vi.spyOn(Math, "random").mockReturnValue(0.8); // r=80 → chuunibyou
    expect(REWARD_POOLS.chuunibyou as readonly string[]).toContain(rollReward());
  });
});
