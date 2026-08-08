# 野薯当前 Goal · Reliability Hardening

> 建立:2026-08-08
>
> 状态:ACTIVE
>
> Goal-ID:Codex task `019fd4e9-0624-7580-a012-7921d1dc1c1f`
>
> 产品边界:[Product-Spec.md](Product-Spec.md)
>
> 当前事实:[docs/STATUS.md](docs/STATUS.md)

## 1. 执行摘要

项目已具备 V1-a、V1-b、V2-a 的工程能力，生产 Worker 仍停在 V2-a 部署基线。当前 Goal 只做有现实触发路径的可靠性收口，不扩张 V2-b 或后续产品功能。

## 2. 当前状态

- Engineering:`main@65d1a4c` 已含持久化幂等核心与外部 HTTP 边界修复；治理文档在 `codex/project-governance` 待 PR。
- Production:仍运行 `eb20515c`；幂等后端未启用。
- Validation:V0/V1/V2 行为门槛仍 collecting；截图 DoD 未闭环。

## 3. 仓库与 GitHub 快照

- 仓库:`JettxonHo/yeshu`，public，默认分支 `main`。
- 2026-08-08 调查时开放 Issue=0、开放 PR=0、Milestone=0；历史 8 个 PR 均已合并。
- CI workflow 存在且历史运行成功，但 GitHub API 返回 `main` 未启用 Branch Protection，因此 required checks 尚未由平台强制。
- 当前本地分支:`codex/project-governance`；`docs/audits/` 是未跟踪用户材料，不纳入自动提交。

## 4. 产品范围

以 Product-Spec §14 的阶段门槛为边界。当前不实现 Stuck/P0、周三体检、写作系统、应用主页、段位或 AI 教练。

## 5. 用户与利益相关者

- 核心用户与产品决策者:仓库所有者，单用户自建部署。
- 运行依赖:飞书、GitHub Projects V2、GitHub Actions、阿里云 FC/Tablestore。
- Agent 只能处理仓库工程；生产资源、凭证和部署由用户批准并执行。

## 6. Goal 与非 Goal

Goal:

1. 合并外部 HTTP 超时、安全重试边界、错误脱敏与 Hono 依赖修复；
2. 补齐 Worker 的 GitHub ProjectV2 cursor 分页，消除 50/100 项截断；
3. 建立可复用的 Goal、Issue、Task Contract、PR、审查与测试记录；
4. 把持久化幂等生产启用整理为可执行的人工任务。

非 Goal:生产部署、读取生产凭证、自动修改 Branch Protection、扩大产品范围、为低概率 case 堆防御、引入哈希/SHA-256。

## 7. 已定与待定决策

已定:GraphQL 分页是下一代码切片；mutation 不自动重试；产品行为门槛与工程门禁分开。待用户决定:是否启用 `main` Branch Protection；何时准备 Tablestore/RAM 并从 main 人工部署。

## 8. 当前架构

详见 [docs/architecture.md](docs/architecture.md)。任务真相源为 GitHub Projects V2；飞书是交互入口；FC Worker 处理实时事件；Actions/Python 处理每日推送。

## 9. 技术栈

TypeScript strict、Hono、Node.js 20、Vitest、esbuild、阿里云 FC 3.0、Tablestore；Python 3.11+ 与 GitHub Actions；GitHub GraphQL；飞书 OpenAPI；OpenAI-compatible AI 抽象。

## 10. 数据模型

核心状态为 Backlog/Next/Doing/Paused/Done/Abandoned；GitHub ProjectV2 item ID 是按钮 mutation 主键；飞书 message_id/event_id 仅用于幂等 claim；Tablestore 只保存短期 claim 元数据，不持有用户内容。

## 11. 模块边界

- `worker/src/app.ts`:Webhook 路由与幂等编排；
- `worker/src/commands/`:用例编排与用户反馈；
- `worker/src/lib/github.ts`:Projects V2 读写；
- `worker/src/lib/http.ts`:外部 HTTP 策略；
- `worker/src/lib/lark.ts`:飞书 token/发卡片；
- `worker/src/lib/atomic-*`、`idempotency.ts`:原子 claim；
- `scripts/` + `daily-push.yml`:每日主动推送。

