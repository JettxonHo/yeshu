# 运行手册 · Tablestore 幂等键(Reliability Hardening 第一项)

> 配套代码:`worker/src/lib/atomic-key-store.ts`(抽象)、`tablestore-atomic-key-store.ts`(生产适配器)、`idempotency.ts`(协调器)、`app.ts`(接入)、`tablestore-sdk-contract.test.ts`(真实 SDK 契约)。
> 本手册不含任何真实 endpoint / instance / AccessKey / Account ID / 生产 URL / 本机路径。

## 1. 本 PR 提供什么 / 不提供什么

**提供**:持久化幂等的代码与配置能力——原子 claim 抽象、Tablestore 适配器、app 守卫、配置解析与模板、依赖安全门禁、测试。

**不提供**:Tablestore 实例、表、RAM 身份、FC 环境变量配置、生产部署、幂等的生产验证。这些全部由 PR-C2 在人工监督下准备与执行。合并本 PR 不改变生产行为(生产仍运行旧构建,未部署本代码)。

## 2. 消息事件使用 `message_id`

`/add` 的去重键为 `message:<event.message.message_id>`。同一条消息被飞书重推(响应丢失等)时合并为一次处理。不使用 `header.event_id` 作为消息命令的主去重键。缺少 `message_id` 的 `/add` 直接返回 HTTP 400(`message_id_missing`),不调 GitHub、不发卡片。

## 3. 卡片事件使用 `header.event_id`

`card.action.trigger` 的去重键为 `card:<header.event_id>`。同一次回调重推合并;**用户再次点击会生成新的 event_id,视为新操作**,不会被误拦。缺少 `event_id` 的回调返回 200 + 错误 toast「缺少事件标识,请发送 /today 刷新」,不执行 mutation。

`/today`、challenge、Token 校验失败、普通文本均为只读或前置分支,**不访问幂等存储**。

## 4. at-most-once 与 exactly-once 的区别

本方案是 **at-most-once mutation protection**,不是 exactly-once 分布式事务:GitHub GraphQL、飞书消息与 Tablestore 不在同一事务中,无法原子提交。

- claim 发生在任何外部 mutation 之前;claim 成功后即使 Handler 中途出错也**不释放** key;
- 代价:同一 delivery 若在外部 mutation 前失败,不会自动重试。恢复方式是用户行为——重发 `/add`(新 message_id)或重点击最新卡片(新 event_id);
- 收益:杜绝「mutation 成功但进程崩溃」「飞书重推」「多实例并发」三类重复执行。

## 5. 表 Schema(人工创建)

| 项 | 值 |
|---|---|
| Primary Key | `key` STRING |
| Attribute Columns | `owner` STRING / `kind` STRING / `expires_at_ms` INTEGER / `created_at_ms` INTEGER |
| 表级 TTL | 建议 30 天(只做长期清理) |
| maxVersions | 1 |
| allowUpdate | true(条件 UpdateRow 接管需要) |
| 二级索引 | 无(不需要) |

## 6. 逻辑 claim TTL

- 幂等键逻辑 TTL 默认 **7 天**(`IDEMPOTENCY_TTL_SECONDS=604800`),由 `expires_at_ms` 列控制,适配器在 claim / 接管时做实时判断;TTL 在协调器层做正整数与安全整数校验,非法值拒绝生成 claim;
- 表级 TTL(建议 30 天)只负责过期行的物理清理,**不参与**短租约的实时判断;
- 过期键允许被新 owner 原子接管(条件 UpdateRow,见第 15 条复用)。

## 7. 凭证模式(唯一批准:最小权限 RAM 用户 AccessKey)

- 当前**唯一批准**的生产凭证模式:专用最小权限 RAM 用户 AccessKey(ID + Secret 成对);
- 策略仅授予该表的 `ots:GetRow` / `ots:PutRow` / `ots:UpdateRow` / `ots:DeleteRow`;
- **严禁使用阿里云主账号 AccessKey**;
- 凭证只存在本地部署环境与 FC 环境变量;不进 Git、不进日志、不进评论;错误信息只列变量名,不打印值;
- **静态 STS token 已从本 PR 配置中移除**:当前实现没有 STS 自动刷新,静态 token 过期即全站 fail-closed。「STS / FC Role 自动临时凭证刷新」登记为**后续独立设计项**,未经刷新机制设计与真实验证,不得把静态 STS token 重新加入生产配置。

