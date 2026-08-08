# Issue 与 PR 工作流

## Issue

每个 Issue 只描述一个可独立验收的任务，至少包含:

- 背景与用户影响；
- 范围内/范围外；
- 允许文件与禁止动作；
- 验收标准与验证命令；
- 依赖、风险、停止条件；
- Owner、Agent、状态、阻塞原因。

大需求先拆成 Milestone 与多个 Issue。生产操作与仓库代码分开建 Issue。

## 分支与提交

- 从最新 main 建短生命周期分支；Agent 分支用 `codex/` 前缀。
- 提交格式:`<type>: <description>`。
- 不直接 push main，不把用户未跟踪材料顺手加入提交。
- 一个 PR 默认对应一个 Issue；发现额外问题开新 Issue，不扩大当前 diff。

## PR

PR 描述包含关联 Issue、变更摘要、范围外、测试证据、风险与回退。不把“本地通过”写成“已部署”。

合并条件:

1. Task Contract 验收项全部满足；
2. 主控 Review 状态为 `APPROVED`；
3. worker/python CI 全绿；
4. 没有未解决高风险问题；
5. 文档状态同步。

当前 GitHub 尚未强制 Branch Protection，因此主控仍按上述门禁执行；是否开启平台保护需用户确认。
