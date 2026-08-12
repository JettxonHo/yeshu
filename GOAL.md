# 野薯当前 Goal · V3-a 内容闭环基础

> 建立:2026-08-12
>
> 状态:ACTIVE / FIRST_TASK_CONTRACT_READY
>
> 产品边界:[Product-Spec.md](Product-Spec.md) §8、§14.1
>
> 当前事实:[docs/STATUS.md](docs/STATUS.md)

## 1. 进入决策

用户于 2026-08-12 明确确认提前进入 V3,并批准修改 Product-Spec 的行为门槛:

- V2 硬验收 = 工程合并 + 从 main 完成真实 Actions→飞书 E2E + 脱敏截图;
- “66 天按钮完成 ≥30 次”保留为长期行为指标,继续 collecting,不再阻塞 V3;
- V3 成功标准仍为“首篇 Show 发布”,不降低。

V2 三项硬验收均已完成,因此当前路由切换到 V3-a。

## 2. 当前状态

- Engineering:V2-b PR #24 与证据 PR #28 已合并;V3-a 尚无代码。
- Production:Worker 仍运行 `main@eb20515c` 的 V2-a;V2-b Actions active。
- Validation:66 天/≥30 次仍 unverified;作为长期指标并行观察。
- Contract:[Issue #29 · Feishu Docs OpenAPI foundation](https://github.com/JettxonHo/yeshu/issues/29) 已建立。

## 3. Goal

完成 Product-Spec §8 的内容闭环基础:

1. 用 FC 可运行的飞书 Docs/Drive OpenAPI 适配器替代生产路径中的本地 `lark-cli` 假设;
2. 实现 `/note` 创建笔记云文档;
3. 实现 `/draft` 创建草稿、可选目标字数和 Show↔文档映射;
4. 实现 `/drafts` 进度卡与 3 天/7 天未修改提醒;
5. 通过真实飞书 E2E 完成首篇 Show 发布,达到 V3 成功标准。

## 4. 非 Goal

- V3-b 周日 Review、`/ideas`、`/promote` 与 Tag 系统;
- V4 应用主页、段位成就和动效;
- V5 AI 教练;
- Tablestore 生产启用、Branch Protection 或旧可靠性债务;
- 在单个提交中同时实现文档 API、全部命令、目录迁移与生产权限;
- 哈希/SHA-256、无现实触发路径的防御分支或机械化 rubric。

## 5. 关键决策

1. 内容真相源始终是飞书云文档;Worker 只持有 document ID、关联和进度元数据。
2. 生产 Worker 复用现有 tenant token 访问 Docs/Drive OpenAPI;不调用 shell,不依赖本地登录态。
3. 外部响应只在边界校验实际消费字段;沿用现有超时、错误脱敏和 mutation 不重试规则。
4. V3-a 按小切片推进:Docs 适配器 → `/note` → `/draft`/映射 → `/drafts`/监控 → 真实 E2E。
5. 飞书应用权限、文件夹准备和生产部署是人工前置,不得由 mock/CI 冒充。

## 6. Milestones

- M0 产品与合同:⏳ Product-Spec 门槛修订、V3-a Goal、Milestone #3 与 Issue #29 合并 main;
- M1 Docs API 基础:Issue #29 实现 create document / raw content,独立审查与 CI 全绿;
- M2 `/note`:创建笔记文档并返回可打开卡片;
- M3 `/draft`:创建草稿、目标字数、Show↔文档映射;
- M4 `/drafts`:进度视图与 3 天/7 天提醒;
- M5 产品验收:真实飞书完成首篇 Show 发布并保存截图。

## 7. 当前 Task Contract

- [Issue #29](https://github.com/JettxonHo/yeshu/issues/29) 只允许修改 `worker/src/lib/lark.ts`、`worker/src/lib/external-clients.test.ts`,必要时由主控先修订决策日志。
- 接口:`createDocument(env, input)` 与 `getDocumentRawContent(env, documentId)`。
- 不新增依赖、不运行 lark-cli、不触生产 API、不读取凭据。
- 验收:`npm run check`、mutation-sensitive 合同测试、独立审查、PR CI。
- `docs/audits/` 是用户材料,不读取、不修改、不暂存。

## 8. V3-a 完成标准

- §8 的 `/note`、`/draft`、`/drafts` 与草稿监控实现;
- 工程门禁和独立审查通过;
- 生产权限与文件夹由人工准备,只从 main 部署;
- 真实飞书端到端和关键截图完成;
- 首篇 Show 发布。
