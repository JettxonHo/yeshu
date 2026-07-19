# AGENTS.md · 野薯(Yeshu)项目规范

> 本文件是项目级 AI agent 配置,所有 agent(Claude / Codex / Cursor / Windsurf / Cline 等)必读。
> 本文件优先级仅次于 Product-Spec.md。任何 agent 接手项目前,先读这份。

---

## 项目简介

**野薯**(Yeshu)是 ENFP 个人管理飞书应用。任务数据在 GitHub Projects V2,内容数据在飞书云文档,通过 GitHub Actions + Cloudflare Worker 桥接。

**详细 spec 见 `Product-Spec.md`(单一真相源)**。本文件只管开发规范,不重复产品决策。

---

## 技术栈

| 组件 | 技术 |
|---|---|
| Worker | TypeScript + Hono(Cloudflare Worker) |
| Actions 脚本 | Python 3.11+ |
| 飞书操作 | lark-cli(npm 安装) |
| AI | OpenAI 兼容 API(MVP 用 DeepSeek,可切换) |
| 数据源 | GitHub Projects V2(GraphQL)、飞书云文档 |

---

## 目录结构

```
yeshu/
├── .github/workflows/     # GitHub Actions cron 触发
│   ├── daily-push.yml     # 每日 08:00 推送
│   ├── wednesday-check.yml# 周三 20:00 体检
│   ├── weekly-review.yml  # 周日 20:00 review
│   └── deploy-worker.yml  # push 自动部署 Worker
├── worker/                # Cloudflare Worker(TypeScript + Hono)
│   ├── src/
│   │   ├── index.ts       # Hono 入口
│   │   ├── commands/      # 命令处理(/add /today 等)
│   │   └── lib/
│   │       ├── github.ts  # GraphQL 封装
│   │       ├── lark.ts    # lark-cli 封装
│   │       ├── ai.ts      # AI 抽象层(OpenAI 兼容)
│   │       ├── cards.ts   # 飞书卡片 JSON 构造器
│   │       └── verify.ts  # 飞书签名校验
│   └── wrangler.toml      # Cloudflare 配置
├── scripts/               # Python 脚本(Actions 跑)
│   ├── fetch_data.py      # 拉数据
│   ├── analyze.py         # 聚合分析
│   ├── build_card.py      # 组装卡片 JSON
│   └── push_lark.py       # 推飞书
├── cards/                 # 卡片模板 JSON
├── docs/
│   └── screenshots/       # 关键交互截图(Phase 验证用)
├── Product-Spec.md        # 产品 spec(单一真相源)
├── DEV-PLAN.md            # 开发计划(dev-planner 产出)
├── AGENTS.md              # 本文件
├── .env.example           # 环境变量模板(可 commit)
└── .gitignore             # 必含 .env
```

---

## 开发规范

### 铁律(违反就出事)

1. **不硬编码 secret**:所有 key/secret/token 从环境变量读,代码里只有 `os.environ.get('XXX')` 或 `env.XXX`
2. **.env 不进 git**:.gitignore 必含 `.env` / `.env.local` / `*.secret`
3. **TypeScript 严格模式**:worker/ 的 tsconfig.json 开启 `"strict": true`
4. **Python 类型注解**:scripts/ 所有函数加 type hints(`def foo(x: str) -> int:`)
5. **错误处理**:所有外部 API 调用(飞书、GraphQL、AI)必须有 try-catch,失败时返回友好错误,不抛裸异常
6. **单一真相源**:Product-Spec.md 是产品决策的唯一来源,代码不偏离 spec。spec 变更先更文档再改代码

### 代码风格

| 语言 | 缩进 | 引号 | 格式化 | 命名 |
|---|---|---|---|---|
| TypeScript | 2 空格 | 双引号 | prettier | camelCase 变量 / PascalCase 类型 |
| Python | 4 空格 | 双引号 | black | snake_case 函数变量 / PascalCase 类 |

**文件命名**:kebab-case(`daily-push.yml`、`fetch-data.py`)

### 提交规范

格式:`<type>: <description>`

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | 修 bug |
| `docs` | 文档变更 |
| `refactor` | 重构(不改功能) |
| `test` | 加测试 |
| `chore` | 杂项(依赖更新等) |

例子:`feat: add /today command to worker`

---

## 环境变量(.env.example)

```env
# GitHub
GITHUB_TOKEN=ghp_xxx              # Classic Token,scope: project + repo
GITHUB_LOGIN=JettxonHo            # 你的用户名
GITHUB_PROJECT_NUMBER=1           # Projects V2 编号

# 飞书
LARK_APP_ID=cli_xxx
LARK_APP_SECRET=xxx
LARK_OPEN_ID=ou_xxx               # 私聊推送(V0,推给自己)
# LARK_CHAT_ID=oc_xxx             # 群推送(V1+,推到朋友群)

# AI(OpenAI 兼容,可切换 provider)
AI_PROVIDER=deepseek              # deepseek / claude / openai
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
AI_API_KEY=sk-xxx

# Cloudflare(部署 Worker 时用)
CLOUDFLARE_ACCOUNT_ID=xxx
CLOUDFLARE_API_TOKEN=xxx
```

**铁律**:.env.example 是模板,值用 `xxx` 占位。真实的 .env 不 commit。

---

## 测试要求

每个 Phase 完成前必须通过:

### 1. Worker 本地测试
```bash
cd worker
wrangler dev                      # 本地跑 Worker
# 用 curl 模拟飞书 webhook,测试至少 3 个命令
```

### 2. Actions 本地测试
```bash
# 用 act 本地跑 GitHub Actions
act -W .github/workflows/daily-push.yml
# 或者 push 到 GitHub 后手动触发
```

