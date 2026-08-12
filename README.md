# 野薯（Yeshu）

飞书 × GitHub Projects V2 的个人任务节拍器：每日推送、`/add`、`/today`、六状态卡片按钮与 WIP 上限。

## 当前状态

V2-b 硬验收已完成，V3-a 已启动；飞书 Docs 文档创建、读取与正文写入基础已合并，当前切片用官方元数据 API 获取正确文档 URL 与修改时间，`/note` 产品细节仍待确认。生产 Worker 仍运行 V2-a，66 天按钮完成 ≥30 次作为长期指标继续收集但不阻塞 V3。三轴状态见 [docs/STATUS.md](docs/STATUS.md)，当前 Goal 见 [GOAL.md](GOAL.md)。

## 开发入口

1. 读 [Product-Spec.md](Product-Spec.md)、[docs/STATUS.md](docs/STATUS.md)、[DEV-PLAN.md](DEV-PLAN.md)、[AGENTS.md](AGENTS.md)。
2. Worker:`cd worker && npm ci && npm run check`。
3. Python:使用 3.11+ 安装 `requirements.txt`,执行 `python3 -m unittest discover -s scripts -p 'test_*.py'` 与 `python3 -m py_compile scripts/*.py`。

部署只允许从 main 人工执行；不要提交 `.env`，不要读取或输出生产凭证。完整交接见 [docs/HANDOFF.md](docs/HANDOFF.md)。
