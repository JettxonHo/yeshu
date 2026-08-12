# 野薯（Yeshu）

飞书 × GitHub Projects V2 的个人任务节拍器：每日推送、`/add`、`/today`、六状态卡片按钮与 WIP 上限。

## 当前状态

项目已进入 V2-b 工程开发，生产仍运行 V2-a，行为验证继续收集。三轴状态见 [docs/STATUS.md](docs/STATUS.md)，当前 Goal 见 [GOAL.md](GOAL.md)。

## 开发入口

1. 读 [Product-Spec.md](Product-Spec.md)、[docs/STATUS.md](docs/STATUS.md)、[DEV-PLAN.md](DEV-PLAN.md)、[AGENTS.md](AGENTS.md)。
2. Worker:`cd worker && npm ci && npm run check`。
3. Python:使用 3.11+ 安装 `requirements.txt`,执行 `python3 -m unittest discover -s scripts -p 'test_*.py'` 与 `python3 -m py_compile scripts/*.py`。

部署只允许从 main 人工执行；不要提交 `.env`，不要读取或输出生产凭证。完整交接见 [docs/HANDOFF.md](docs/HANDOFF.md)。
