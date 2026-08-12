# 决策日志

## 2026-08-12 · V2 长期指标不再阻塞 V3

- 决策:用户明确确认提前进入 V3;将“66 天按钮完成 ≥30 次”从 V3 硬性准入改为长期行为指标。V2 的硬验收改为工程合并、从 main 真实 Actions→飞书 E2E、脱敏截图,三项已完成。
- 理由:66 天是行为观察窗口,不是证明后续内容子系统不可开发的工程依赖。保留指标真实性,同时避免把长期研究周期机械化成 55 天等待锁。
- 代价:进入 V3 时尚不能声称习惯形成指标达标;状态页必须继续写 collecting / unverified。

## 2026-08-12 · V3 生产云文档使用 OpenAPI

- 决策:阿里云 FC 内的 V3 文档操作复用现有飞书应用 tenant token,调用 Docs/Drive OpenAPI;`lark-cli` 只保留给 V0 或本地一次性辅助。
- 理由:FC 没有本地 CLI 登录态;飞书官方 create document、raw content 与 folder API 均支持应用身份。首个 Issue #29 只建立最小模块契约,不同时扩张到命令、目录和生产权限。

## 2026-08-08 · 当前 Goal 只做可靠性收口

- 决策(已被 2026-08-12 阶段准入决策取代):行为门槛未达标前不进入 V2-b，不扩产品功能。
- 理由:Product-Spec §14 明确“不达标不进下一阶段”。

## 2026-08-08 · GraphQL 分页是下一代码切片

- 决策:先修 Worker `ProjectV2.items` cursor 分页，再评估 Python Actions 分页。
- 理由:`first:50/100` 有明确截断路径，会影响 `/today`、旧卡校验与 WIP 计数；可独立测试和提交。

## 2026-08-08 · 暂缓三类旧债务

- WIP 原子锁:单用户低并发，暂无真实越限证据。
- Encrypt Key/签名升级:现有 Verification Token fail-closed，暂无攻击或多租户证据；不新增哈希/SHA-256。
- daily-push TypeScript 重写:当前 Python workflow 连续成功，先修正确性，不做语言重写。

出现真实故障、规模变化或用户明确调整优先级时再重开决策。

## 2026-08-08 · 外部高影响设置需人工确认

- `main` Branch Protection 当前未启用；是否开启由用户决定。
- Tablestore/RAM/FC 环境变量和生产部署由用户批准并执行。
- Agent 不读取生产凭证、不部署、不用 admin bypass。

## 2026-08-08 · Agent 路由

- 主控负责 Goal、Issue、Task Contract、Review 与合并决策。
- 有边界的实现任务使用 `luna-worker`；不回退 Terra。
- 配置与运行时模型证据分开记录；未暴露实际模型时使用 `UNVERIFIED_RUNTIME_MODEL`。
