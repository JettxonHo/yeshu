# 野薯(Yeshu)· Product Specification

> **版本**:1.0
> **日期**:2026-07-20
> **状态**:Spec 完成,待进 dev-planner
> **维护**:本文档是项目单一真相源,后续 dev-planner / dev-builder 以此为基础

---

## 1. 产品概述

### 1.1 基本信息

| 项 | 内容 |
|---|---|
| 中文名 | **野薯** |
| 英文代号 | **Yeshu** |
| 吉祥物 | **Wildtato**(Wild + potato) |
| 主 Slogan | **耶薯!**(谐音 Yes,完成 P0 时的欢呼) |
| 副 Slogan | ENFP 的外部节拍器 |
| 品牌哲学 | 野蛮生长,有序混乱 |

### 1.2 一句话定义

为 ENFP 和 P 型创作者设计的、基于**外部结构而非意志力**的个人发展管理飞书应用。

### 1.3 核心洞察

ENFP 的失败不是能力问题,是认知功能栈(Ne-Fi-Te-Si)决定的——靠意志力维持节奏必然崩盘。解法不是"变自律",是"把自律外包给环境"。**野薯就是外部节拍器**。

### 1.4 目标用户

- **核心**:ENFP / INFP / ENTP 等 P 型创作者
- **边缘**:任何觉得"我明明想做但就是做不到"的人

### 1.5 明确不服务

- 已有 J 型习惯的人(用 Notion 日历就够)
- 团队协作场景(用 Linear / Jira / Asana)

---

## 2. 用户与场景

### 2.1 典型工作日

```
07:30 起床
08:00 收到飞书推送(今日 P0 + Stuck 提醒)
       └─ 推送目标:私聊自己(V0),可切朋友群(V1+)
08:15 早饭后扫一眼,知道今天聚焦
10:00 工作中冒想法 → /add → bot 创建 Idea 卡
14:00 本地写 P0(沉浸,无飞书介入)
15:30 点推送卡片 [✅ 完成] → 搞怪文案反馈
20:00 后静默(可 /today 自查,不主动推)
22:30 睡前 /today → 看今日完成情况
```

### 2.2 典型一周

- **周一-周二**:执行 P0
- **周三 20:00**:中周体检推送(进度 + Doing 卡 3 天没动提醒)
- **周日 20:00**:Review 5 步流程(清 Stuck → 清 Inbox → 排 Next → 调 Priority → 更新 Showcase)

### 2.3 失败恢复

用户一周没用野薯 → 周一 08:00 自动补推 review + 简化版兜底(只清 Stuck + Next 沿用上周)。不惩罚错过,但让后果可见。

---

## 3. 数据架构

### 3.1 三层架构

| 层 | 角色 | 技术 |
|---|---|---|
| **任务/状态层** | 卡片、字段、优先级的真相源 | GitHub Projects V2(GraphQL) |
| **内容层** | 笔记、草稿、发布的真相源 | 飞书云文档(lark-cli 操作) |
| **桥接层** | 数据读写 + 推送 + AI | GitHub Actions + Cloudflare Worker + AI |

### 3.2 核心原则

**野薯不持有用户内容,只持有元数据和状态**。内容 100% 在飞书云文档,即使野薯挂了也不丢。

### 3.3 GitHub Repo(V0-V4 可选,V5+ 做 SaaS 时需要)

MVP 不做。后期作为版本管理 / 博客发布 / 备份用。

---

## 4. 核心模型

### 4.1 状态机

```
[Backlog]──排期──→[Next]──开始──→[Doing]──完成──→[Done]
   ↑                  │              │
   │                  │              │ 暂停
   │                  │              ▼
   └──────降级────────┘          [Paused]
                                   │
                            ┌──────┼──────┐
                          恢复    降级    放弃
                            │      │      │
                            ↓      ↓      ↓
                         [Doing][Backlog][Abandoned]
```

**6 个状态**:Backlog / Next / Doing / Paused / Done / Abandoned