## 12. 风险与技术债务

按当前价值排序:

1. 生产幂等未启用——现实重复 mutation 风险，但受人工云资源/部署阻塞；
2. Worker GraphQL 无分页——超过 50 项会让 `/today` 漏项、旧卡误拒绝，超过 100 项会让计数失真；
3. `/add` 多步 mutation 可能留下无状态 item——先观察真实发生率，再决定补偿方案；
4. WIP TOCTOU——单用户低并发，暂缓，出现真实越限证据再设计锁；
5. 部署版本/回滚未工具化——保留人工 runbook，暂不自动部署。

## 13. Milestones

- M1 接管基线:HTTP/依赖修复已由 PR #14 合并；治理文档待 PR 入库。
- M2 查询正确性:Worker ProjectV2 cursor 分页经 Luna 实现、主控审查、CI 合并。
- M3 运维就绪:幂等生产任务具备清晰人工前置、验证与回退条件；不代替用户执行。
- M4 Goal 收口:Issues/PR/文档同步，无未解释的工程 blocker；行为验证继续独立收集。

## 14. 首批 Issues

1. [#9 合并外部 HTTP 边界与依赖修复](https://github.com/JettxonHo/yeshu/issues/9)；
2. [#10 固化 Goal 与 Agent/Issue/PR 工作流](https://github.com/JettxonHo/yeshu/issues/10)；
3. [#11 Worker ProjectV2 cursor 分页](https://github.com/JettxonHo/yeshu/issues/11)；
4. [#12 Tablestore 幂等生产启用](https://github.com/JettxonHo/yeshu/issues/12)（人工/外部阻塞）；
5. [#13 `main` Branch Protection 决策](https://github.com/JettxonHo/yeshu/issues/13)（需用户确认）。

## 15. Task Contract

Task Contract 的必填字段与 Result Packet 见 [docs/agent-collaboration.md](docs/agent-collaboration.md)。每个实现任务必须限制允许文件、禁止动作、验收与验证命令；不得用“顺手修复”扩范围。

## 16. 测试策略

详见 [docs/testing-strategy.md](docs/testing-strategy.md)。当前基线:生产依赖 audit=0、typecheck 通过、16 个测试文件/291 项通过、build 通过、Python 3.11 `py_compile` 通过。

## 17. 分支、PR 与合并

详见 [docs/issue-and-pr-workflow.md](docs/issue-and-pr-workflow.md)。不直接 push main；每个 PR 指向单一任务；先审查再合并；生产部署不包含在普通工程 PR 中。

## 18. Agent 分工与模型状态

- 主控逻辑角色:`ORCHESTRATOR_REVIEWER`；负责规划、Issue、Task Contract、验收与合并决策。
- 实现角色:`luna-worker`；配置映射为 `gpt-5.6-luna`/`max`，2026-08-08 已成功执行只读审计。
- 模型状态:`UNVERIFIED_RUNTIME_MODEL`。配置已核验，但运行时未暴露实际模型标识；不使用 Terra 回退。

## 19. 权限与安全

允许仓库内编辑、测试、分支、PR、Issue；禁止读取/输出 `.env`、secret、生产数据，禁止 Agent 部署。Branch Protection、Tablestore/RAM、FC 环境变量与生产部署需要用户确认。安全方案遵循 AGENTS.md 的克制原则。

## 20. 开放问题与下一步

无需阻塞当前工程的问题有两个:是否启用 Branch Protection、何时进行幂等生产启用。主控先推进 M1/M2；到外部动作门槛时停下请求确认。

## Goal 完成标准

- M1/M2 的 PR 均合并且 CI 绿；
- 所有工程 Issue 有明确完成、延期理由或人工 blocker；
- `docs/STATUS.md`、`DEV-PLAN.md` 与 GitHub 状态一致；
- 不声称生产幂等、行为门槛或截图 DoD 已完成，除非有真实证据。
