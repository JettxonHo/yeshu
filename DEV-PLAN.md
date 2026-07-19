# 野薯(Yeshu)· Development Plan

> **版本**:1.0
> **日期**:2026-07-20
> **状态**:dev-planner 产出,待进 dev-builder
> **维护**:本文档是开发计划真相源(怎么做)。产品决策见 [Product-Spec.md](Product-Spec.md),规范见 [AGENTS.md](AGENTS.md)。本文不重复 spec 内容,只做开发拆解并引用 spec 章节。

---

## 0. 阅读约定

- **Phase 状态标记**:`⬜ 未开始` / `⏳ 进行中` / `⏸ 暂停` / `✅ 完成`(对应 AGENTS.md 协作规则 3)
- **完成门槛**:每个 Phase 必须通过 AGENTS.md「四步走验证」(Code Review / 测试完整性 / 编译验证 / 功能测试)+ Phase 完成定义全勾,才算 ✅
- **铁律**:**不达标不进下一 Phase**(spec §14.1)。Phase 间存在硬依赖,见各 Phase「依赖」字段
- **真相源**:产品功能/规则引用 spec 章节号(如 §5.2 = Product-Spec.md §5.2),开发决策写在本文件

---

## 1. 总览

| Phase | V 阶段 | 目标(一句话) | 依赖 | 估时 | 状态 |
|---|---|---|---|---|---|
| 0 | 初始化 | 项目骨架 + 安全配置 + GitHub 仓库 | — | — | ✅ |
| 1 | **V0** | 每日 08:00 推送今日 P0 的最小闭环(cron + lark-cli) | 0 | 0.5–1 天 + 7 天验证 | ⬜ |
| 2 | V1-a | Worker 骨架 + `/add` 创建 Idea 卡(AI 标题 + Priority 推断) | 1 | 3–5 天 | ⬜ |
| 3 | V1-b | `/today` + 统一卡片构造器(完成 V1 单向闭环) | 2 | 2–3 天 | ⬜ |
| 4 | V2-a | 按钮回调 + 6 状态机 + WIP 检查 | 3 | 5–7 天 | ⬜ |
| 5 | V2-b | Stuck/P0 算法 + 周三体检推送(完成 V2) | 4 | 3–5 天 | ⬜ |
| 6 | V3-a | 飞书云文档写作子系统(`/note` `/draft` `/drafts`) | 5 | 5–7 天 | ⬜ |
| 7 | V3-b | 周日 Review 5 步 + 想法子系统(完成 V3) | 6 | 3–5 天 | ⬜ |
| 8 | V4 | 多维表格看板 + 应用主页 + Variable Reward 4 层 | 7 | 1–2 周 | ⬜ |
| 9 | V5 | AI 教练(周复盘 + 异常诊断 + 输入输出比) | 8 | 长期 | ⬜ |

**拆解依据**:spec §14.1 的 V0–V5 路径是主骨架;V1/V2/V3 工作量大(2 周–2 月),各拆 2 个 Phase 以保证"可独立验收"。**V0 严格收口**(只做定时推送,不碰实时层),契合 spec §14.3 C 方案。

---

## 2. 当前进度

```
📊 项目进度检测
- Product Spec:✅
- DEV-PLAN   :⏳(本文件,刚产出)
- 项目代码   :⬜
当前环节:dev-planner(收尾)→ 下一步:dev-builder · Phase 1(V0)
```

---

## 3. 各 Phase 详细

### Phase 0 · 项目初始化 ✅

