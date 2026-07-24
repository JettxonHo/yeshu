# 野薯(Yeshu)项目交接(Handoff)

> 快照时间:2026-07-24。接手前先读:[DEV-PLAN.md](../DEV-PLAN.md)(Phase 状态)→ [Product-Spec.md](../Product-Spec.md)(spec)→ [AGENTS.md](../AGENTS.md)(约定/铁律)。本文件是**当前状态 + 怎么接着干**的快照。

## 一句话状态

**V2-a(Phase 3)代码完成并已线上部署,PR #2 待 merge。** 下一阶段:V2 行为观察(66 天按钮完成 ≥ 30,spec §14.1)+ Phase 4(应用主页/段位成就/多维表格看板)。

## 这是什么

ENFP 个人管理飞书应用。任务数据在 **GitHub Projects V2**(GraphQL,真相源),飞书为交互入口。架构:

- **阿里云 FC Worker**(实时交互):`/add` `/today` 文本命令 + **卡片按钮回调**(状态流转)
- **GitHub Actions**(每日 08:00 推送,V1-a):**尚未启用**(脚本在 `scripts/`,workflow 在 `.github/workflows/daily-push.yml`,V1-b 起暂停)
- **GitHub Projects V2 #1**:任务真相源(字段已配齐)
- 飞书云文档:内容真相源(草稿/笔记,V2 才用到)

## 进度(Phase)

| Phase | 内容 | 状态 |
|---|---|---|
| V0 | Cowork 零代码托管 | ✅ |
| V1-b | FC Worker /add /today(单向闭环) | ✅ PR #1 merged(a620c76) |
| V2-a | 按钮回调 + 6 状态机 + WIP + 搞怪文案 | ✅ 代码+线上部署,**PR #2 OPEN** |
| Phase 4 | 应用主页 / 段位成就 / 多维表格看板 | ⬜ 下一个 |

## 线上基础设施(现状)

- **FC 函数** `yeshu-worker` @ cn-hangzhou(nodejs20,handler 模型)
  - URL:`https://yeshu-worker-ardlcrifom.cn-hangzhou.fcapp.run`(webhook = `.../webhook`)
  - 已部署 V2-a 代码(Python 推送 workflow 未启用)
- **GitHub Project #1**(JettxonHo,project ID `PVT_kwHODSJQBM4Bd1Sw`)
  - Status 6 态:Backlog/Next/Doing/Paused/Done/Abandoned(内建字段扩展而来)
  - Priority(P0–P3)/ Type(Idea/Feature/Bug/Learn/Show)/ Effort(S/M/L/XL):已建
- **飞书应用** `cli_aad7e549ab385bd8`
  - 事件订阅:请求地址 = 上面的 FC URL;`im.message.receive_v1` + `card.action.trigger`(自动路由,无单独回调 URL)
  - 权限:im.message、contact 相关、bot 能力

## 部署 / 开发 / 测试(命令)

```bash
cd /Users/ketchup/Projects/YESHU/worker
npm run build                      # esbuild 打包 src/fc.ts → dist/index.js(CJS)
set -a && source ../.env && set +a # 注入 ${env(KEY)} 到 s.yaml
s deploy -y                        # 部署 FC(凭证在 ~/.s/access.yaml,alias default)

npm run dev                        # 本地 dev(port 9000,tsx)
node node_modules/typescript/bin/tsc --noEmit   # 类型检查

bash scripts/setup-v2a-fields.sh   # 一次性:GitHub 项目字段配置(只跑一次,createProjectV2Field 不幂等)
```

## 代码结构(worker/src)

- `app.ts`:createApp,/webhook 按 `header.event_type` 分流(message / card.action.trigger),challenge + fail-closed token 校验
- `fc.ts`:FC handler 入口(hono-alibaba-cloud-fc3-adapter);`index.ts`:本地 dev(@hono/node-server,port 9000);`env.ts`:loadEnv + validateEnv
- `commands/`:`add.ts` / `today.ts` / `callback.ts`(按钮回调 → 状态转换 → 返回刷新卡)
- `lib/`:`github.ts`(字段元数据/状态转换/查询)、`lark.ts`(发消息)、`cards.ts`(V1 带按钮卡)、`state.ts`(6 状态机 + 按钮集 + WIP)、`reward.ts`(搞怪文案)、`verify.ts`、`ai.ts`

## 关键决策 & 坑(重要)

1. **Cloudflare → 阿里云 FC**:`workers.dev` 国内 DNS 污染,飞书 webhook 入站超时。现 FC 国内直连(Product-Spec §11.2)
2. **飞书卡片用 V1 格式**:V2(schema 2.0 + body.elements)不支持 `tag:"action"` 按钮(报 230099)。**所有带按钮的卡必须是 V1**(顶层 elements + config.wide_screen)
3. **Status 扩到 6 态**:`updateProjectV2Field` 会整体替换 options,**必须带上全部现有 option 的 id**,否则清空 item 的 Status 值
4. **卡片回调**:与消息事件共用 `/webhook`;就地更新用 **Method A**(200 响应返回新卡);回调返回**刷新后的 /today 列表**(非单项卡)
5. **安全**:`verifyToken` fail-closed(空 token 拒绝)+ `validateEnv` 冷启动校验必填 secret(漏配函数起不来,防静默无鉴权)。`LARK_VERIFICATION_TOKEN` 生产必配(在 .env + .env.example)
6. **Bash 工具 cwd 会重置到主项目**(Product Recommendation clip,另一仓库):YESHU 的 git 用 `git -C /Users/ketchup/Projects/YESHU`,gh 用 `gh --repo JettxonHo/yeshu`,或命令开头 `cd ...`。`git push | tail` 会掩盖失败码,别在 && 门控里接管道

## 已知未决(V2+,记档)

- **`event_id` 去重**:`/add` 偶发超飞书 3s → 飞书重试 → 可能重复建卡(需存 event_id,Tablestore/Redis)
- `add.ts` 先建卡后反馈(部分失败会「卡已建但提示失败」)
- `npm run build` 不链 `tsc`;`npm run deploy` 不 build、不注入 env(真流程见上)
- worker 内 `LARK_OPEN_ID` 死配置;`timingSafeEqual` 加固(token 现 `===` 比较)

## 密钥 / 环境变量

- `.env`(gitignored,根目录):`GITHUB_TOKEN/LOGIN/PROJECT_NUMBER`、`LARK_APP_ID/SECRET/OPEN_ID/VERIFICATION_TOKEN`、`AI_PROVIDER/BASE_URL/MODEL/API_KEY`
- 部署凭证:子用户 AccessKey,`s config add` 存 `~/.s/access.yaml`
- `.env.example` 是模板(可 commit)

## 已验证能力

- `/add <内容>` → GitHub 建卡(Backlog/Idea)+ 飞书确认卡
- `/today` → 分组待办卡(带按钮)
- 点按钮 → 卡片就地刷新,项在 Backlog/Next/Doing/Paused/Done/Abandoned 间流转
- Doing/Next/Paused 达上限 → ⛔ 拦截;完成 → 🎉 搞怪文案卡

## 接手建议(下一个 agent)

1. 读 DEV-PLAN / Product-Spec / AGENTS(顺序如上)
2. merge PR #2(V2-a)→ main 更新
3. Phase 4 前确认 V1/V2 行为数据(铁律:不达标不进 Phase);Phase 4 做应用主页/段位/多维表格
4. 改 worker 后:`tsc` → `build` → `deploy` → curl 验证 → 飞书原生验证(四步走,AGENTS §测试)
