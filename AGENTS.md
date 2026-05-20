# topicfinder-server — Agent Notes

## Repository Map

TopicFinder 拆为三个独立仓库，这是后台服务端：

| 仓库 | 路径 | 职责 |
|------|------|------|
| **topicfinder-server** | `.` | Express + MySQL 后台 |
| topicfinder-admin | `../topicfinder-admin` | React + Ant Design 管理后台 |
| topicfinder-miniapp | `../topicfinder-miniapp` | Taro 微信小程序 |

领域术语见 `docs/CONTEXT.md`，架构决策见 `docs/adr/`。

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
