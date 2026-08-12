# 野薯(Yeshu)· Development Plan

> **版本**:2.1(2026-08-12 修订)
> **本次修订**:用户明确把 66 天/≥30 次改为长期指标;V2-b 硬验收完成,进入 V3-a
> **状态**:Phase 5(V3-a)⏳ Docs create/read merged / text writer Task Contract ready
> **维护**:本文档是开发计划真相源(怎么做)。产品决策见 [Product-Spec.md](Product-Spec.md),规范见 [AGENTS.md](AGENTS.md)。本文件不重复 spec 内容,只做开发拆解并引用 spec 章节。

---

## 0. 阅读约定

- **Phase 状态标记**:`⬜ 未开始` / `⏳ 进行中` / `⏸ 暂停` / `✅ 完成`(对应 AGENTS.md 协作规则 3)
- **完成门槛**:每个 Phase 必须通过 AGENTS.md「四步走验证」(Code Review / 测试完整性 / 编译验证 / 功能测试)+ Phase 完成定义全勾,才算 ✅
- **铁律**:**当前硬验收不达标不进下一 Phase**(spec §14.1)。长期行为指标继续观测但不阻塞;Phase 间依赖见各 Phase「依赖」字段
- **真相源**:产品功能/规则引用 spec 章节号(如 §5.2 = Product-Spec.md §5.2),开发决策写在本文件

---

## 1. 总览

| Phase | V 阶段 | 目标(一句话) | 依赖 | 估时 | 状态 |
|---|---|---|---|---|---|
| 基线 | 初始化 | 项目骨架 + 安全配置 + GitHub 仓库 | — | — | ✅ |
| **0** | **V0** | **零代码 Cowork 行为验证**:每天 08:02 推今日待办,验证"你会看推送" | 基线 | 30 min + 7 天验证 | ⏳ |
| 1 | V1-a | GitHub Actions 推送系统(把 V0 即时代码正式化) | 0 | 3–5 天 | ✅ |
| 2 | V1-b | Worker 实时层(阿里云 FC)+ `/add` + `/today` + 统一卡片构造器(完成 V1) | 1 | 5–7 天 | ✅ |
| 3 | V2-a | 按钮回调 + 6 状态机 + WIP 检查 | 2 | ~1 天 | ⏳(工程/生产验证完成;历史截图证据待补,非 V3 门槛) |
| 4 | V2-b | Stuck/P0 算法 + 周三体检推送(完成 V2) | 3 | 3–5 天 | ✅ |
| 5 | V3-a | 飞书云文档写作子系统(`/note` `/draft` `/drafts`) | 4 | 5–7 天 | ⏳ |
| 6 | V3-b | 周日 Review 5 步 + 想法子系统(完成 V3) | 5 | 3–5 天 | ⬜ |
| 7 | V4 | 多维表格看板 + 应用主页 + Variable Reward 4 层 | 6 | 1–2 周 | ⬜ |
| 8 | V5 | AI 教练(周复盘 + 异常诊断 + 输入输出比) | 7 | 长期 | ⬜ |

**v1.1 关键变更**:
1. **V0 = 零代码行为验证**(Cowork scheduled task + lark-cli,Cowork 定时启动 Claude 会话即时代码)。原 DEV-PLAN v1.0 把 V0 写成"GitHub Actions + Python",那是 V1 的定时推送层,已下移到 Phase 1。
2. **项目初始化移作「基线」**,不占 Phase 编号 → Phase 0 从 V0 起,编号与 spec §14.1 对齐。
3. **`/today` 并入 Phase 2**:它和 `/add` 同属 Worker 命令层、共用 `cards.ts`,合并验收更自然(V1 由 3 Phase 收为 2 Phase)。

---

## 2. 当前进度

```
📊 项目进度检测
- Product Spec:✅(产品决策单一真相源)
- DEV-PLAN   :✅(本文件 v2.1)
- 项目代码   :✅(V2-b hard acceptance complete;V3-a Docs create/read merged)
当前环节:Phase 5 · V3-a 文档正文写入基础
  - Engineering :Issue #29 / PR #32 已合并为 main@90bc964;302 项 Worker 测试与 CI 全绿
  - Production  :线上 FC 仍运行 main@eb20515c 的 V2-a;V2-b Actions active
  - Validation  :66 天/≥30 次作为长期指标 collecting,不阻塞 V3
下一步:Issue #33 实现根 Page Block 正文写入 → 独立审查 → PR CI
```

