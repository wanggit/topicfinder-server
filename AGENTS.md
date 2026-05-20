# topicfinder-server — Agent Notes

## Repository Map

TopicFinder 拆为三个独立仓库，这是后台服务端：

| 仓库 | 路径 | 职责 |
|------|------|------|
| **topicfinder-server** | `.` | Express + MySQL 后台 |
| topicfinder-admin | `../topicfinder-admin` | React + Ant Design 管理后台 |
| topicfinder-miniapp | `../topicfinder-miniapp` | Taro 微信小程序 |

领域术语见 `docs/CONTEXT.md`，架构决策见 `docs/adr/`。

## Cross-Repo Development

在当前仓库（server）完成多端联调的方法：

**使用 Bash 工具的 `workdir` 参数**在三个仓库间切换执行命令：

```
# 在 admin 仓库跑测试
workdir=/home/wanggang/Documents/topicfinder-admin npm test

# 在 mini-program 仓库安装依赖
workdir=/home/wanggang/Documents/topicfinder-miniapp npm install

# 在 mini-program 仓库编辑文件（用绝对路径）
Read /home/wanggang/Documents/topicfinder-miniapp/src/pages/learning/index.tsx
Edit /home/wanggang/Documents/topicfinder-miniapp/src/pages/learning/index.tsx
```

**典型联调流程**（如"选题 API + 前端页面"）：

1. 在 server 写 API 路由 + 测试（`tests/`, `src/app.ts`）
2. `workdir=../topicfinder-miniapp` 更新小程序页面调新 API
3. 两端各自跑 lint + test 验证

**原则**：
- 先在 server 端完成 API + 测试（mock LLM），保证后端行为正确
- 再改前端使用已稳定的 API 契约
- 管理后台和小程序可以并行改——它们只依赖 API，不互相依赖

## Commands

```bash
npm run dev      # tsx watch — start dev server on :3001
npm run build    # tsc — compile to dist/
npm start        # node dist/index.js — serve production build
npm test         # vitest run
npm run test:watch  # vitest — watch mode
npm run lint     # tsc --noEmit
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```
DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
JWT_SECRET
PORT=3001
OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL_CHAT, OPENAI_MODEL_VISION
```

## Architecture

- `src/app.ts` — `createApp(options)` factory, returns Express app with WS attach. Options: `{ pool, jwtSecret, llmClient, dbHealthy }` for test seam injection.
- `src/index.ts` — production entry. Loads `.env`, creates MySQL pool + HTTP server + WebSocket, calls `createApp()`.
- `tests/` — Vitest + supertest + ws. Mock via option injection, NOT `vi.mock()`.
- `db/schema.sql` — 10 张表完整 DDL, `db/seed.sql` — 苏教版 4-5 年级种子数据

## Conventions

- All route handlers wrapped in try/catch → `next(err)`
- Error middleware returns `{ error: { code, message } }` JSON
- Test seam: `createApp()` accepts `pool`, `jwtSecret`, `llmClient` options
- LLM calls via `options.llmClient` seam (never imported directly)
- WebSocket: `(app as any).attachWs(server)` for WS setup