### 3. 端到端测试
- 飞书收到正确推送
- 按钮回调正常(点 [✅ 完成],卡片 in-place 更新)
- /add 命令在飞书聊天里能创建卡片
- 截图存 `docs/screenshots/`

### 4. 静态检查
- `tsc --noEmit`(TypeScript 无报错)
- `python -m py_compile scripts/*.py`(Python 无语法错)
- `pre-commit run --all-files`(如果装了 pre-commit hook)

---

## Phase 完成定义(Definition of Done)

每个 Phase 算完成,必须全部 ✅:

- [ ] 代码实现了 Product-Spec.md 对应功能
- [ ] 本地测试通过(Worker + Actions)
- [ ] 端到端测试通过(飞书收到正确消息)
- [ ] 无 TypeScript / Python 报错
- [ ] 提交信息符合规范(`<type>: <description>`)
- [ ] DEV-PLAN.md 更新该 Phase 状态为 ✅
- [ ] 关键交互截图存 `docs/screenshots/`

**未全部满足,不算完成,不进下一 Phase。**

---

## 多 Agent 协作约定

本项目可能由不同 AI agent 协作开发。**所有上下文在文档里,不在任何 agent 的对话历史里**。换 agent 不丢上下文。

### 文档职责

| 文档 | 职责 | 谁写 | 谁读 |
|---|---|---|---|
| **Product-Spec.md** | 产品决策(做什么) | 产品讨论 | 所有 agent |
| **DEV-PLAN.md** | 开发计划(怎么做) | dev-planner | 所有 agent |
| **AGENTS.md** | 项目规范(怎么写) | 本文件 | 所有 agent |
| **代码注释** | 实现细节(为什么这么写) | dev-builder | 审查 agent |

### 协作规则

1. **所有产品决策记录在 Product-Spec.md**,不在对话里
2. **所有开发决策记录在 DEV-PLAN.md**,不在对话里
3. **每个 Phase 完成后更新 DEV-PLAN.md 的状态**(✅ 完成 / ⏳ 进行中 / ⏸ 暂停)
4. **代码审查发现问题**,直接在 PR/commit 评论,不修改 Product-Spec.md
5. **spec 变更必须先更 Product-Spec.md,再改代码**(单一真相源原则)
6. **换 agent 时**,新 agent 必须先读 Product-Spec.md + DEV-PLAN.md + AGENTS.md,再动手

### 常见协作场景

**场景 1 · Claude 写 + Codex 审**:
```
Claude Code 写代码(based on DEV-PLAN.md)
→ git push
→ Codex 读 Product-Spec.md + DEV-PLAN.md + 代码,输出审查报告
→ Claude Code 根据审查报告修复
→ 再次 push,Codex 复审
→ 通过 → 更新 DEV-PLAN.md → 进下一 Phase
```

**场景 2 · Cursor 接手中途项目**:
```
Cursor 打开项目
→ 读 AGENTS.md(本文件)了解规范
→ 读 Product-Spec.md 了解产品
→ 读 DEV-PLAN.md 了解进度(哪些 Phase 完成,哪些没)
→ 读代码了解实现
→ 继续未完成的 Phase
```

**场景 3 · 多人贡献(Pull Request)**:
```
贡献者 fork 仓库
→ 读 AGENTS.md + Product-Spec.md
→ 按 DEV-PLAN.md 找未完成的 Phase
→ 写代码 + 测试
→ 提 PR
→ 审查(人工或 Codex)
→ 合并
```

---

## 调试技巧

### Worker 本地调试
```bash
cd worker
wrangler dev --local
# 用 ngrok 暴露本地端口给飞书调试
ngrok http 8787
# 把 ngrok URL 填到飞书事件订阅(临时)
```

### GraphQL 查询调试
```bash
# 在 GitHub GraphQL Explorer 里测试查询
# https://docs.github.com/en/graphql/overview/explorer
```

### lark-cli 调试
```bash
lark-cli auth status               # 检查登录
lark-cli im +messages-send --dry-run --text "test"  # 干跑模式
```

---

## 常见问题

**Q: 为什么用 Classic Token,不用 Fine-grained?**
A: Fine-grained PAT 不支持用户级 Projects V2(GitHub 已知缺陷)。Classic Token 的 `project` scope 直接可用。

**Q: 为什么 Worker 用 Hono?**
A: Cloudflare 官方推荐的路由库,中间件方便(签名校验作为中间件复用),TypeScript 原生支持。

**Q: 为什么 Actions 用 Python,不用 Node.js?**
A: 数据处理强(GraphQL 客户端 + Jinja2 模板),适合批量分析。Worker 已经是 TypeScript,两套系统职责不同,用各自最合适的工具。

**Q: 切换 AI provider 怎么做?**
A: 改 wrangler.toml 的 `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` 三个环境变量,代码不动。所有 provider 都支持 OpenAI 兼容 API。

**Q: 为什么仓库从 V0 就 public?**
A: 强制做好 .env 管理(public 仓库安全要求更高),早期吸引反馈,不用纠结"什么时候开源"。.gitignore + GitHub Push Protection + pre-commit hook 三层保险足够。

---

## 更新本文件

AGENTS.md 应该随项目演进更新:
- 新增约定 → 加到对应章节
- 发现常见问题 → 加到 FAQ
- 工具链变化 → 更新技术栈

**更新时机**:每个 Phase 完成时,review AGENTS.md 是否需要更新。

---

*本文件确保任何 AI agent 接手项目都能无缝继续。文档是单一真相源,对话不是。*