**关键转换**:
- **开始**(Next → Doing):显式动作 [▶️ 开始],仪式感对抗拖延
- **改天**(Next → Backlog):没开始,今天不做
- **暂停**(Doing → Paused):已开始,停下
- **恢复**(Paused → Doing)
- **降级**(Paused → Backlog)

**设计哲学**:每个按钮对应明确的状态转换,无模糊空间。精确的状态机 = 系统可信 = ENFP 愿意持续用。

### 4.2 按钮设计(基于状态)

| 状态 | 按钮 |
|---|---|
| **Next** | [▶️ 开始] [🔁 改天] [❌ 放弃] |
| **Doing** | [✅ 完成] [⏸ 暂停] [❌ 放弃] |
| **Paused** | [▶️ 恢复] [📦 降级] [❌ 放弃] |

### 4.3 字段定义

**必填**:

| 字段 | 类型 | 取值 | 默认 |
|---|---|---|---|
| Title | 文本 | < 20 字(超过 AI 生成) | - |
| Type | Single Select | Idea / Feature / Bug / Learn / Show | Idea |
| Status | Single Select | Backlog / Next / Doing / Paused / Done / Abandoned | Backlog |
| Priority | Single Select | P0 / P1 / P2 / P3 / 空 | 空 |
| Effort | Single Select | S / M / L / XL | 空 |

**可选**:

| 字段 | 类型 | 取值 | 用途 |
|---|---|---|---|
| Area | Single Select | Personal / Work / Side Project / Yeshu | 基于 PARA,多领域区分 |
| Related Doc | Text | 飞书云文档 ID | Show↔草稿,Learn↔笔记(1:N) |
| Due | Date | 空 | 截止日期(罕见用) |

**自动**(GitHub 维护):Created / Last Updated / Assignees

**Effort 具象化显示**(主标黑色,副标灰色 0.5 透明度):

```
S   摸鱼就能干
    刷个手机的间隙,顺手就做了

M   一顿饭功夫
    外卖等送的功夫,你就完事了

L   一个下午的事
    得专门腾时间,但今天能搞完

XL  周末要烧脑
    养足精神,专门留一天
```

### 4.4 Type 语义边界

- **Idea**:脑子里的火花,没决定做不做
- **Feature**:要写代码的产品功能
- **Bug**:已经做出来的东西坏了
- **Learn**:要学的技术/概念/书
- **Show**:做完了要对外讲的(博客、demo)

**关键边界**:Feature 写完 ≠ Show。Feature Done 是功能完成,要不要写博客是另一张 Show 卡片。

---

## 5. 业务规则

### 5.1 WIP 上限

| 类型 | 上限 | 触发处理 |
|---|---|---|
| **Doing** | 3 张 | 硬限制 + 友好降级(选一张 Doing 改 Paused) |
| **Next** | 5 张 | 硬限制 |
| **P0(周标签)** | 3 张 | 周日 review 标 |
| **Paused** | 5 张 | 周日强制清理 |
| **Inbox(Idea)** | 20 张(软) | 周日强制清理 |
| **Backlog** | 无 | - |

**总 WIP**:Doing(3)+ Paused(5)= 8 张,防止用 Paused 逃避 WIP。

**WIP 触发 UI**:
```
⛔ Doing 已满(3/3)
先把现有 Doing 处理一张:
• 重构认证模块(卡 2 天)→ [⏸ 暂停这张]
或者:[❌ 放弃开始]
```

### 5.2 Stuck 机制

- **定义**:Status=Doing OR Paused AND Last updated > 7 天
- **Stuck Score = 卡住天数 × Priority 权重**(P0=4, P1=2, P2=1, P3=0.5)
- 每日推送显示 1 张(Stuck Score 最高)
- 超 100 分(如 P0 卡 25 天)触发紧急推送

### 5.3 P0 完整机制(周标签 + 日显示)

| 层级 | 含义 | 谁定 | 频率 |
|---|---|---|---|
| **周 P0**(标签层) | "本周必须动" | 周日 review 标 | 每周最多 3 张 |
| **今日 P0**(显示层) | 每天推送显示 | 系统自动选 | 每天最多 3 张 |

