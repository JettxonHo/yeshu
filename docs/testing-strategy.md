# 测试策略

## 目标

测试服务于真实回归风险，不为极低概率 case 机械堆用例。单元测试锁定纯逻辑和外部边界；真实外部系统只在人工批准的隔离/生产验证中使用。

## PR 必需门禁

```bash
cd worker
npm ci
npm run check

cd ..
python3 --version   # 必须 >= 3.11
python3 -m pip install -r requirements.txt
python3 -m unittest discover -s scripts -p 'test_*.py'
python3 -m py_compile scripts/*.py
git diff --check
```

`npm run check` 包含生产依赖 audit、typecheck、Vitest、build。CI 使用 Node 20 与 Python 3.11。

## 分层

1. 单元/契约测试:状态机、卡片、幂等、Tablestore SDK 运行时形状、HTTP 超时/重试/脱敏、Worker 与 Python Actions GraphQL 分页。
2. 应用路由测试:Hono request 覆盖 challenge、token、消息、回调和 fail-closed；不触生产。
3. CI 构建检查:所有指向 main 的 PR 跑 worker/python jobs。
4. 人工 E2E:从 main 部署后执行 GET、challenge、错误 token、`/add`、`/today`、按钮流转；截图存 `docs/screenshots/`。

## 证据边界

- 测试通过不等于已部署；部署通过不等于行为验证达标。
- mock/SDK contract 不替代 Tablestore 实表行为验证。
- GitHub Actions schedule success 只证明工作流成功，不证明用户打开推送。
- 缺截图时可以声明工程/生产验证完成，但不能声明完整 Phase DoD 完成。

## 分页切片验收

- mock 至少两页；第二页 `after` 等于第一页 `endCursor`。
- query 必须实际声明并消费 `$after`,同时请求 `pageInfo.hasNextPage/endCursor`;只在 variables 中传 cursor 不算完成分页。
- `hasNextPage=false` 后停止；聚合结果保持现有状态过滤与字段解析。
- Worker query 仍按现有策略有界重试；Python daily-push 保持既有请求与错误语义；mutation 行为不得改变。
- 不要求真实 PAT、FC、Tablestore 或生产数据。