## 8. AccessKey 轮换要求

- 轮换周期:建议每 90 天轮换一次,凭证泄露怀疑时立即轮换;
- 轮换流程(不停机):创建新 AccessKey → 更新 FC 环境变量(新旧并存窗口)→ 验证函数正常 → 禁用旧 Key → 删除旧 Key;
- 轮换后执行一次健康检查(GET / + 一次 `/add` + 一次卡片操作);
- 旧 Key 禁用后若函数冷启动报鉴权失败,属 fail-closed 预期行为,回退环境变量即可恢复。

## 9. 生产配置变量名

| 变量 | 必填 | 说明 |
|---|---|---|
| `IDEMPOTENCY_BACKEND` | 是 | 必须为 `tablestore`;缺失或其他值冷启动失败(不回退内存) |
| `IDEMPOTENCY_TTL_SECONDS` | 否 | 默认 604800;必须正整数 |
| `TABLESTORE_ENDPOINT` | 是 | 实例 endpoint(建议 VPC 内网地址) |
| `TABLESTORE_INSTANCE_NAME` | 是 | 实例名 |
| `TABLESTORE_TABLE_NAME` | 是 | 幂等键表名 |
| `TABLESTORE_ACCESS_KEY_ID` | 是 | 与 Secret 成对 |
| `TABLESTORE_ACCESS_KEY_SECRET` | 是 | 与 ID 成对 |

变量经 `worker/s.yaml` 的 `${env(...)}` 透传,部署机的 shell 环境(或 `.env`)提供值。

## 10. 人工创建表的前置检查

1. 实例与 VPC 网络可达性已确认(FC 同 region,建议内网 endpoint);
2. 按第 5 条 Schema 在控制台人工建表;Worker **不会**自动建表、不会修改 Schema;
3. RAM 用户已创建、最小权限策略已附加、AccessKey 已生成并妥善保存;
4. 表级 TTL 已设为 30 天(控制台「表管理」);
5. 本仓库不含任何一次性建表 / 删表脚本——禁止用脚本直接操作生产表。

## 11. 生产启用前验证步骤(PR-C2)

1. 隔离验证(见第 13 条)先行:fail-closed 全场景在隔离环境验证通过;
2. 冷启动验证:缺任一必填变量时函数冷启动报错,错误仅含变量名;
3. 部署后 smoke:GET / 200、challenge 回显、错误 Token 401 不变;
4. 飞书原生:`/add` 建卡、/today 分组、按钮流转、旧卡片拒绝仍通过;
5. 重推验证:同一消息人工触发重推,确认不产生重复任务;同一卡片回调重推,确认为 warning toast;
6. **生产部署后只做健康检查与真实 duplicate replay,观察 Tablestore claim 记录,不主动制造生产依赖故障。**

## 12. 回滚方式

- **首选**:部署上一稳定构建(与 V2-a 部署相同的 `s deploy` 机制,部署前建立代码包 + 配置快照,见 `docs/deployments/2026-08-02-v2a.md` 的回滚做法)。回滚后生产退回无幂等守卫的 V2-a 行为,其余功能不受影响;
- 幂等表保留即可(无需清理);如彻底下线,先停函数环境变量再人工删表;
- 回滚后核验项同部署后 smoke。

## 13. fail-closed 演练:只允许隔离环境

**严禁**以下生产操作:临时停用生产 RAM 凭证、故意改错生产表名、故意破坏生产 FC 配置。

fail-closed 场景验证必须在**隔离环境**完成,任选其一:

- A. 临时验证函数(独立函数,不接飞书生产事件);
- B. 独立测试表 + 独立最小权限测试凭证;
- C. 本地测试程序连接测试表(`npm run start` + 指向测试表的 `.env`)。

隔离环境验证清单:表不存在(OTSObjectNotExist)、权限拒绝(OTSAuthFailed)、网络不可用、condition conflict、corrupt row(损坏行)。

如未来确需生产故障演练,必须另建明确批准的演练计划、维护窗口和回滚步骤,不得并入常规部署。

## 14. 依赖安全状态

