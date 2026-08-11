# 野薯项目状态

> 快照时间:2026-08-12。本页是项目当前状态的**唯一事实页**:其他文档(DEV-PLAN / AGENTS / HANDOFF / GOAL)引用本页,不复制状态。

## 三轴状态

| 阶段 | Engineering | Production | Validation |
|---|---|---|---|
| V1-a 每日推送 | merged | active | collecting |
| V1-b Worker | merged | deployed | collecting |
| V2-a 交互状态机 | merged / CI green | deployed and verified | collecting |
| Reliability Continuation | complete on `main@89b3da6` | 幂等后端尚未启用 | not applicable |
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
8. 当前 Reliability Continuation 自动化工程 Goal 已完成。下一步是由用户决定幂等生产启用与 Branch Protection;不是应用主页、段位成就或前端美化。V2-a 行为验证仍在 collecting,当前不启动新的产品功能。
9. 持久化幂等核心的工程基线 commit 为 `422e32c39943e8a38f9b95a4385ca57e414eb0d1`:Tablestore 适配器、配置校验和 264 项测试已合并,但 Tablestore 资源准备、生产配置与从 main 部署尚未执行。因此生产仍运行 `eb20515c` 的 V2-a 基线,不能声称幂等已在线生效;当前 main tip 应实时查询 GitHub 分支,不在本文固定。
10. 2026-08-06 接手审计发现 Hono `<4.12.34` 新披露的 moderate CORS ReDoS 漏洞;PR #14 已把最低版本提升至官方修复下限并解析到 `4.13.0`,2026-08-08 以 squash commit `65d1a4c` 合并 main,`npm audit` 为 0,CI worker/python 双绿。
11. **Phase DoD 证据缺口**:`docs/screenshots/` 当前只有 `.gitkeep`,没有 V0/V1/V2 关键交互截图。V2-a 可以确认“工程合并 + 生产功能验证完成”,但不能声称 AGENTS.md 定义的完整 Phase DoD 已闭环;截图与行为门槛都待用户侧真实证据补齐。
12. 2026-08-08 GitHub API 核验:`main` 尚未启用 Branch Protection。CI workflow 与历史 worker/python 绿灯真实存在,但“required checks”目前是项目流程要求,不是平台强制规则;是否启用保护需用户确认。
13. 当前接管 Goal 与任务边界见 [GOAL.md](../GOAL.md)。PR #14/#15/#16/#18/#20 已合并;Python 分页代码合并基线为 `main@89b3da6`,17 个 Worker 测试文件 / 293 项与 4 项 Python unittest 通过、生产依赖 audit 0、typecheck/build/Python 3.11 py_compile 与远程 CI 全绿。后续纯文档提交不改变该代码基线;这些合并也未触发生产部署,生产仍运行 `eb20515c`。
14. Issue #19 / PR #20 已完成 Python daily-push 独立正确性切片:`scripts/fetch_data.py` 使用 `after` + `pageInfo.hasNextPage/endCursor` 遍历 ProjectV2 items,PR 于 2026-08-12 squash merge 为 `89b3da6`;Issue #19 已关闭。

## 剩余可靠性工作(Reliability Hardening 清单)

- `event_id` / `message_id` 幂等:**工程核心已完成**(`main@422e32c`),待人工准备 Tablestore / 最小权限 RAM 身份、隔离环境实测、从 main 部署与生产重投验证;未部署前线上仍可能重复建卡 / 重复状态转换;
- GraphQL 分页:**已完成**;Worker `fetchTodos` / `countItemsByStatus` 由 PR #16 完成,Python 每日推送由 PR #20 完成,均使用 cursor 分页并通过 CI;
- WIP 并发保护:当前检查与写入非原子(TOCTOU),但项目为单用户且暂无真实并发越限证据;按克制原则暂缓,出现现实触发证据再设计锁;
- 外部 API timeout / retry:**本次接手切片已实现并完成本地门禁**:默认 2 秒 HTTP 超时(AI 生成请求为 5 秒),且覆盖响应头与 JSON body;只有 GitHub query 对 timeout / network / 408 / 425 / 429 / 5xx 做一次有界重试;GitHub mutation、飞书发卡片、AI 请求不自动重试;
- 错误脱敏:**本次接手切片已实现并完成本地门禁**:外部响应体 / GraphQL errors 不进入异常或用户卡片/toast,日志仅保留服务名、错误类别、HTTP 状态等结构化字段;飞书 HTTP 200 非零业务码会清 token 缓存,下一次用户操作重新取 token;
- 部署版本与回滚:记录部署 SHA、保留上一稳定版本、明确回滚步骤。2026-08-02 部署前已建立并校验代码包与配置快照,完成本地持久化和恢复步骤记录;本次未实际执行回滚演练,流程尚未工具化,FC 侧亦无版本 / 别名机制;
- daily-push TypeScript 化:Python 推送脚本与 Worker 两套状态 / 卡片逻辑,但现有 workflow 连续运行成功;先修正确性,语言重写暂缓;
- Encrypt Key 评估:现用 Verification Token fail-closed,暂无攻击/多租户证据;不引入哈希/SHA-256,威胁模型变化时再评估签名与事件加密。

本清单由本文件统一追踪;各文档只引用本节,不复制。
