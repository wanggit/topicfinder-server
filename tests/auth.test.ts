import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

// Mock pool with query method
function mockPool(overrides: Record<string, any> = {}) {
  return {
    query: vi.fn().mockResolvedValue([[]]),
    execute: vi.fn().mockResolvedValue([{ insertId: 1 }]),
    getConnection: vi.fn().mockResolvedValue({
      ping: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    }),
    ...overrides,
  } as any;
}

function appWithPool(poolOverrides?: Record<string, any>) {
  return createApp({
    dbHealthy: true,
    pool: mockPool(poolOverrides),
    jwtSecret: 'test-secret',
  });
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns JWT and trial info for new student', async () => {
    // Mock: student not found → insert new
    const pool = mockPool({
      query: vi.fn()
        .mockResolvedValueOnce([[]]) // SELECT student not found
        .mockResolvedValueOnce([[{ id: 1, openid: 'test-openid', trial_expires_at: new Date(Date.now() + 90 * 86400000).toISOString(), subscription_status: 'trial' }]]), // INSERT result
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ code: 'wx-test-code' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.trialExpiresAt).toBeDefined();
  });

  it('returns JWT for existing student', async () => {
    const pool = mockPool({
      query: vi.fn()
        .mockResolvedValueOnce([[
          { id: 1, openid: 'test-openid', trial_expires_at: new Date().toISOString(), subscription_status: 'trial' }
        ]]),
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ code: 'wx-test-code' });

    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(false);
  });

  it('returns 400 when code is missing', async () => {
    const app = appWithPool();
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

describe('JWT middleware', () => {
  it('returns 401 when no token provided', async () => {
    const app = createApp({
      dbHealthy: true,
      pool: mockPool(),
      jwtSecret: 'test-secret',
      protectedTestRoute: true, // enables GET /api/protected
    });

    const res = await request(app).get('/api/protected');
    expect(res.status).toBe(401);
  });

  it('returns 402 when trial expired and not subscribed', async () => {
    const expiredDate = new Date(Date.now() - 86400000).toISOString();
    const pool = mockPool({
      query: vi.fn()
        // 1st call: login SELECT
        .mockResolvedValueOnce([[{ id: 1, openid: 'old-user', trial_expires_at: expiredDate, subscription_status: 'trial' }]])
        // 2nd call: protected route SELECT
        .mockResolvedValueOnce([[{ id: 1, openid: 'old-user', trial_expires_at: expiredDate, subscription_status: 'trial' }]]),
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: 'test-secret', protectedTestRoute: true });

    const loginRes = await request(app).post('/api/auth/login').send({ code: 'old-code' });
    const token = loginRes.body.token;

    const res = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(402);
  });
});