**选择算法**:
1. 延期 P0(上周没完成)优先
2. 本周新 P0
3. 总数 > 3 触发强制 review

### 5.4 延期 P0 处理

参考 Things(零负罪)+ Asana(强制通知)+ 野薯特供(强制处理)。

| 场景 | 处理 |
|---|---|
| 延期 ≤ 2 张 | 自动滚到今天,视觉区分"延期 P0" vs "新 P0" |
| 延期 ≥ 3 张 | 强制 review,选最多 2 张保留 |
| 连续延期 3 天 | 慢性延期,强制决策(降级/放弃/留) |

### 5.5 输入输出比

| 操作 | 性质 |
|---|---|
| /note | 输入 |
| /draft | 输出 |
| /promote note→draft | 转移 |
| Learn Done | 输入 |
| Show/Feature Done | 输出 |

- **警告**:3:1
- **危险**:5:1
- **双窗口**:周实时监控 / 月趋势分析

### 5.6 周日 Review 5 步流程(15 分钟)

```
Step 0 · 提醒推送(周日 20:00)
Step 1 · 清 Stuck(5 分钟)· 按 Score 排序,每张强制决策
Step 2 · 清 Inbox(5 分钟)· 选 0-3 张升级,>20 强制清理
Step 3 · 排下周 Next(3 分钟)· 从 Backlog 挑 5 张,P0 标 2-3
Step 4 · 调 Priority(1 分钟)· 最近 7 天空 Priority 强制决策
Step 5 · 更新 Showcase(1 分钟)· Show Done 必须贴发布链接
```

**错过补做**:A(周一自动补推)+ B(主动 /review)+ C(周一晚简化版兜底)

### 5.7 /later 机制

| 命令 | 行为 |
|---|---|
| `/later` | 默认推迟 1 小时 |
| `/later 10:00` | 推迟到今天 10:00 |
| `/later 2h` | 推迟 2 小时 |
| `/later tomorrow` | 今天不推,明天 08:00 |

- 每天最多推迟 2 次
- **/later 不重置 Stuck 计数器**(只影响推送时间,不影响卡片状态)

---

## 6. 命令系统

### 6.1 双入口原则

**所有命令都有图标入口 + 命令入口**。

- **零层**(最快):点推送卡片按钮
- **一层**(中等):机器人菜单点选(聊天框 `/` 触发)
- **二层**(熟练):直接打 `/add xxx`

### 6.2 完整命令清单

| 命令 | 语法 | 图标入口 |
|---|---|---|
| 新增 | `/add [type] [pX] <内容>` | [➕ 新想法] |
| 今日 | `/today` | [📋 今日] |
| 卡片详情 | `/show <id>` | 卡片标题点击 |
| 列表 | `/list <type>` | [📂 列表] |
| 在做 | `/doing` | [⚡ 在做] |
| 搜索 | `/search <kw>` | [🔍 搜索] |
| 草稿 | `/drafts` | [📝 草稿] |
| 笔记 | `/notes` | [📜 笔记] |
| 想法池 | `/ideas` | [💭 想法] |
| 统计 | `/stats` | [📊 统计] |
| 推迟 | `/later [time]` | [⏰ 推迟] |
| 完成 | `/done <id>` | [✅ 完成] |
| 开始 | `/start <id>` | [▶️ 开始] |
| 暂停 | `/pause <id>` | [⏸ 暂停] |
| 改天 | `/defer <id>` | [🔁 改天] |
| 放弃 | `/drop <id>` | [❌ 放弃] |
| 升级 | `/promote <id> <type>` | /ideas 视图内 |
| 快记 | `/note <内容>` | [📝 快记] |
| 新草稿 | `/draft <标题> [目标字数]` | [✍️ 新草稿] |
| Tag 管理 | `/tags add/remove <tag>` | 设置 |
| 帮助 | `/help` | [❓ 帮助] |

### 6.3 Priority 推断机制(三层)