- 生产依赖审计(`npm audit --omit=dev`,官方 registry):**total = 0**(critical 0 / high 0 / moderate 0);
- 最终生产依赖版本:`tablestore@5.6.5`(官方最新,无上游修复版本)+ npm overrides:
  - `protobufjs 7.6.5`(覆盖 tablestore 声明的 6.x:6.x 无安全修复,全部 11 项 advisory 修复于 ≥7.6.3,含 critical GHSA-xq3m-2v4x-88gg);
  - `buffer 5.7.1`(覆盖已废弃的 4.9.1,无 advisory,消除 deprecated 警告);
- `@hono/node-server` 升级 `^2.0.12`(修复 moderate GHSA-frvp-7c67-39w9;仅本地开发入口使用);
- `hono` 最低版本为 `^4.12.34`,当前 lockfile 解析 `4.13.0`(修复 moderate GHSA-8j4g-w8fx-2239;2026-08-06 接手门禁复核);
- override 兼容性证据:全部适配器 mock 测试 + 真实 SDK Runtime Contract Test(`tablestore-sdk-contract.test.ts`:导出存在性、条件对象构造、官方字段 Client 构造、协议 encode/decode 往返,零网络);
- CI 门禁:worker job 在 `npm ci` 之后运行 `npm run security:audit`(`--audit-level=moderate`,moderate 及以上即失败);不接受 `--force`、忽略退出码、删除 lock、把生产依赖误标 devDependency 等伪绿手段;
- tablestore 上游若发布修复 protobufjs 依赖的新版本,应优先升级官方包并移除 override。

## 15. Tablestore 不可用 / 行损坏时系统 fail closed

- `/add`:不执行 handleAdd,HTTP 503,Body 为稳定脱敏错误码 `idempotency_store_unavailable`;
- 卡片回调:不执行 handleCardCallback,HTTP 200 + 错误 toast「系统暂时无法确认操作,请稍后重试」;
- 存储异常与**损坏行**均**绝不**降级为「跳过去重、继续 mutation」;
- 损坏行(缺 `expires_at_ms` / 值非法)不接管、不猜测:抛 `AtomicKeyStoreCorruptRowError`(错误信息只含损坏类型,不含 key / owner / endpoint / SDK 原始响应),走上述 fail-closed 路径,需人工修数;
- PutRow 冲突后行被并发删除(missing-row):最多一次 `EXPECT_NOT_EXIST` 重试;重试条件失败 → held(让出本次 delivery,安全侧);绝不无条件 PutRow;
- 错误识别基于 SDK 结构化 `error.code`(`OTSConditionCheckFail` → held/false 语义;网络 / 鉴权 / 表缺失 / 未知 → 上抛),不依赖 `error.message` 文本匹配。

## 16. passIfMissing = false 规则

本仓库所有列条件一律显式 `passIfMissing = false`:

- 过期接管条件(`expires_at_ms <= nowMs`):属性缺失不得视为过期,防止吞掉尚有效的他人 claim;
- release owner 条件(`owner == owner`):owner 列缺失 → 条件不满足 → 不删除,保护损坏行与他人的 claim。

## 17. SDK Runtime Contract 的边界

`tablestore-sdk-contract.test.ts` 使用真实 SDK(零网络)锁定公开接口与协议编解码,是 protobufjs 跨 major override 的运行时兼容证据。但它**不替代**真实表验证:GetRow 空行返回形状、条件错误码、网络超时等真实行为,仍需在 PR-C2 启用前以测试表实测复核一次。

## 18. Bundle 体积与冷启动风险

- `dist/index.js` = 1,853,736 字节(V2-a 基线 84,622 字节的约 22 倍;gzip -9 后约 171KB),增量来自 tablestore SDK + protobufjs;
- 远小于 FC 代码包上限,但冷启动解析开销上升;
- 本 PR 不部署,**不声称冷启动已验证**;
- PR-C2 必须验证:冷启动 GET /、冷启动 `/add`、冷启动 card callback、Tablestore 首次请求延迟;
- 不得为了缩小体积删除安全校验。

## 19. 未来 WIP lock 如何复用 AtomicKeyStore

`AtomicKeyStore` 抽象与业务无关,`kind` 字段区分 `idempotency` 与 `lock`:

- WIP 并发保护可对 `wip:<目标状态>` claim(kind=lock),业务完成后用 **owner 条件 release**(`release(key, owner)` 只删自己的 claim,删他人返回 false);
- 锁的 TTL 应远短于幂等(秒级租约),过期自动接管防止死锁;
- 幂等路径永不调用 release——claim 成功即永久占用至逻辑过期,这是 at-most-once 的核心保证。
