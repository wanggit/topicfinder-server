# topicfinder-server — Agent Notes

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

- `src/app.ts` — `createApp(options)` factory, returns Express app. Accepts `{ dbHealthy }` for test seam injection.
- `src/index.ts` — production entry. Loads `.env`, creates MySQL pool, calls `createApp()`.
- `tests/` — Vitest + supertest. Mock patterns use option injection, not `vi.mock()`.

## Conventions

- All route handlers wrapped in try/catch → `next(err)`
- Error middleware returns `{ error: { code, message } }` JSON
- Test seam: `createApp()` accepts options that control external dependencies