**Layer 1 · add 时智能推断(关键词)**:
- "紧急/马上/今天必须" → P0
- "明天/这周/要赶紧" → P1
- "想/想法/考虑" → 空(Idea 默认)
- "学/研究" → P2
- "无聊时/看看" → P3

**Layer 2 · 周日 review 强制调整**:空 Priority 的卡必须决策

**Layer 3 · 显式覆盖**:`/add p0 xxx`

---

## 7. 推送系统

### 7.1 推送节奏

| 时间 | 内容 |
|---|---|
| **08:00** | 主推送(P0 + Stuck) |
| 中午 | 零打扰(用户 /add 只回确认) |
| 完成 | 搞怪文案反馈 |
| **20:00 后** | 静默(可自查) |

**总频率**:1 次主动推 + 0-N 次被动响应,符合"一天出场 2-3 次"

### 7.2 P0 显示规则

- 最多 3 张,超过分页(类 Telegram,in-place 更新)
- 按钮根据卡片当前状态显示(见 §4.2)

### 7.3 Stuck 显示

每日推送显示 1 张(Stuck Score 最高)

---

## 8. 写作子系统

### 8.1 设计哲学

**飞书云文档是唯一写作入口**。手机、电脑、网页都用飞书云文档,GitHub Repo 降级为可选备份。

### 8.2 三种输入

**8.2.1 /add(想法)**:
- 不创建云文档
- 内容存 GitHub Projects 卡片
- 卡片标题 = AI 生成 < 20 字(超过时)

**8.2.2 /note(笔记)**:
- flomo 路线:无标题,纯内容 + tag
- 内部 ID:`2026-07-19-001`
- 云文档显示名:内容前 30 字

**8.2.3 /draft(草稿)**:
- Apple Notes 路线:第一行作标题
- 文件名:`2026-07-19-slug`
- 关联 Show 卡片

### 8.3 飞书云文档结构

```
Anchor Root/
├── 我的笔记/          ← /note 创建
├── drafts/            ← /draft 创建
├── published/         ← 发布后归档
├── templates/         ← 模板
└── reviews/           ← 周日报自动生成
```

### 8.4 草稿进度机制

**关键**:野薯不持有内容,只持有元数据。内容在飞书云文档,自动保存。

**流程**:
1. `/draft 标题 [目标字数]` → bot 用 lark-cli 创建云文档
2. 用户点链接写,飞书自动保存
3. 每天 08:00 cron → lark-cli 拉元数据(字数/修改时间)
4. 3 天没改提醒 / 7 天没改进 Stuck

**目标字数**(可选):
- 显式:`/draft 标题 2000`
- 推断:Effort S=500 / M=1000 / L=2000 / XL=5000
- 都没有:只显示字数 + [设目标] 按钮

### 8.5 卡片 ↔ 文档映射

| 卡片类型 | 关联文档 | 关系 |
|---|---|---|
| Idea | ❌ | - |
| Feature | 可选(V4) | 1:1 |
| Bug | ❌ | - |
| Learn | 可选 | 1:N |
| **Show** | ✓ 必须 | 1:1 |

---

## 9. 想法子系统

### 9.1 /ideas 智能视图(三组分组)

```
💭 想法池(N 张)

🆕 最近 7 天(N)       ← 新冒头的
🧊 30+ 天未动(N)⚠     ← 被遗忘的(强制决策)
✨ 推荐升级(N)         ← 反复出现的(AI 识别)
```

### 9.2 衍生动作

笔记不实时触发新想法创建。周日 review 时批量提示:"这周笔记里提到了 N 个新想法"。

### 9.3 升级流程

- **显式**:`/promote <id> feature` 或 `/promote <id> show`
- **强制**:周日 review 时,30 天前的 Idea 必须升级或删除

### 9.4 Tag 系统

**固定 Taxonomy**(AI 只能从词表选):

| 类型 | 例子 |
|---|---|
| 领域 | #enfp #productivity #coding #design #business #philosophy |
| 类型 | #idea #reflection #quote #learned #question |
| 状态 | #to-write #to-try #to-share #reference |
| 项目 | #yeshu #lark-bot #github-projects |