- **目标**:建立目录骨架、安全配置、GitHub public 仓库,为所有后续 Phase 提供地基
- **完成标准**(对照 AGENTS.md):
  - [x] 目录骨架:`.github/workflows`、`worker/src/{commands,lib}`、`scripts`、`cards`、`docs/screenshots`(各放 `.gitkeep`)
  - [x] `.gitignore` 含 `.env` / `*.secret` / `node_modules` / `.wrangler` / `__pycache__` 等
  - [x] `.env.example` 模板(`xxx` 占位,四组变量齐)
  - [x] 本地 `.env`(`TODO_FILL` 占位,不进 git)
  - [x] git init + 初始 commit `docs: init Product-Spec and AGENTS`(分支 `main`)
  - [x] GitHub public 仓库 [JettxonHo/yeshu](https://github.com/JettxonHo/yeshu) 已 push
  - [x] `.env` 双重验证:远程 contents 无 `.env` + `check-ignore` 命中
  - [ ] GitHub Push Protection 待手动开启(spec §12.2 第二层保险)
- **涉及文件**:`.gitignore`、`.env.example`、`.env`、6×`.gitkeep`、`AGENTS.md`、`Product-Spec.md`
- **依赖**:无
- **测试证据**:`git status` clean;`check-ignore -v .env` → `.gitignore:1:.env`;远程根目录列表无 `.env`
- **状态**:✅

---

### Phase 1 · V0 每日推送最小闭环 ⬜

- **目标**:实现 spec §14.1 V0 + §14.3 C 方案的最小闭环——GitHub Actions cron 每日北京时间 08:00 触发,拉 GitHub Projects V2 数据,组装飞书卡片,用 lark-cli 推送到自己私聊。**验证"野薯作为外部节拍器"的核心假设**(spec §1.3)是否成立
- **范围严格收口**(spec §14.1 V0 + V0 红线):
  - ✅ 做:cron 触发 + 拉数据 + 组卡片 + lark-cli 推送
  - ❌ 不做:Worker / 命令处理(`/add` `/today`)/ 按钮回调 / 状态切换 / AI / 写作子系统(均 V1+)
- **完成标准**:
  - [ ] `.github/workflows/daily-push.yml`:cron `0 0 * * *`(UTC)= 北京 08:00(spec §11.4)
  - [ ] `scripts/fetch_data.py`:GraphQL 拉 Projects V2 卡片(Status/Priority/Type/字段,spec §4.3)
  - [ ] `scripts/build_card.py`:组装飞书卡片 JSON,展示今日 P0(最多 3 张,spec §7.2),套 §10.2 统一模板
  - [ ] `scripts/push_lark.py`:用 lark-cli 推送到 `LARK_OPEN_ID`(V0 推给自己,spec §2.1)
  - [ ] `.env.example` 已含 V0 所需变量(GitHub + 飞书),`GITHUB_PROJECT_NUMBER` 等可填
  - [ ] 四步走验证全过
  - [ ] 截图存 `docs/screenshots/daily-push.png`
  - [ ] **成功标准(spec §14.1 V0):连续 7 天打开推送**
- **涉及文件**:`.github/workflows/daily-push.yml`、`scripts/fetch_data.py`、`scripts/build_card.py`、`scripts/push_lark.py`、`cards/daily-push.example.json`、`.env.example`(复核)
- **依赖**:Phase 0
- **测试**:
  - 本地:`act -W .github/workflows/daily-push.yml` 或手动串联三个 Python 脚本
  - 端到端:飞书私聊收到今日 P0 卡片
  - 静态:`python -m py_compile scripts/*.py`
- **工作量**:开发 0.5–1 天;部署 ~30 分钟(spec §14.1);使用验证 7 天
- **状态**:⬜

---

### Phase 2 · V1-a · Worker 骨架 + `/add` 命令 ⬜

- **目标**:搭起 Cloudflare Worker(Hono)实时响应层,实现 spec §6.2 `/add`——飞书消息 → webhook → 签名校验 → 创建 Idea 卡(§4.3 字段 + §6.3 Priority 推断 Layer 1 关键词 + AI 生成标题当超 20 字)。V1 单向闭环的 Worker 侧(spec §14.3 C 方案)
- **完成标准**:
  - [ ] `worker/src/index.ts`:Hono 入口 + 路由
  - [ ] `worker/src/lib/verify.ts`:飞书签名校验(作为中间件复用,AGENTS.md FAQ)
  - [ ] `worker/src/lib/github.ts`:GraphQL 封装(createProjectV2Item + 查询)
  - [ ] `worker/src/lib/ai.ts`:OpenAI 兼容抽象(spec §11.5)+ 标题生成
  - [ ] `worker/src/commands/add.ts`:`/add` 处理 + Priority 关键词推断(§6.3 Layer 1)
  - [ ] `worker/wrangler.toml` + `worker/tsconfig.json`(`"strict": true`,AGENTS.md 铁律 3)
  - [ ] `.github/workflows/deploy-worker.yml`:push 自动部署
  - [ ] 响应 < 2 秒(spec §11.6 场景 2)
  - [ ] 四步走验证(`wrangler dev` + curl 模拟 webhook + `tsc --noEmit`)
- **涉及文件**:`worker/src/{index.ts, commands/add.ts, lib/{verify,github,ai,cards}.ts}`、`worker/wrangler.toml`、`worker/tsconfig.json`、`.github/workflows/deploy-worker.yml`
- **依赖**:Phase 1
- **测试**:`wrangler dev` + curl 模拟飞书 `/add` webhook;`tsc --noEmit`
- **工作量**:3–5 天
- **状态**:⬜

---

### Phase 3 · V1-b · `/today` + 统一卡片构造器 ⬜

- **目标**:实现 spec §7 `/today`(今日 P0 + Stuck)+ 完善 `cards.ts` 统一卡片模板(§10.2)。**完成 V1 单向闭环**
- **完成标准**:
  - [ ] `worker/src/commands/today.ts`:`/today` 命令
  - [ ] `worker/src/lib/cards.ts` 扩展为完整统一模板(头部→分组→任务项→divider→底部→签名 `—— 野薯`)
  - [ ] 展示今日 P0(最多 3,§7.2)+ Stuck 最高分 1 张(§7.3)
  - [ ] 四步走验证
  - [ ] **V1 成功标准(spec §14.1):14 天 `/add` ≥ 10 张 Idea**(与 Phase 2 合并验证)
- **涉及文件**:`worker/src/commands/today.ts`、`worker/src/lib/cards.ts`
- **依赖**:Phase 2
- **测试**:`wrangler dev` + curl `/today`;飞书收到今日卡片
- **工作量**:2–3 天
- **状态**:⬜

---

### Phase 4 · V2-a · 按钮回调 + 状态机 ⬜

- **目标**:实现 spec §4.1 状态机 + §4.2 按钮设计——卡片按钮触发状态转换(开始/完成/暂停/改天/放弃/恢复),WIP 检查(§5.1)。V2 双向闭环核心
- **完成标准**:
  - [ ] 按钮 callback 处理器(action handler)
  - [ ] 6 状态机转换精确实现(§4.1:Backlog/Next/Doing/Paused/Done/Abandoned)
  - [ ] 按钮按当前状态显示(§4.2)
  - [ ] WIP 上限检查(Doing 3 / Next 5,§5.1)触发友好降级 UI
  - [ ] 卡片 in-place 更新(spec §7.2)
  - [ ] Variable Reward Layer 1 搞怪文案(§10.4,完成 P0 时)
  - [ ] 响应 < 1 秒(spec §11.6 场景 3)
  - [ ] 四步走验证
- **涉及文件**:`worker/src/commands/callback.ts`(或拆多文件)、`worker/src/lib/{github,cards}.ts`(状态 mutation + 按钮渲染扩展)
- **依赖**:Phase 3
- **测试**:`wrangler dev` + curl 模拟 callback;飞书点按钮卡片更新
- **工作量**:5–7 天
- **状态**:⬜

---

### Phase 5 · V2-b · Stuck/P0 算法 + 周三体检 ⬜

- **目标**:实现 spec §5 业务规则全量——Stuck 机制(§5.2)、P0 完整机制(§5.3)、延期 P0(§5.4)、周三 20:00 体检推送(§2.2 + §11.4)。**完成 V2**
- **完成标准**:
  - [ ] `scripts/analyze.py`:Stuck Score(卡住天数 × Priority 权重,§5.2)+ 每日推最高分 1 张 + >100 分紧急推送
  - [ ] P0 选择算法(§5.3:延期 P0 优先 → 本周新 P0 → >3 强制 review)
  - [ ] `.github/workflows/wednesday-check.yml`:cron `0 12 * * 3`(UTC)= 周三北京 20:00
  - [ ] 体检推送(进度 + Doing 3 天没动提醒)
  - [ ] 四步走验证
  - [ ] **V2 成功标准(spec §14.1):66 天按钮完成 ≥ 30 次**(与 Phase 4 合并,跨期累积)
- **涉及文件**:`scripts/analyze.py`、`.github/workflows/wednesday-check.yml`、`scripts/build_card.py`(体检卡)
- **依赖**:Phase 4
- **测试**:`act` 跑 wednesday-check;构造 Stuck 测试数据
- **工作量**:3–5 天
- **状态**:⬜

---

### Phase 6 · V3-a · 飞书云文档写作子系统 ⬜

- **目标**:实现 spec §8 写作子系统——飞书云文档为唯一写作入口,lark-cli 创建/拉元数据,`/note` `/draft` `/drafts` 命令,草稿进度监控(§8.4)。V3 内容闭环核心
- **完成标准**:
  - [ ] `worker/src/lib/lark.ts`:lark-cli 封装(创建云文档 / 拉字数 / 修改时间)
  - [ ] `worker/src/commands/{note,draft,drafts}.ts`
  - [ ] 云文档目录结构(§8.3:Anchor Root / 我的笔记 / drafts / published / templates / reviews)
  - [ ] 草稿目标字数机制(§8.4:显式 `/draft 标题 2000` 或 Effort 推断)
  - [ ] 卡片↔文档映射(§8.5,Show 必须关联)
  - [ ] 每日 cron 拉草稿元数据 + 3 天没改提醒 / 7 天进 Stuck
  - [ ] 四步走验证
  - [ ] **V3 成功标准(spec §14.1):首篇 Show 发布**
- **涉及文件**:`worker/src/lib/lark.ts`、`worker/src/commands/{note,draft,drafts}.ts`、`scripts/fetch_data.py`(扩展拉草稿)
- **依赖**:Phase 5
- **测试**:`lark-cli ... --dry-run`;飞书收到草稿进度卡
- **工作量**:5–7 天
- **状态**:⬜

---

### Phase 7 · V3-b · 周日 Review 5 步 + 想法子系统 ⬜

- **目标**:实现 spec §5.6 周日 Review 5 步 + §9 想法子系统(`/ideas` 三组分组 + 升级)+ §5.4 延期强制 review + §2.3 失败恢复。**完成 V3**
- **完成标准**:
  - [ ] `.github/workflows/weekly-review.yml`:cron `0 12 * * 0`(UTC)= 周日北京 20:00
  - [ ] Review 5 步卡片(Step1 清 Stuck → Step5 更新 Showcase,§5.6)
  - [ ] `/ideas` 智能视图(§9.1:最近 7 天 / 30+ 天未动 / 推荐升级)
  - [ ] `/promote` 升级(§9.3)+ Tag 系统(§9.4 固定 Taxonomy)
  - [ ] 延期 P0 强制 review(§5.4:≥3 张)+ 慢性延期质问
  - [ ] 周一补推 + 错过补做 ABC(§2.3)
  - [ ] 四步走验证
- **涉及文件**:`.github/workflows/weekly-review.yml`、`scripts/{analyze,build_card}.py`、`worker/src/commands/{ideas,promote,tags}.ts`、`cards/`(review 模板)
- **依赖**:Phase 6
- **测试**:`act` 跑 weekly-review;review 5 步卡片正确
- **工作量**:3–5 天
- **状态**:⬜

---

### Phase 8 · V4 · 应用形态 ⬜

- **目标**:实现 spec §14.1 V4——多维表格看板 + 应用主页 + Variable Reward 完整 4 层(§10.4 段位/成就/彩蛋)+ §10.5 动效(canvas-confetti)。从 bot 升级为应用
- **完成标准**:
  - [ ] 多维表格看板(状态机可视化)
  - [ ] 应用主页
  - [ ] Variable Reward 4 层完整(文案/段位/成就/彩蛋 1%)
  - [ ] canvas-confetti 彩蛋撒花(MVP 动效,§10.5)
  - [ ] 暗色默认 + 亮色切换(§10.1 配色)
  - [ ] 四步走验证
  - [ ] **V4 成功标准(spec §14.1):自己每天用**
- **涉及文件**:多维表格配置、应用主页代码、`worker/src/lib/reward.ts`、`cards/`(段位/成就卡)
- **依赖**:Phase 7
- **测试**:应用主页可访问;段位/成就触发
- **工作量**:1–2 周
- **状态**:⬜

---

### Phase 9 · V5 · AI 教练 ⬜

- **目标**:实现 spec §14.1 V5——AI 周复盘 + 异常诊断 + 输入输出比监控(§5.5)。长期演进
- **完成标准**:
  - [ ] AI 周复盘(自动生成 `reviews/` 云文档)
  - [ ] 输入输出比监控(§5.5:周实时 / 月趋势,3:1 警告 / 5:1 危险)
  - [ ] 异常诊断(Stuck 慢性 / 延期模式识别)
  - [ ] 四步走验证
  - [ ] **V5 成功标准(spec §14.1):4 周 AI 复盘 + 输入输出比 < 3:1**
- **涉及文件**:`scripts/analyze.py`(AI 复盘)、`worker/src/lib/ai.ts`(扩展)、`cards/`(复盘卡)
- **依赖**:Phase 8
- **测试**:AI 复盘云文档生成;比例告警
- **工作量**:长期
- **状态**:⬜

---

## 4. 跨 Phase 约定(所有 Phase 共用,不重复写)

- **提交规范**:`<type>: <description>`,type ∈ feat/fix/docs/refactor/test/chore(AGENTS.md §提交规范)
- **四步走验证**:每个 Phase 完成前必过——Code Review / 测试完整性 / 编译验证(`tsc --noEmit` + `py_compile`)/ 功能测试(截图存 `docs/screenshots/`)(AGENTS.md §测试要求)
- **状态同步**:每个 Phase 完成后,回本文件把状态改 ✅,并勾选该 Phase 的完成标准 checkbox(AGENTS.md 协作规则 3)
- **铁律**:不硬编码 secret、.env 不进 git、TS 严格、Python 类型注解、外部 API 必须 try-catch、spec 变更先更文档(AGENTS.md §铁律)
- **联网优先**:涉及外部库/API/框架版本,先搜索确认再动手,不凭记忆(AGENTS.md 铁律 7)

---

## 5. 风险与回退

| 风险 | 影响 | 缓解 |
|---|---|---|
| Classic Token 泄漏 | 仓库 public,后果严重 | spec §12 三层保险:.gitignore + Push Protection + pre-commit hook;泄漏 5 分钟应急预案(spec §12.3) |
| lark-cli 版本/接口变化 | 推送/云文档操作失败 | 铁律 7 联网优先,开发前查 lark-cli 最新文档;dry-run 先行 |
| GitHub Projects V2 GraphQL schema 变动 | 拉数据失败 | GraphQL Explorer 调试(AGENTS.md §调试);mutation 改动有 try-catch |
| Stuck/P0 算法误判 | 推送内容不准 | Phase 5 用构造数据测试;V0 先不做复杂算法,只做最小 P0 选择 |
| Fine-grained Token 陷阱 | 无法访问 Projects V2 | 只用 Classic Token(AGENTS.md FAQ) |

---

## 6. 下一步

按 AGENTS.md §项目状态检测,当前路由到 **dev-builder · Phase 1(V0)**。Phase 1 范围严格收口(见上),从 `.github/workflows/daily-push.yml` 起步。

*DEV-PLAN 结束。所有执行以此为据,产品决策以 Product-Spec.md 为据。*
