# 野薯项目状态

> 快照时间:2026-08-02。本页是项目当前状态的**唯一事实页**:其他文档(DEV-PLAN / AGENTS / HANDOFF)引用本页,不复制状态。

## 三轴状态

| 阶段 | Engineering | Production | Validation |
|---|---|---|---|
| V1-a 每日推送 | merged | active | collecting |
| V1-b Worker | merged | deployed | collecting |
| V2-a 交互状态机 | PR #2 Draft / CI green | deployed pre-merge version | collecting |
| Reliability Hardening | in progress | partial | not applicable |
| V2-b | paused | not deployed | not started |

三轴含义:

- **Engineering**:代码与工程门禁(测试 / CI / 合并状态);
- **Production**:线上实际运行的版本;
- **Validation**:产品行为验证(spec §14.1 门槛)的数据收集状态。

## 关键事实

1. main 当前是 `dd01ef4`(最近一次合入:PR 门禁基线 + 每日推送六状态热修)。这是 **2026-08-02 收口阶段的快照**(PR #6 合入的是 feature branch,不改变 main);PR #2 合并后,本页的 main SHA 与工程状态**必须人工同步更新**,本页不会自动更新。
2. PR #2(V2-a 交互状态机)当前分支为 feat/v2a-interactive,base = main,state = OPEN / Draft;**实时 head 以 GitHub PR #2 为准**。本次最终收口开始时的审查基线为 `0496ea2`。
3. PR #2 已有:
   - CI(worker / python 双 Job,base = main 的 PR 自动触发,required checks);
   - 168 项测试(state 76 / callback 36 / cards 19 / reward 7 / verify 9 / env 6 / app routing 15;app routing 测试由本次最终收口加入);
   - 服务端来源状态校验(拒绝过期卡片与终态复活、不信任客户端 title、来源校验先于 WIP)。
4. 生产 FC 已运行 V2-a 的**早期版本**(合并前的功能代码)。
5. PR #2 当前分支已包含服务端来源状态校验(PR-B);该修复**尚未通过部署 commit SHA 确认进入生产**——线上版本与该修复是否一致,未经核对,不得假定已部署。
6. **PR #2 合并前,不得从旧 main 部署 Worker**:旧 main 的 `worker/src/lib/github.ts` 仍是 Todo / In Progress 双状态模型,与生产项目的六状态字段不兼容,部署即故障。
7. PR #2 合并后的正确部署流程:
   1. 从 main 构建(`cd worker && npm ci && npm run build`);
   2. 人工部署(凭证只在本地,不经 agent、不经 CI);
   3. 验证部署产物对应的 commit SHA 与 main tip 一致;
   4. curl smoke test(GET / 200 + challenge 原样回显);
   5. 飞书原生测试(/add 建卡、/today 分组卡、按钮全流转)。
8. **行为验证与工程门槛分离**:工程达标(CI / 测试 / 审查)只决定是否允许合并;产品阶段晋级由行为数据决定(66 天按钮完成 ≥ 30 次,spec §14.1),二者不互相替代。
9. 当前下一项是 **Reliability Hardening**,不是应用主页、段位成就或前端美化。

## 剩余可靠性工作(Reliability Hardening 清单)

- `event_id` 幂等:飞书超时重试可导致重复建卡 / 重复状态转换(需 event_id 存储,如 Tablestore);
- GraphQL 分页:现 `first: 50`,任务更多时活跃列表可能被截断,表现为回调误拒绝并提示 /today;
- WIP 并发保护:当前检查与写入非原子(TOCTOU),并发可越过上限;
- 外部 API timeout / retry:GitHub GraphQL 与飞书发消息均无超时与重试策略;
- 错误脱敏:当前错误 message 直透用户 toast,未做脱敏;
- 部署版本与回滚:记录部署 SHA、保留上一稳定版本、明确回滚步骤(目前仅有原则,未工具化);
- daily-push TypeScript 化:Python 推送脚本与 Worker 两套状态 / 卡片逻辑,收敛方案待评估;
- Encrypt Key 评估:现用 Verification Token 明文校验,是否升级飞书签名 + 事件加密待决策。

本清单由本文件统一追踪;各文档只引用本节,不复制。
