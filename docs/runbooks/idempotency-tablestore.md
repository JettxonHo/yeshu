# 运行手册 · Tablestore 幂等键(Reliability Hardening 第一项)

> 配套代码:`worker/src/lib/atomic-key-store.ts`(抽象)、`tablestore-atomic-key-store.ts`(生产适配器)、`idempotency.ts`(协调器)、`app.ts`(接入)。
> 本手册不含任何真实 endpoint / instance / AccessKey / Account ID / 生产 URL / 本机路径。

## 1. 本 PR 提供什么 / 不提供什么

**提供**:持久化幂等的代码与配置能力——原子 claim 抽象、Tablestore 适配器、app 守卫、配置解析与模板、测试。

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

- 幂等键逻辑 TTL 默认 **7 天**(`IDEMPOTENCY_TTL_SECONDS=604800`),由 `expires_at_ms` 列控制,适配器在 claim / 接管时做实时判断;
- 表级 TTL(建议 30 天)只负责过期行的物理清理,**不参与**短租约的实时判断;
- 过期键允许被新 owner 原子接管(条件 UpdateRow,见第 14 条复用)。

## 7. 最小权限原则

- 必须使用**专用最小权限 RAM 身份**,策略仅授予该表的 `ots:GetRow` / `ots:PutRow` / `ots:UpdateRow` / `ots:DeleteRow`;
- **严禁使用阿里云主账号 AccessKey**;
- 凭证只经 FC 环境变量注入,不进仓库、不进日志;错误信息只列变量名,不打印值;
- 若评审决定改用 STS 临时凭证,配置 `TABLESTORE_STS_TOKEN`(可选),Worker 代码无需改动。

## 8. 生产配置变量名

| 变量 | 必填 | 说明 |
|---|---|---|
| `IDEMPOTENCY_BACKEND` | 是 | 必须为 `tablestore`;缺失或其他值冷启动失败(不回退内存) |
| `IDEMPOTENCY_TTL_SECONDS` | 否 | 默认 604800;必须正整数 |
| `TABLESTORE_ENDPOINT` | 是 | 实例 endpoint(建议 VPC 内网地址) |
| `TABLESTORE_INSTANCE_NAME` | 是 | 实例名 |
| `TABLESTORE_TABLE_NAME` | 是 | 幂等键表名 |
| `TABLESTORE_ACCESS_KEY_ID` | 是 | 与 Secret 成对 |
| `TABLESTORE_ACCESS_KEY_SECRET` | 是 | 与 ID 成对 |
| `TABLESTORE_STS_TOKEN` | 否 | STS 临时凭证 token |

变量经 `worker/s.yaml` 的 `${env(...)}` 透传,部署机的 shell 环境(或 `.env`)提供值。

## 9. 人工创建表的前置检查

1. 实例与 VPC 网络可达性已确认(FC 同 region,建议内网 endpoint);
2. 按第 5 条 Schema 在控制台人工建表;Worker **不会**自动建表、不会修改 Schema;
3. RAM 身份已创建、最小权限策略已附加、AccessKey 已生成并妥善保存;
4. 表级 TTL 已设为 30 天(控制台「表管理」);
5. 本仓库不含任何一次性建表 / 删表脚本——禁止用脚本直接操作生产表。

## 10. 生产启用前验证步骤(PR-C2)

1. 本地 / 预发:用临时表 + 临时凭证跑通 acquire / duplicate / 过期接管 / release(mock 与真实表各一轮);
2. 冷启动验证:缺任一必填变量时函数冷启动报错,错误仅含变量名;
3. 部署后 smoke:GET / 200、challenge 回显、错误 Token 401 不变;
4. 飞书原生:`/add` 建卡、/today 分组、按钮流转、旧卡片拒绝仍通过;
5. 重推验证:同一消息人工触发重推,确认不产生重复任务;同一卡片回调重推,确认为 warning toast;
6. fail-closed 演练:临时停用 RAM 凭证或改错表名,确认 `/add` 返回 503、卡片回调返回安全 toast,**不发生** mutation;演练后恢复。

## 11. 回滚方式

- **首选**:部署上一稳定构建(与 V2-a 部署相同的 `s deploy` 机制,部署前建立代码包 + 配置快照,见 `docs/deployments/2026-08-02-v2a.md` 的回滚做法)。回滚后生产退回无幂等守卫的 V2-a 行为,其余功能不受影响;
- 幂等表保留即可(无需清理);如彻底下线,先停函数环境变量再人工删表;
- 回滚后核验项同部署后 smoke。

## 12. 当前 PR 的边界

不创建任何云资源、不部署、不配置生产 FC 环境、不合并即生效。Node.js 生产凭证的最终方案(STS vs 长期最小权限 AK)待云端评审,因此本 PR 只实现**配置能力**,两种凭证形态均已支持。

## 13. Tablestore 不可用时系统 fail closed

- `/add`:不执行 handleAdd,HTTP 503,Body 为稳定脱敏错误码 `idempotency_store_unavailable`;不返回 SDK 原始 message;
- 卡片回调:不执行 handleCardCallback,HTTP 200 + 错误 toast「系统暂时无法确认操作,请稍后重试」;
- 存储异常**绝不**降级为「跳过去重、继续 mutation」;
- 错误识别基于 SDK 结构化 `error.code`(`OTSConditionCheckFail` → held/false 语义;网络 / 鉴权 / 表缺失 / 未知 → 上抛),不依赖 `error.message` 文本匹配。

## 14. 未来 WIP lock 如何复用 AtomicKeyStore

`AtomicKeyStore` 抽象与业务无关,`kind` 字段区分 `idempotency` 与 `lock`:

- WIP 并发保护可对 `wip:<目标状态>` claim(kind=lock),业务完成后用 **owner 条件 release**(`release(key, owner)` 只删自己的 claim,删他人返回 false);
- 锁的 TTL 应远短于幂等(秒级租约),过期自动接管防止死锁;
- 幂等路径永不调用 release——claim 成功即永久占用至逻辑过期,这是 at-most-once 的核心保证。