---

## 3. 各 Phase 详细

### 基线 · 项目初始化 ✅

- **目标**:建立目录骨架、安全配置、GitHub public 仓库,为所有后续 Phase 提供地基
- **完成标准**:
  - [x] 目录骨架:`.github/workflows`、`worker/src/{commands,lib}`、`scripts`、`cards`、`docs/screenshots`(各放 `.gitkeep`)
  - [x] `.gitignore` 含 `.env` / `*.secret` / `node_modules` / `.wrangler` / `__pycache__` 等
  - [x] `.env.example` 模板(`xxx` 占位)、本地 `.env`(`TODO_FILL`,不进 git)
  - [x] git init + 初始 commit + GitHub public 仓库 [JettxonHo/yeshu](https://github.com/JettxonHo/yeshu) 已 push
  - [x] `.env` 双重验证:远程 contents 无 `.env` + `check-ignore` 命中
  - [ ] GitHub Push Protection 待手动开启(spec §12.2)
- **测试证据**:`git status` clean;`check-ignore -v .env` → `.gitignore:1:.env`;远程根目录列表无 `.env`
- **状态**:✅

---

### Phase 0 · V0 · 零代码行为验证 ⬜

- **目标**:用 **Cowork scheduled task + lark-cli,零代码**验证 spec §1.3 核心假设——"野薯作为外部节拍器"能否让你**连续 7 天看推送**。不写任何项目脚本/Worker,Cowork 定时启动 Claude 会话即时代码(spec §14.1)
- **形态**(产品确认):
  1. Cowork `create_scheduled_task`,cron `0 8 * * *`(每天 08:00 本地)
  2. 触发启动 Claude 会话,prompt:"读 GitHub Projects V2 找今日 P0,用 lark-cli 推送到飞书私聊"
  3. Claude 即时用 bash 调 GraphQL 拉 P0 → bash 调 lark-cli 推消息
  4. 零 Python 脚本、零 workflow yaml、零 Worker——Claude 即时代码
- **范围严格收口**:
  - ✅ 做:Cowork 定时任务 + Claude 即时拉数据 + lark-cli 推送
  - ❌ 不做:写 `fetch_data.py`/`build_card.py`/`push_lark.py`(那是 Phase 1)、Worker、`/add`、按钮
- **完成标准**:
  - [ ] Cowork scheduled task 创建(cron `0 8 * * *`)
  - [ ] 触发时 Claude 能拉到 Projects V2 的 P0 卡片
  - [ ] lark-cli 推送到飞书私聊成功
  - [ ] 推送内容含今日 P0(§10.2 模板简化版,Claude 即时构造)
  - [ ] 推送 prompt 留档 `docs/v0-cowork-prompt.md`(便于 Phase 1 复刻逻辑)
  - [ ] 截图存 `docs/screenshots/v0-daily-push.png`
  - [ ] **成功标准(spec §14.1):连续 7 天你每天在飞书收到并打开推送**
- **涉及文件**:**无项目代码**;仅 Cowork task 配置 + prompt(留档 `docs/v0-cowork-prompt.md`)
- **依赖**:基线 + **前置环境**(`.env` 真实值、Projects V2 有 P0 卡、`lark-cli` 已登录)
- **测试**:连续 7 天观察飞书 08:00 是否收到推送;Cowork 任务运行日志可查
- **工作量**:部署 ~30 分钟(spec §14.1);使用验证 7 天
- **实际字段简化**:项目 #1 是 GitHub 默认模板(只有 Status: Todo/In Progress/Done),V0 用 `Status=Todo` 当今日待办;spec §4.3 的 Priority/Type/Effort 字段在 **Phase 2(V1-b `/add`)** 时配置
- **执行证据**:V0 用 Cowork task 验证链路通(GraphQL 拉 3 张待办 + 飞书卡片 `code=0`);**V1-a 达标后 V0 task 已暂停(2026-07-20)**,每日推送交给 GitHub Actions(Phase 1,免费)。7 天行为验证用 Actions 推送继续
- **状态**:⏳ 进行中(7 天观察)

---

### Phase 1 · V1-a · GitHub Actions 推送系统 ⬜

- **目标**:V0 验证通过后,把"Cowork 即时代码推送"升级为**稳定的正式系统**——GitHub Actions cron + Python 脚本。V1 系统建设的定时反馈层(spec §14.3 C 方案 Actions 侧)
- **完成标准**:
  - [ ] `.github/workflows/daily-push.yml`:cron `0 0 * * *`(UTC)= 北京 08:00(spec §11.4)
  - [ ] `scripts/fetch_data.py`:GraphQL 拉 Projects V2 卡片(Status/Priority/Type/字段,§4.3)
  - [ ] `scripts/build_card.py`:组装飞书卡片 JSON,今日 P0 最多 3 张(§7.2),套 §10.2 统一模板
  - [x] `scripts/push_lark.py`:飞书 OpenAPI 推送到 `LARK_OPEN_ID`
  - [ ] 四步走验证全过(Code Review / 测试完整性 / `py_compile` / 端到端)
  - [ ] 截图存 `docs/screenshots/`
- **涉及文件**:`.github/workflows/daily-push.yml`、`scripts/{fetch_data,build_card,push_lark}.py`、`cards/daily-push.example.json`
- **依赖**:Phase 0(V0 验证通过才值得投入建系统)
- **测试**:`act -W .github/workflows/daily-push.yml`;端到端飞书收到推送;`python3 -m py_compile scripts/*.py`(Python ≥ 3.11)
- **工作量**:3–5 天
- **完成(2026-07-20)**:飞书通讯录权限范围配好(管理员)+ `batch_get_id` 拿到本应用 open_id → `push_lark` 通。GitHub Actions run `29712071750`(schedule 自动)**success**,云端链路验证通过。6 个 Secret 齐(`GH_PAT`/`YESHU_LOGIN`/`YESHU_PROJECT_NUMBER`/`LARK_APP_ID`/`LARK_APP_SECRET`/`LARK_OPEN_ID`)
- **状态**:✅ 完成

> 说明:`analyze.py`(Stuck/P0 复杂算法)仍延到 Phase 4(V2-b),V1-a 只做最小 P0 选择,放进 `build_card.py`。

---

### Phase 2 · V1-b · Worker 实时层 + `/add` + `/today` ⬜

- **目标**:搭 Cloudflare Worker(Hono)实时响应层,实现 `/add`(创建 Idea 卡,AI 标题 + Priority 推断)+ `/today`(展示今日 P0 + Stuck)+ 统一卡片构造器 `cards.ts`。**完成 V1 单向闭环**(spec §14.3 第一周目标)
- **完成标准**:
  - [x] `worker/src/app.ts`(平台无关 `createApp`)+ `worker/src/fc.ts`(FC handler 入口,`hono-alibaba-cloud-fc3-adapter`)+ `worker/src/index.ts`(本地 dev,`@hono/node-server`)
  - [x] `worker/src/lib/verify.ts`:Verification Token 校验(Encrypt Key 签名/加密留 V2+)
  - [x] `worker/src/lib/github.ts`:GraphQL 封装(`addProjectV2DraftIssue` + 查询)
  - [x] `worker/src/lib/ai.ts`:OpenAI 兼容抽象(spec §11.5)壳子(V1-b 未接 AI 标题生成,留 V2-b)
  - [x] `worker/src/lib/cards.ts`:统一模板(§10.2)
  - [x] `worker/src/commands/add.ts`:`/add` 创建 DraftIssue(V1-b 简化:无 Priority 推断,留 V2-b)
  - [x] `worker/src/commands/today.ts`:`/today` 展示今日待办(Status ∈ Todo/In Progress,最多 5)
  - [x] `worker/s.yaml`(FC 3.0,Serverless Devs)+ `worker/tsconfig.json`(`"strict": true`)
  - [x] esbuild 打包(`npm run build` → `dist/index.js` 单文件 CJS)+ `s deploy` 手动部署(原 `wrangler.toml` / `.github/workflows/deploy-worker.yml` 已删)
  - [x] `/add` / `/today` 端到端验证(FC 线上 curl + 飞书原生,2026-07-24)
  - [x] 四步走验证(`tsc --noEmit` + esbuild 打包 + FC 线上 curl + 飞书原生 /add /today)
  - [ ] **V1 成功标准(spec §14.1):14 天 `/add` ≥ 10 张 Idea**(行为观察期,2026-07-24 起)
- **涉及文件**:`worker/src/{app.ts, fc.ts, index.ts, env.ts, commands/{add,today}.ts, lib/{verify,github,ai,cards}.ts}`、`worker/s.yaml`、`worker/tsconfig.json`、`worker/package.json`(esbuild + FC3 adapter)
- **依赖**:Phase 1
- **测试**:`tsx` 本地 + curl;esbuild 打包 + `s deploy`;FC 线上 curl(GET / + challenge + /today)+ 飞书原生 /add /today
- **工作量**:5–7 天(Worker + 两命令 + 卡片构造器 + FC 迁移,较大)
- **完成(2026-07-24)**:Cloudflare Worker 迁阿里云 FC 3.0——官方 `hono-alibaba-cloud-fc3-adapter`(handler 模型,nodejs20 运行时)+ esbuild 单文件 CJS 打包。飞书 Webhook 已切到 FC(国内直连无超时;生产 URL 见本地运维记录,不进仓库)。`/today` 卡片 + `/add` GitHub 建卡均端到端验证通过(用户确认)。**注**:`/add` 实测 ~2.7s,接近飞书 3s 上限,偶发重试去重(按 message_id)留 V2+
- **状态**:✅ 完成(V1 行为观察期进行中)

---

### Phase 3 · V2-a · 按钮回调 + 状态机 + WIP ⏳

- **目标**:实现 spec §4.1 状态机 + §4.2 按钮设计——卡片按钮触发状态转换,WIP 检查(§5.1)。V2 双向闭环核心
- **完成标准**:
  - [x] 按钮 callback 处理器(`commands/callback.ts` + app.ts `card.action.trigger` 分支)
  - [x] 6 状态机转换精确实现(§4.1)(`lib/state.ts`:TRANSITIONS + BUTTONS)
  - [x] 按钮按当前状态显示(§4.2)(Backlog 加了 [📅 排期] 闭合交互环)
  - [x] WIP 上限检查(Doing 3 / Next 5 / Paused 5,§5.1)→ ⛔ 拦截卡,不转换
  - [x] 卡片 in-place 更新(§7.2)(Method A:200 响应返回新卡,单往返)
  - [x] Variable Reward Layer 1 搞怪文案(§10.4)(`lib/reward.ts`)
  - [x] 响应 < 1 秒(spec §11.6 场景3):实测回调 ~1.1s
  - [x] 四步走验证:字段配置 ✅ / 本地 curl 全转换 ✅ / FC 部署 ✅ / 飞书原生点按钮 ✅
- **涉及文件**:`worker/src/commands/callback.ts`、`worker/src/lib/{github,cards,state,reward}.ts`;字段迁移已于 2026-07-24 完成,记录见 `docs/migrations/2026-07-24-v2a-fields.md`(一次性脚本已删除,不得重演)
- **依赖**:Phase 2
- **测试**:`npm run dev` + curl 模拟 card.action.trigger;飞书点按钮卡片就地更新
- **工作量**:5–7 天 → 实际 ~1 天
- **状态**:⏳ 工程合并与生产功能验证完成,但 `docs/screenshots/` 缺少本 Phase 历史关键交互截图,不满足 AGENTS.md 的完整 Phase DoD。66 天/≥30 次已改为长期指标并行 collecting,不是 V3 准入门槛;后续可靠性状态以 `docs/STATUS.md` 为准。
- **关键决策**:① GitHub 内建 Status 扩到 6 态(非新建);② 飞书卡片用 **V1 格式**(V2 不支持 `tag:action`,230099);③ 回调返回刷新后的 /today 列表(非单项卡);④ V2-b 行为观察与开发并行

---

### Reliability Hardening · HTTP/依赖切片 ✅

- **目标**:在不启动新产品功能的前提下,先恢复可信依赖基线,再治理 Worker 外部 HTTP 边界。
- **本切片开发决策**:
  1. Hono 最低版本提升到官方安全修复下限 `4.12.34`,lockfile 以门禁实际解析版本为准;
  2. GitHub / 飞书 / AI 请求统一具备显式超时,不再依赖 Node `fetch` 的无限等待;
  3. 只有可安全重放的读取请求允许对网络错误、超时、429、5xx 做一次有界重试;GitHub mutation、飞书发卡片、AI 请求默认不自动重试,避免重复副作用/重复计费;
  4. 外部响应体与 SDK 原始错误不进入用户卡片/toast;用户只见稳定友好文案,诊断日志只保留服务名、错误类别与 HTTP 状态等脱敏字段;
  5. 不新增第三方依赖,使用 Node 20 原生 `fetch` + `AbortController` / `setTimeout`,同一超时生命周期覆盖响应头与 JSON body 读取。
- **完成标准**:
  - [x] Hono 安全门禁恢复,`npm audit --omit=dev --audit-level=moderate` 为 0;
  - [x] 超时、可重试状态、网络错误、mutation 不重试均有单元测试;
  - [x] GitHub / 飞书 / AI 三个客户端接入统一策略;
  - [x] `/add`、`/today`、callback 的用户错误信息不再透传原始外部错误;
  - [x] `npm run check` + Python 3.11+ `py_compile` 全绿;
- **状态**:✅ 已由 PR #14 合并 main(`65d1a4c`),CI worker/python 双绿。生产部署不在本切片范围;只允许从 main 人工部署。

#### Reliability Continuation · Python Actions cursor 分页 ✅

- **目标**:消除 `scripts/fetch_data.py` 的 `items(first:50)` 截断,使每日推送在 ProjectV2 超过 50 张卡片时仍能看到后续页的活跃任务。
- **范围**:只改 Python 拉取、对应标准库单元测试与 Python CI;保持现有活跃状态过滤、最多 5 张输出和错误语义。
- **完成标准**:
  - [x] 使用 `after` + `pageInfo.hasNextPage/endCursor` 遍历所有 ProjectV2 item 页面;
  - [x] 两页 cursor 传递、末页停止、后续页 GraphQL 错误均有单元测试;
  - [x] Python 3.11+ `unittest` / `py_compile`、Worker `npm run check`、独立代码审查与远程 CI 全绿;
  - [x] 通过 PR 合并 main,不部署生产、不修改 Branch Protection。
- **任务**:[Issue #19](https://github.com/JettxonHo/yeshu/issues/19)。
- **状态**:✅ PR #20 已 squash merge 为 `main@89b3da6`;Issue #19 已关闭。生产部署不在本切片范围。

---

### Phase 4 · V2-b · Stuck/P0 算法 + 周三体检 ✅

- **目标**:实现 spec §5 业务规则全量——Stuck 机制(§5.2)、P0 完整机制(§5.3)、延期 P0(§5.4)、周三 20:00 体检推送。**完成 V2**
- **完成标准**:
  - [x] `scripts/analyze.py`:Stuck Score(卡住天数 × Priority 权重,§5.2)+ 每日推最高分 1 张 + >100 分紧急推送
  - [x] P0 选择算法(§5.3:延期 P0 优先)
  - [x] `.github/workflows/wednesday-check.yml`:cron `0 12 * * 3`(UTC)= 周三北京 20:00
  - [x] 体检卡片工程实现(进度 + Doing 3 天没动提醒)
  - [x] 从 main 真实触发 daily/wednesday workflow,确认飞书收到卡片并保存脱敏截图(2026-08-12;runs `31554628778` / `31554630892`;当时数据仅覆盖空 P0 / 无 Stuck / 无 Doing 超时路径)
  - [x] 四步走验证(代码审查 / 293 Worker + 17 Python 测试 / 编译 / 真实飞书截图)
  - [x] **V2 硬验收(spec §14.1,2026-08-12 修订)**:工程合并 + 真实 Actions→飞书 E2E + 脱敏截图
  - [ ] **长期行为指标(不阻塞 V3)**:66 天按钮完成 ≥30 次
- **涉及文件**:`scripts/analyze.py`、`.github/workflows/wednesday-check.yml`、`scripts/build_card.py`(体检卡)
- **本轮实现决策**:
  1. Stuck 的 Last Updated 使用 `ProjectV2Item.updatedAt`;
  2. Priority 字段值的 `updatedAt` 早于 Asia/Shanghai 本周一 00:00 时识别为延期 P0,不新增 Project 字段;
  3. 空 Priority 的 Stuck 权重按最低档 0.5,保持可见但不提高优先级;
  4. P0 超限在本阶段输出 review 提醒;交互式周日 Review/mutation 仍在 Phase 6(V3-b)。
- **依赖**:Phase 3
- **测试**:`act` 跑 wednesday-check;构造 Stuck 测试数据
- **工作量**:3–5 天
- **状态**:✅ Complete under Product-Spec §14.1 revised gate。Issue #23 / PR #24 完成工程,2026-08-12 从 main 完成真实 Actions→飞书 E2E 与两张脱敏截图(PR #28)。66 天/≥30 次继续长期观测,不作为 Phase 5 阻塞项。

---

### Phase 5 · V3-a · 飞书云文档写作子系统 ⏳

- **目标**:实现 spec §8 写作子系统——飞书云文档为唯一写作入口,生产通过 Docs/Drive OpenAPI 创建文档与读取元数据,提供 `/note` `/draft` `/drafts` 命令和草稿进度监控。V3 内容闭环核心
- **完成标准**:
  - [x] `worker/src/lib/lark.ts`:飞书 Docs OpenAPI 创建云文档 / 拉纯文本基础(PR #32)
  - [ ] `worker/src/lib/lark.ts`:根 Page Block 正文写入(Issue #33)
  - [ ] `worker/src/commands/{note,draft,drafts}.ts`
  - [ ] 云文档目录结构(§8.3)
  - [ ] 草稿目标字数机制(§8.4)
  - [ ] 卡片↔文档映射(§8.5,Show 必须)
  - [ ] 每日 cron 拉草稿元数据 + 3 天/7 天提醒
  - [ ] 四步走验证
  - [ ] **V3 成功标准(spec §14.1):首篇 Show 发布**
- **涉及文件**:`worker/src/lib/lark.ts`、`worker/src/commands/{note,draft,drafts}.ts`、`scripts/fetch_data.py`(扩展拉草稿)
- **依赖**:Phase 4
- **测试**:OpenAPI mock 合同 + 人工权限就绪后的飞书云文档 E2E;飞书收到草稿进度卡
- **工作量**:5–7 天
- **状态**:⏳ Goal active。Issue #29 / PR #32 已完成 FC 可用的文档创建与纯文本读取;Issue #33 仅补正文块写入,之后再进入 `/note`。目录配置、命令路由与生产权限仍分开推进。

---

### Phase 6 · V3-b · 周日 Review 5 步 + 想法子系统 ⬜

- **目标**:实现 spec §5.6 周日 Review 5 步 + §9 想法子系统(`/ideas` 三组分组 + 升级)+ §5.4 延期强制 review + §2.3 失败恢复。**完成 V3**
- **完成标准**:
  - [ ] `.github/workflows/weekly-review.yml`:cron `0 12 * * 0`(UTC)= 周日北京 20:00
  - [ ] Review 5 步卡片(§5.6)
  - [ ] `/ideas` 智能视图(§9.1)+ `/promote`(§9.3)+ Tag 系统(§9.4)
  - [ ] 延期 P0 强制 review(§5.4 ≥3 张)+ 慢性延期质问
  - [ ] 周一补推 + 错过补做 ABC(§2.3)
  - [ ] 四步走验证
- **涉及文件**:`.github/workflows/weekly-review.yml`、`scripts/{analyze,build_card}.py`、`worker/src/commands/{ideas,promote,tags}.ts`、`cards/`
- **依赖**:Phase 5
- **测试**:`act` 跑 weekly-review;review 5 步卡片正确
- **工作量**:3–5 天
- **状态**:⬜

---

### Phase 7 · V4 · 应用形态 ⬜

- **目标**:多维表格看板 + 应用主页 + Variable Reward 完整 4 层(§10.4)+ §10.5 动效(canvas-confetti)。从 bot 升级为应用
- **完成标准**:
  - [ ] 多维表格看板(状态机可视化)
  - [ ] 应用主页
  - [ ] Variable Reward 4 层完整(文案/段位/成就/彩蛋 1%)
  - [ ] canvas-confetti 彩蛋撒花
  - [ ] 暗色默认 + 亮色切换(§10.1)
  - [ ] 四步走验证
  - [ ] **V4 成功标准(spec §14.1):自己每天用**
- **涉及文件**:多维表格配置、应用主页代码、`worker/src/lib/reward.ts`、`cards/`
- **依赖**:Phase 6
- **测试**:应用主页可访问;段位/成就触发
- **工作量**:1–2 周
- **状态**:⬜

---

### Phase 8 · V5 · AI 教练 ⬜

- **目标**:AI 周复盘 + 异常诊断 + 输入输出比监控(§5.5)。长期演进
- **完成标准**:
  - [ ] AI 周复盘(自动生成 `reviews/` 云文档)
  - [ ] 输入输出比监控(§5.5:3:1 警告 / 5:1 危险)
  - [ ] 异常诊断(Stuck 慢性 / 延期模式识别)
  - [ ] 四步走验证
  - [ ] **V5 成功标准(spec §14.1):4 周 AI 复盘 + 输入输出比 < 3:1**
- **涉及文件**:`scripts/analyze.py`(AI 复盘)、`worker/src/lib/ai.ts`(扩展)、`cards/`
- **依赖**:Phase 7
- **测试**:AI 复盘云文档生成;比例告警
- **工作量**:长期
- **状态**:⬜

---

## 4. 跨 Phase 约定(所有 Phase 共用,不重复写)

- **提交规范**:`<type>: <description>`,type ∈ feat/fix/docs/refactor/test/chore(AGENTS.md §提交规范)
- **四步走验证**:每个 Phase 完成前必过——Code Review / 测试完整性 / 编译验证(`tsc --noEmit` + `py_compile`)/ 功能测试(截图存 `docs/screenshots/`)(AGENTS.md §测试要求)
- **状态同步**:每个 Phase 完成后,回本文件把状态改 ✅ 并勾选完成标准(AGENTS.md 协作规则 3)
- **铁律**:不硬编码 secret、.env 不进 git、TS 严格、Python 类型注解、外部 API 必须 try-catch、spec 变更先更文档(AGENTS.md §铁律)
- **联网优先**:涉及外部库/API/框架版本,先搜索确认再动手(AGENTS.md 铁律 7)

---

## 5. 风险与回退

| 风险 | 影响 | 缓解 |
|---|---|---|
| Classic Token 泄漏 | 仓库 public,后果严重 | spec §12 三层保险;泄漏 5 分钟应急预案(§12.3) |
| **Cowork 调用成本**(V0 新增) | 每天 Claude 会话消耗调用次数 | V0 是短期验证(7 天);通过后迁到 GitHub Actions(Phase 1,免费),Cowork 退役 |
| 飞书 OpenAPI 契约/权限变化 | 推送/云文档操作失败 | 铁律 7 联网优先;mock 合同 + 人工权限 E2E |
| GitHub Projects V2 GraphQL schema 变动 | 拉数据失败 | GraphQL Explorer 调试;mutation 有 try-catch |
| Stuck/P0 算法误判 | 推送内容不准 | Phase 4 用构造数据测试;V0/Phase 1 只做最小 P0 选择 |
| Fine-grained Token 陷阱 | 无法访问 Projects V2 | 只用 Classic Token(AGENTS.md FAQ) |

---

## 6. 下一步

当前路由:**Phase 5 · V3-a 飞书云文档写作基础**。后续按序执行:

1. **V2-b 工程已完成**:Issue #23 / PR #24 已合并,Python 17 项与 Worker 293 项测试、独立审查、CI 双绿;
2. **幂等生产启用单独推进**:等待用户决定,之后人工准备 Tablestore / 最小权限 RAM 身份,隔离环境验证后只从 main 部署并做生产重投验证(运行手册见 `docs/runbooks/idempotency-tablestore.md`);
3. **Branch Protection 单独决策**:GitHub 当前未强制 required checks,未经用户确认不修改仓库设置;
4. **克制处理其余旧债务**:WIP 原子锁、daily-push TypeScript 重写、Encrypt Key 暂缓,除非出现真实故障/规模证据或用户改变优先级;
5. **V3-a 正在推进**:Issue #29 / PR #32 已完成文档创建与纯文本读取;官方创建接口不能带正文,因此 Issue #33 先补根块文本写入,再按 `/note` → `/draft`/映射 → `/drafts`/监控拆分;
6. **长期指标不伪造**:66 天窗口最早于 2026-10-06 结束,当前没有按钮完成计数证据;继续记录为 collecting,但不阻塞 V3 工程。

*DEV-PLAN 结束。所有执行以此为据,产品决策以 Product-Spec.md 为据。*