**工作流**:用户打 tag 优先,AI 从 taxonomy 补充不覆盖,5 秒后自动确认。

---

## 10. 飞书交互设计

### 10.1 设计语言

**风格**:Linear 克制优雅(暗色为默认,可切换亮色)

**配色**:
- 主色 薯橙 `#FF6B35`
- 完成 薯绿 `#10B981`
- 警告 番茄红 `#EF4444`
- Paused 紫 `#A78BFA`
- 暗色背景 `#0F1115`

**字体**:卡片标题 14px semibold / 分组标题 11px UPPERCASE tertiary / 正文 14px

**按钮**:主 CTA 实心薯橙,其他幽灵按钮(透明+border),Danger 红字

### 10.2 统一模板

所有卡片基础结构:
头部(标题+时间) → 分组标题(UPPERCASE+计数) → 任务项(title+meta+按钮组) → divider → 底部按钮 → 签名 `—— 野薯`

### 10.3 6 张关键卡片

1. **/ideas**:三组分组 + 推荐升级(薯橙 subtle 突出)
2. **/drafts**:进度条(橙进行/绿完成)+ 监控状态 + [设目标]
3. **/add 表单**:Type/Priority 下拉 + Textarea + 智能提示
4. **延期 P0 review**:复选框 + 实时计数 + 降级下拉
5. **周日 review Step 1**:5 格步骤指示器 + Stuck Score 排序
6. **/stats**:四宫格 + 输入输出对比条 + 警告建议

**其他卡片套统一模板**:/today、/show、/list、/note 表单、/draft 表单、慢性延期质问、review Step 2-5

### 10.4 Variable Reward 4 层

| 层 | 内容 | 频率 |
|---|---|---|
| **文案** | 搞怪文案随机(正经30%/抽象50%/中二15%/彩蛋5%) | 每次完成 P0 |
| **段位** | 青铜→白银→黄金→钻石→耶薯战神 | 累积解锁 |
| **成就** | 全 P0 完成/连击 7 天/首个 Show | 里程碑 |
| **彩蛋** | 薯仔跳舞 + 撒花 | 1% 概率 |

### 10.5 动效策略

**飞书卡片动画边界**:不支持 hover,交互是"点击→回调"。

| 阶段 | 动画方案 |
|---|---|
| MVP | canvas-confetti(彩蛋撒花) |
| V2+ | Motion One(微交互) |
| V4 应用主页 | Lottie(品牌动画/段位/成就) |

---

## 11. 技术架构

### 11.1 整体架构

```
┌──────────────────────────────────────────┐
│         用户(飞书)                     │
└────────────────┬─────────────────────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
┌──────────────┐  ┌──────────────┐
│ Cloudflare   │  │ GitHub       │
│ Worker       │  │ Actions      │
│ (实时响应)   │  │ (定时推送)   │
└──────┬───────┘  └──────┬───────┘
       │                 │
       └────────┬────────┘
                ▼
       ┌────────────────┐
       │ GitHub Projects │ ← 任务真相源
       │ + 飞书云文档    │ ← 内容真相源
       └────────────────┘
```

### 11.2 技术栈

| 组件 | 选择 |
|---|---|
| Worker 框架 | TypeScript + **Hono** |
| Worker 部署 | wrangler + GitHub Actions |
| Actions 脚本 | **Python** |
| GitHub API | GraphQL v4 |
| 飞书操作 | **lark-cli** |
| AI Provider | **DeepSeek** + OpenAI 兼容抽象 |
| 缓存 | Cloudflare KV |
| Secret | GitHub Secrets + wrangler secret |
| GitHub PAT | **Classic Token**(Fine-grained 不支持 Projects V2) |

### 11.3 项目结构

