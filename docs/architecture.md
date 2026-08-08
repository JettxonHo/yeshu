# 当前架构

> 本文记录实际工程结构，不重复 Product-Spec.md 的产品决策。

## 数据流

```text
飞书事件 ──> 阿里云 FC / Hono
               ├─ challenge / token 校验
               ├─ /add ──> 幂等 claim ──> GitHub ProjectV2 mutation ──> 飞书卡片
               ├─ /today ──> GitHub ProjectV2 query ──> 飞书卡片
               └─ 按钮 ──> 幂等 claim ──> 服务端状态校验 ──> mutation ──> 就地更新卡片

GitHub Actions 08:00 ──> Python 拉 ProjectV2 ──> 构卡 ──> 飞书主动推送

Tablestore ──> 只保存 message_id/event_id claim；当前生产尚未启用
```

## 运行边界

- `worker/src/app.ts` 是平台无关 HTTP 应用；`fc.ts` 是生产入口，`index.ts` 是本地入口。
- 生产入口强制 Tablestore；Memory store 仅用于本地单进程和测试。
- GitHub Projects V2 是任务/状态真相源；飞书云文档是未来内容真相源；Worker 不保存用户内容。
- 实时 Worker 与每日 Python 推送目前共享业务概念但不共享实现，重写不是当前 Goal。

## 外部调用策略

- GitHub query 可以对 timeout/network/可重试 HTTP 状态额外尝试一次。
- GitHub mutation、飞书发卡片、AI 生成不自动重试，避免重复副作用或重复计费。
- 默认单次 HTTP 超时 2 秒，AI 为 5 秒；同一生命周期覆盖响应头与 JSON body。
- 用户只收到稳定友好错误；响应体、GraphQL errors、SDK 原始文本不透传。

## 已知接缝

- `github.ts` 当前对 ProjectV2 connections 使用固定 `first`，需要 cursor 分页。
- `/add` 是“创建 item → 设置 Status”的两步 mutation，不具备跨 API 事务。
- WIP 是“读取 → 检查 → mutation”，单用户低并发下先保留，出现真实越限再设计锁。
- 生产版本不通过健康接口暴露 Git SHA；部署证据仍依赖 main commit、构建记录与人工 smoke test。
