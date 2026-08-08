# Agent 协作约定

## 角色

- `ORCHESTRATOR_REVIEWER`:主控。负责调查、规划、Goal、Issue、Task Contract、Review、CI 与合并决策；不把最终判断外包。
- `luna-worker`:有边界的实现/只读任务。只改允许路径，完成验证后返回 Result Packet。
- 禁止 Terra fallback。Luna 不可用时标记 `STATUS: BLOCKED_LUNA_WORKER_UNAVAILABLE`。

## 模型状态词

只使用:`CONFIG_VERIFIED`、`RUNTIME_VERIFIED`、`UNVERIFIED_RUNTIME_MODEL`、`MODEL_MISMATCH`。配置文件映射正确但运行时未暴露实际模型时，必须用 `UNVERIFIED_RUNTIME_MODEL`。

## Task Contract 模板

```text
Task-ID:
Goal-ID:
Title:
Context:
Allowed paths:
Forbidden paths/actions:
Inputs:
Deliverables:
Acceptance criteria:
Validation:
Dependencies:
Commit policy:
Risk:
Stop conditions:
```

委派必须说明“不是独自在代码库工作，不得覆盖/还原他人改动”。实现任务默认禁止部署、生产数据、secret 与额外 Agent。

## Result Packet 模板

```text
STATUS: DONE | BLOCKED
Summary:
Files changed:
Validation performed:
Risks/assumptions:
Blockers:
Recommended next action:
```

## Review

主控按正确性、测试、范围、兼容性、错误处理、文档一致性与最小复杂度做工程判断。最终状态只用:`APPROVED`、`CHANGES_REQUESTED`、`BLOCKED`、`ESCALATE_TO_HUMAN`。

不以机械 rubric 替代判断；不因旧安全清单存在就添加哈希、罕见 case guard 或无价值测试。
