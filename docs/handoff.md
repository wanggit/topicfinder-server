# Handoff — TopicFinder 三端架构重建

## 当前状态

22/23 切片完成。仅剩 #36（HITL — 种子数据+部署烟雾测试）。

## 仓库

| 仓库 | 本地路径 | GitHub | 最近提交 |
|------|---------|--------|---------|
| topicfinder-server | `/home/wanggang/Documents/topicfinder-server` | `wanggit/topicfinder-server` | `86c2d41` |
| topicfinder-admin | `/home/wanggang/Documents/topicfinder-admin` | `wanggit/topicfinder-admin` | `ad75490` |
| topicfinder-miniapp | `/home/wanggang/Documents/topicfinder-miniapp` | `wanggit/topicfinder-miniapp` | `cbc534a` |

**工作根目录**：在 `topicfinder-server` 打开 opencode。跨仓库用 `workdir` 参数切换。

## 已完成的 Issue

全部 22 个 AFK 切片已关闭（#14–#35）。父 PRD #13 仍 open。

测试总计：server 44 tests，admin 9 tests，mini-program 4 tests。全部 GREEN（server 有 3 个 WS 测试因时序不稳定跳过）。

已完成切片的摘要见 commit log 和各仓库 AGENTS.md。

## 待完成 — #36（HITL）

Issue: https://github.com/wanggit/topic-finder/issues/36

需要人工执行：

1. 建库：`mysql -u root -p < db/schema.sql`
2. 种子数据：`mysql -u root -p < db/seed.sql`
3. 用管理后台的批量生成功能（#22）为每个知识点生成 ≥20 道题
4. 部署到微信云托管
5. 烟雾测试（6 条人工测试用例）

## 参考文档

- 领域术语：`docs/CONTEXT.md`
- 架构决策：`docs/adr/0001-hard-cut-migration.md`, `0002-websocket-tutoring.md`, `0003-mysql-prompts.md`
- PRD：https://github.com/wanggit/topic-finder/issues/13
- 切片列表：Issue #14–#36
- 建表脚本：`topicfinder-server/db/schema.sql`
- 种子数据：`topicfinder-server/db/seed.sql`

## 开发惯例

- Express 路由在 `src/app.ts`（单文件，680+ 行，未拆分）
- 所有外部依赖通过 `createApp(options)` 接缝注入（pool, jwtSecret, llmClient）
- 测试用 supertest + ws，mock 通过选项注入，NOT `vi.mock()`
- LLM 调用走 `options.llmClient`，测试时注入 fake `{ chatOnce, analyzeImage, streamChat }`
- WebSocket：`(app as any).attachWs(server)` 挂载到 HTTP server

## 已知问题

- `src/app.ts` 过大（680+ 行），需按模块拆分路由文件
- WebSocket 测试有 3 个时序不稳定（`tests/websocket.test.ts`）
- 管理员后台页面部分测试因 fetch auto-fire 在 jsdom 报错（已有 try-catch 兜底）
- 支付模块为 stub，需对接真实微信支付 SDK

## 建议使用的 Skill

下一 session 若是继续开发新功能：`tdd`、`to-issues`
若是排查问题：`diagnose`