```
yeshu/
├── .github/workflows/
│   ├── daily-push.yml
│   ├── wednesday-check.yml
│   ├── weekly-review.yml
│   └── deploy-worker.yml
├── worker/
│   ├── src/
│   │   ├── index.ts            # Hono 入口
│   │   ├── commands/           # 命令处理
│   │   └── lib/
│   │       ├── github.ts       # GraphQL
│   │       ├── lark.ts         # lark-cli
│   │       ├── ai.ts           # AI 抽象
│   │       ├── cards.ts        # 卡片构造
│   │       └── verify.ts       # 签名校验
│   └── wrangler.toml
├── scripts/
│   ├── fetch_data.py
│   ├── analyze.py
│   ├── build_card.py
│   └── push_lark.py
├── cards/                      # 卡片模板
├── .env.example
├── .gitignore                  # 含 .env
└── README.md
```

### 11.4 cron 表达式(北京时间)

| 触发 | cron(UTC) | 北京 |
|---|---|---|
| 每日推送 | `0 0 * * *` | 08:00 |
| 周三体检 | `0 12 * * 3` | 周三 20:00 |
| 周日 review | `0 12 * * 0` | 周日 20:00 |

### 11.5 AI 抽象层

```typescript
async function callAI(prompt: string, env: Env): Promise<string> {
  const r = await fetch(`${env.AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.AI_API_KEY}` },
    body: JSON.stringify({
      model: env.AI_MODEL,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  return (await r.json()).choices[0].message.content;
}
```

**切换 Provider**:改 wrangler.toml 的 `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`,代码不动。

### 11.6 三个核心工作流

**场景 1 · 每日推送**(Actions):
cron → fetch_data.py(拉 GraphQL + lark-cli 云文档)→ analyze.py(算 P0/Stuck/Stats)→ build_card.py(组装 JSON)→ push_lark.py → 退出

**场景 2 · /add 命令**(Worker):
飞书消息 → Worker 接 webhook → 签名校验 → handleAdd → 智能推断 Priority → AI 生成标题(>20 字时)→ GraphQL mutation → 返回卡片(< 2 秒)

**场景 3 · 点按钮**(Worker):
飞书 callback → Worker 接 → 签名校验 → 检查 WIP → GraphQL mutation → 触发 Variable Reward → 返回反馈(< 1 秒)

---

## 12. 安全方案

### 12.1 三条铁律

1. **.env 永远不进 git**(.gitignore 必含)
2. **代码只读环境变量,不硬编码**
3. **CI/CD 用 secrets,不用文件**

### 12.2 三层保险

1. **.env.example 模板**(commit 这个,不 commit 真实的)
2. **GitHub Push Protection**(免费,一键开)
3. **pre-commit hook**(detect-secrets / gitleaks)

### 12.3 应急预案

泄漏后 5 分钟:Provider 后台撤销 Key → 生成新 Key → 更新 Cloudflare/GitHub Secrets → 必要时 git filter-repo 清理历史。

---

## 13. 产品边界

### 13.1 明确不做

| 不做 | 理由 | 用户用别的 |
|---|---|---|
| 团队协作 | 个人工具 | Linear / Jira |
| 时间追踪 | ENFP 讨厌被计时 | Toggl |
| 习惯追踪 | 和 P0 混淆 | Streaks / Habitica |
| 日历管理 | 另一个赛道 | 飞书日历 |
| 笔记应用 | 不重做 | Notion / Obsidian |
| CRM | 超出范畴 | 专门 CRM |

### 13.2 整合策略

- **飞书云文档**:内容真相源,直接用 lark-cli
- **GitHub Projects**:任务真相源,GraphQL 读写
- **Notion / Obsidian**:不整合,各管各的
- **Todoist / Things**:替代关系,选一个

### 13.3 开源形态

- **V0-V4**:GitHub public + 自建应用(每人自己部署)
- **V5+**(如果需求大):考虑 SaaS 或上架飞书应用商店

**仓库从 V0 就 public**(不是 V4 才开源)。

---

## 14. 阶段路径与成功标准

### 14.1 V0-V5 路径

