# 野薯(Yeshu)项目交接(Handoff)

> 本文件只管"怎么快速接手"。**项目当前状态的唯一事实页是 [docs/STATUS.md](STATUS.md)**——状态冲突时以 STATUS.md 为准。

## 1. 快速开始

```bash
git clone <仓库地址> && cd yeshu   # 仓库:GitHub JettxonHo/yeshu
cp .env.example .env               # 填入真实值(.env 不进 git)

cd worker
npm ci
npm run check                      # audit + typecheck + test + build 一把过

cd ..
python3 --version                     # 必须 >= 3.11
python3 -m pip install -r requirements.txt
python3 -m unittest discover -s scripts -p 'test_*.py'
python3 -m py_compile scripts/*.py
```

本地起 Worker 调试(可选):`cd worker && npm run dev`(端口 9000,tsx 常驻;curl 模拟 webhook)。

## 2. 当前唯一状态源

**[docs/STATUS.md](STATUS.md)**:三轴状态(Engineering / Production / Validation)、main 与 PR 基线 SHA、合并后部署流程、剩余可靠性工作清单。

任何"现在到哪一步了 / 下一步做什么"的问题,先读它,再动手。

## 3. 必读顺序

1. [Product-Spec.md](../Product-Spec.md) — 产品决策单一真相源
2. [docs/STATUS.md](STATUS.md) — 当前状态唯一事实页
3. [DEV-PLAN.md](../DEV-PLAN.md) — 开发计划(怎么做、Phase 拆解)
4. [GOAL.md](../GOAL.md) — 当前可靠性 Goal、Milestones 与任务边界
5. [AGENTS.md](../AGENTS.md) — 项目规范与铁律(检查命令 / CI / 部署原则)

## 4. 当前开发边界

- **架构**:阿里云 FC Worker(Hono;实时 `/add` `/today` + 卡片按钮回调)+ GitHub Actions(每日 08:00 推送)+ GitHub Projects V2(任务真相源)+ 飞书(交互入口)。
- **工程状态**:V2-b 已由 PR #24 合并到 `main@4b8c6df`,Actions→飞书 E2E 与截图由 PR #28 收口。V3-a 的文档创建/读取/正文/元数据已由 PR #32/#35/#39 合并至 `main@95ee460`;当前 Task Contract 为 Issue #40(Project Text 写入),`/note` 产品细节仍待确认。Issue #12 生产幂等与 #13 Branch Protection 仍独立待用户决定。
- **工程坑位**(改代码前必读):
  1. 飞书带按钮卡片**必须用 V1 格式**(顶层 elements + `config.wide_screen`);V2 schema 2.0 不支持 `tag:"action"`(错误码 230099)。
  2. 卡片回调用 Method A 就地更新(200 响应直接返回新卡,单往返)。
  3. `verifyToken` fail-closed(token 漏配 / 不符一律拒绝);`validateEnv` 冷启动校验必填 secret,漏配函数起不来。
  4. Cloudflare Workers 已弃用(`workers.dev` 国内 DNS 污染,飞书入站超时),不要迁回(Product-Spec §11.2)。
- **行为门槛**:V2 的硬验收现为工程合并 + 真实 Actions→飞书 E2E + 脱敏截图。66 天按钮完成 ≥30 次继续作为长期指标,不得伪称达标,但不阻塞 V3(spec §14.1,2026-08-12 修订)。

## 5. 本地检查命令

```bash
cd worker
npm ci
npm run check

cd ..
python3 --version                     # 必须 >= 3.11
python3 -m pip install -r requirements.txt
python3 -m unittest discover -s scripts -p 'test_*.py'
python3 -m py_compile scripts/*.py
```

CI 门禁(`.github/workflows/ci.yml`):指向 main 的 PR 自动触发 **worker + python** 两个 Job,项目流程要求全绿。2026-08-08 核验时 GitHub 尚未启用 Branch Protection,所以平台未强制 required checks;是否开启需用户确认。base 非 main 的 stacked PR 不自动触发,需手动 `gh workflow run ci.yml --ref <branch>` 并等绿后再交付审查。

## 6. 部署原则

- **只允许从 main 部署**,不从 feature branch 部署;
- PR 的 required checks(worker / python)必须通过;
- 生产部署需要**人工批准**;凭证只在本地(`.env` 与部署工具配置),agent 不执行部署;
- **记录部署 commit SHA**(与 main tip 核对);
- 部署后执行 smoke test:curl GET / + challenge;飞书原生 /add、/today、按钮全流转;
- 出现异常按**上一稳定版本回滚**。

当前**没有**自动生产部署,也**没有** staging 环境:部署是人工动作,按上述原则执行,不声称存在自动化流水线。

## 7. 已知风险入口

- **开放事项**:见 [docs/STATUS.md](STATUS.md)。当前工程路由为 V3-a Issue #40;`/note` 仍需确认内部 ID、tag 与笔记文件夹 token。真实 Project 字段需具备 `read:project`/`project` scope 后核验。66 天/≥30 次最早于 2026-10-06 完成观察,继续长期记录但不阻塞。Issue #12(生产幂等)与 #13(Branch Protection)仍独立开放。WIP 锁、语言重写、Encrypt Key 等延期项只在出现现实证据后重开。
- **历史字段迁移**:`docs/migrations/`(GitHub Projects 字段六状态化已于 2026-07-24 完成;一次性脚本已删除,禁止重演)。
- **审计过程稿**:`docs/audits/` 为本地未入库工作区,不是事实依据。
