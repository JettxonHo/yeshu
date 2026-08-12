# 野薯当前 Goal · V2-b 双向闭环完成

> 建立:2026-08-12
>
> 状态:COMPLETE_ENGINEERING / ACTIONS_E2E_COMPLETE / BEHAVIOR_GATE_PENDING
>
> Goal 模式:V2-b 工程与真实 Actions/飞书端到端已完成；行为门槛仍按事实单独验收
>
> 产品边界:[Product-Spec.md](Product-Spec.md)
>
> 当前事实:[docs/STATUS.md](docs/STATUS.md)

## 1. 执行摘要

在现有 V2-a 按钮与状态机之上，完成 Actions 侧的 P0/Stuck 分析和周三体检推送，使野薯具备 Product-Spec §5.2–5.4、§7.1–7.3 与 §11.4/11.6 定义的 V2-b 工程能力。

用户于 2026-08-12 明确确认进入 V2-b。该确认授权工程启动，不等于 V2 成功标准已经达标；“66 天按钮完成 ≥30 次”、真实飞书端到端验证和关键截图仍是 V2-b 完成条件。

## 2. 当前状态

- Engineering:Issue #23 已关闭，PR #24 已 squash merge 为 `main@4b8c6df`，worker/python CI 双绿。
- Production:仍运行 `eb20515c` 的 V2-a；本 Goal 不部署生产。
- Validation:2026-08-12 已完成 daily / Wednesday 真实飞书空态路径并保存两张脱敏截图；66 天按钮完成 ≥30 次仍 collecting / unverified。

## 3. Goal

1. 扩展 Python ProjectV2 数据契约，提供 P0/Stuck 所需的 Status、Priority 与更新时间；
2. 实现每日 P0 选择、延期识别、Stuck Score、最高分提醒与紧急标记；
3. 把每日推送接入 `fetch → analyze → build → push` 流水线；
4. 新增周三 20:00 体检，展示状态进度与 Doing 三天未更新提醒；
5. 以固定时间单元测试、Python/Worker 门禁、独立审查与 PR CI 证明工程正确性；
6. 准确记录工程、生产、行为验证和截图四者的边界。

## 4. 非 Goal

- 生产 FC 部署、读取凭据或修改生产数据；
- GitHub Project 字段迁移或 mutation；
- V3-b 的交互式周日 Review；
- V3 写作系统、V4 应用主页、V5 AI 教练；
- WIP 原子锁、Python→TypeScript 重写、Encrypt Key、哈希/SHA-256 或低概率防御扩张；
- 把 mock/CI 结果写成真实端到端或行为门槛达标。

## 5. 关键工程决策

1. Stuck 的 Last Updated 使用 GitHub `ProjectV2Item.updatedAt`；
2. 延期 P0 使用 Priority 字段值自身的 `updatedAt` 与 Asia/Shanghai 本周一 00:00 比较，不新增字段；
3. 空 Priority 的 Stuck 权重按最低档 0.5，保持可见但不提高优先级；
4. P0 超限只输出明确的 `review_required` 提醒，不在本切片引入交互 mutation；交互式 Review 保留在 V3-b；
5. 只使用 Python 标准库与既有 `requests`，不新增依赖。

## 6. Milestones

- M1 数据与分析:✅ 完整规范化 item；P0/Stuck/周三分析通过固定时间测试；
- M2 卡片与 workflow:✅ 每日和周三卡片、两个 Actions workflow 契约完成；
- M3 工程门禁:✅ Python 3.11 17 项 unittest/py_compile、Worker 293 项 `npm run check`、diff-check 全绿；
- M4 审查与合并:✅ 独立审查 `APPROVED`，PR #24 worker/python CI 双绿并合并为 `main@4b8c6df`；
- M5 人工验证:⏳ 真实飞书/Actions 推送与截图已完成；行为计数未完成。V2-a 自 2026-08-01 上线,66 天窗口最早于 2026-10-06 结束,且当前没有持久化按钮完成计数证据。

## 7. Task Contract

- 已完成实现任务:[Issue #23 · V2-b Stuck/P0 与周三体检](https://github.com/JettxonHo/yeshu/issues/23)，由 PR #24 合并。
- 实现 Agent 只修改 Issue allowlist；主控拥有 Goal/计划/状态/测试文档。
- `docs/audits/` 是用户材料，不读取、不修改、不暂存。
- 生产幂等与 Branch Protection 继续由 Issues #12/#13 独立追踪，不混入本 Goal。

## 8. 完成标准

工程完成必须满足:

- Issue #23 的行为与测试验收全部通过；
- 独立代码审查结论为 `APPROVED`；
- PR worker/python CI 双绿并合并 main；
- `GOAL.md`、`DEV-PLAN.md`、`docs/STATUS.md` 一致；
- 未部署时明确写“未部署”，缺真实推送/截图/行为计数时明确写“待人工验证”。

V2-b 完整完成还必须满足:

- 从 main 进行真实 Actions/飞书端到端验证；
- 关键交互截图进入 `docs/screenshots/`；
- V2 行为成功标准“66 天按钮完成 ≥30 次”有真实证据。
