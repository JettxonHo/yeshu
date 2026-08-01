# 野薯项目状态

> 快照时间:2026-08-02。本页是项目当前状态的**唯一事实页**:其他文档(DEV-PLAN / AGENTS / HANDOFF)引用本页,不复制状态。

## 三轴状态

| 阶段 | Engineering | Production | Validation |
|---|---|---|---|
| V1-a 每日推送 | merged | active | collecting |
| V1-b Worker | merged | deployed | collecting |
| V2-a 交互状态机 | merged / CI green | deployed and verified | collecting |
| Reliability Hardening | planned / next | partial | not applicable |
| V2-b | paused | not deployed | not started |

三轴含义:

- **Engineering**:代码与工程门禁(测试 / CI / 合并状态);
- **Production**:线上实际运行的版本;
- **Validation**:产品行为验证(spec §14.1 门槛)的数据收集状态。

## 关键事实

1. V2-a 的工程合并 commit 与当前生产部署基线为 `eb20515c6db0b2c5cee1db85e45bfc2c24055f77`(PR #2 Squash Merge,2026-08-01T19:24:58Z 合并;对应 main CI run `30714704443` worker / python 双绿)。该 SHA 表示当前生产 Worker 的构建来源,不作为长期固定的 main tip。当前 main tip 以 GitHub `main` 分支为准;后续纯文档或未部署的代码 commit 不会自动改变生产 FC 版本。
2. PR #2 已 MERGED;feat/v2a-interactive、fix/v2a-state-guard、chore/v2a-finalize 分支保留,清理另行任务。
3. V2-a 已具备:
   - CI(worker / python 双 Job,base = main 的 PR 自动触发,required checks);
   - 168 项测试(state 76 / callback 36 / cards 19 / reward 7 / verify 9 / env 6 / app routing 15);
   - 服务端来源状态校验(拒绝过期卡片与终态复活、不信任客户端 title、来源校验先于 WIP)。
4. 生产 FC 已运行**从 main@eb20515c 构建的版本**(2026-08-01T20:41:11Z 人工部署)。生产部署由干净的 main@eb20515c 构建,部署产物 Hash 与本次部署记录一致;FC 未通过 HTTP 直接暴露 Git SHA,部署证据链为「main commit + 产物 SHA-256 + 人工部署日志 + FC 更新时间 + 生产功能验证」,详见 `docs/deployments/2026-08-02-v2a.md`。
5. 服务端来源状态校验(PR-B)**已确认进入生产**:2026-08-02 飞书原生验证中,旧卡片重复「排期」被服务端拒绝,状态未二次变更。
6. 标准部署流程(已实践一次,后续沿用):
   1. 从 main 构建(`cd worker && npm ci && npm run build`,Node 版本与 FC runtime / CI 对齐);
   2. 人工部署(凭证只在本地,不经 agent、不经 CI);
   3. 核对部署产物指纹与 main tip;
   4. curl smoke test(GET / 200 + challenge 原样回显 + 错误 token fail-closed);
   5. 飞书原生测试(/add 建卡、/today 分组卡、按钮全流转、旧卡片拒绝)。
7. **行为验证与工程门槛分离**:工程达标(CI / 测试 / 审查)只决定是否允许合并;产品阶段晋级由行为数据决定(66 天按钮完成 ≥ 30 次,spec §14.1),二者不互相替代。行为数据仍 collecting。
8. 当前下一项是 **Reliability Hardening**,不是应用主页、段位成就或前端美化。V2-a 生产验证已经完成,但行为验证仍在 collecting;当前不启动新的产品功能。

## 剩余可靠性工作(Reliability Hardening 清单)

- `event_id` 幂等:飞书超时重试可导致重复建卡 / 重复状态转换(需 event_id 存储,如 Tablestore);
- GraphQL 分页:现 `first: 50`,任务更多时活跃列表可能被截断,表现为回调误拒绝并提示 /today;
- WIP 并发保护:当前检查与写入非原子(TOCTOU),并发可越过上限;
- 外部 API timeout / retry:GitHub GraphQL 与飞书发消息均无超时与重试策略;
- 错误脱敏:当前错误 message 直透用户 toast,未做脱敏;
- 部署版本与回滚:记录部署 SHA、保留上一稳定版本、明确回滚步骤。2026-08-02 部署前已建立并校验代码包与配置快照,完成本地持久化和恢复步骤记录;本次未实际执行回滚演练,流程尚未工具化,FC 侧亦无版本 / 别名机制;
- daily-push TypeScript 化:Python 推送脚本与 Worker 两套状态 / 卡片逻辑,收敛方案待评估;
- Encrypt Key 评估:现用 Verification Token 明文校验,是否升级飞书签名 + 事件加密待决策。

本清单由本文件统一追踪;各文档只引用本节,不复制。