| 阶段 | 时间 | 内容 | 成功标准 |
|---|---|---|---|
| **V0 · 验证期** | 本周,30 分钟 | Cowork scheduled task + lark-cli,只做每日推送 | 连续 **7 天**打开推送 |
| **V1 · 单向闭环** | 2 周 | Cloudflare Worker + GitHub Actions,加 /today 和 /add | 14 天 /add **≥ 10 张** Idea |
| **V2 · 双向闭环** | 1 个月 | 卡片按钮、状态切换、Stuck 推送 | **66 天**按钮完成 **≥ 30 次** |
| **V3 · 内容闭环** | 2 个月 | 飞书云文档写作子系统 | 首篇 Show 发布 |
| **V4 · 应用形态** | 3 个月 | 多维表格看板 + 应用主页 | 自己每天用 |
| **V5 · AI 教练** | 长期 | AI 周复盘 + 异常诊断 | 4 周 AI 复盘 + 输入输出比 < 3:1 |

**铁律**:不达标不进下一阶段。

### 14.2 成功标准的科学依据

- V0 的 7 天:Fogg Tiny Habits 的"可行性检查"
- V2 的 66 天:UCL 2009 研究的习惯形成科学平均值
- 21 天是迷思(Maxwell Maltz 1960,被过度泛化)

### 14.3 开发顺序(MVP · C 方案)

两边并行:
- Worker 做 /add 命令(实时记录)
- Actions 做每日推送(定时反馈)
- 两者通过 GitHub Projects 数据同步

**第一周目标**:跑通最小闭环——每日推送 + /add 命令。

---

## 15. 关键设计原则

1. **单一真相源**:任务在 GitHub Projects,内容在飞书云文档。两份真相源,通过 ID 关联
2. **外部结构替代意志力**:不靠记忆、不靠自律、靠系统和锚点
3. **ENFP 友好三层**:
   - 降低门槛(图标 > 命令,智能推断 > 手动)
   - 强制处理(3 张上限、3 天上限、周日 review)
   - 即时反馈(搞怪文案、段位、Stuck Score)
4. **系统替你做决策**:不显示数据,显示"已过滤的最佳信息"
5. **精确优于灵活**:状态机、字段、按钮都精确对应,不留模糊空间
6. **MVP 心态**:每个阶段是可发布版本,不追求完美。ENFP 跳步必死
7. **API Key 安全**:三条铁律 + 三层保险,架构级杜绝泄漏
8. **野薯不持有内容**:只持有元数据和状态。内容在飞书云文档,即使野薯挂了也不丢
9. **Variable Reward 系统化**:4 层保证不可预测性(ENFP 多巴胺 = 新鲜感 > 奖励)
10. **Fogg B=MAP**:推送=Prompt,降低门槛=Ability,搞怪文案=Motivation。Ability 优先于 Motivation
11. **Hook 模型**:Trigger → Action → Variable Reward → Investment
12. **克制优雅**:Linear 风,暗色优先,微交互,不喧宾夺主
13. **公开仓库**:从 V0 就 public,强制做好安全,早期吸引反馈
14. **科学驱动**:习惯标准基于 UCL 研究(66 天),不基于迷思(21 天)
15. **反 ENFP 本能**:限制并行、强制处理、不追求"全都要"——这是产品能活下来的根本

---

## 16. 后续文档

| 文档 | 阶段 | 内容 |
|---|---|---|
| **DEV-PLAN.md** | dev-planner | 基于 spec 拆解成 Phase 1/2/3... |
| **项目代码** | dev-builder | yeshu/ 目录的实际代码 |
| **Design-Brief.md** | 可选 | 视觉设计规范 |
| **AGENTS.md** | 主控 | 项目级 Agent 配置 |

---

## 附录:命名由来

**野薯**:
- "野"致敬中国摇滚的"野草"精神(朴素 + 反精英)
- "薯"来自用户的昵称"薯仔"(接地气 + 自嘲)
- 谐音 "Yes" → **耶薯!** 是品牌签名(完成 P0 时的欢呼)

**英文 Yeshu**:拼音,简洁,国际场景不别扭

**吉祥物 Wildtato**:Wild + potato,形象生动

---

*Spec 结束。下一步:在 Claude Code 新 session,用本文档作为输入,进 dev-planner。*
