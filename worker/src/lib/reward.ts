/**
 * Variable Reward Layer 1(spec §10.4):完成 P0/任务时随机搞怪文案。
 * 分布:正经 30% / 抽象 50% / 中二 15% / 彩蛋 5%。
 * (Math.random 在 FC 运行时正常;仅 Workflow 脚本里不可用,这里不受限。)
 */
const REWARDS: Record<string, string[]> = {
  serious: ["又搞定一个,稳。", "执行力在线。", "干得漂亮,继续。", "靠谱,就是这种感觉。"],
  abstract: ["这只薯被打掉了。", "任务,卒。", "它自由了。", "送它上路了,安息。", "薯仔表示很满意。"],
  chuunibyou: ["封印解除!此任已终结。", "吾之刃,已斩此劫。", "宿命之战,胜!"],
  easter: ["🥔 薯仔为你跳了一支舞!", "✨ 撒花!你今天是耶薯战神。"],
};

/** 按分布抽一条文案 */
export function rollReward(): string {
  const r = Math.random() * 100;
  let pool: string[];
  if (r < 30) pool = REWARDS.serious;
  else if (r < 80) pool = REWARDS.abstract;
  else if (r < 95) pool = REWARDS.chuunibyou;
  else pool = REWARDS.easter;
  return pool[Math.floor(Math.random() * pool.length)];
}
