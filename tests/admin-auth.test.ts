import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { ensureAdminAccount } from '../src/modules/admin-bootstrap';

const SECRET = 'test-secret';
const ADMIN_HASH = bcrypt.hashSync('admin123', 10);
const adminRow = { id: 1, username: 'admin', password_hash: ADMIN_HASH };

function mockPool(queryOverrides?: ReturnType<typeof vi.fn>) {
  return {
    query: queryOverrides ?? vi.fn().mockResolvedValue([[]]),
    execute: vi.fn().mockResolvedValue([{ insertId: 1 }]),
    getConnection: vi.fn().mockResolvedValue({ ping: vi.fn().mockResolvedValue(undefined), release: vi.fn() }),
  } as any;
}

describe('POST /api/admin/login', () => {
  it('returns JWT for valid credentials', async () => {
    const pool = mockPool(
      vi.fn().mockResolvedValueOnce([[adminRow]])
    );
    const app = createApp({ dbHealthy: true, pool, jwtSecret: SECRET });

    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: 'admin', password: 'admin123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.username).toBe('admin');
  });

  it('returns 401 for wrong password', async () => {
    const pool = mockPool(
      vi.fn().mockResolvedValueOnce([[adminRow]])
    );
    const app = createApp({ dbHealthy: true, pool, jwtSecret: SECRET });

    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: 'admin', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 for nonexistent user', async () => {
    const pool = mockPool(
      vi.fn().mockResolvedValueOnce([[]])
    );
    const app = createApp({ dbHealthy: true, pool, jwtSecret: SECRET });

    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: 'nobody', password: 'x' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when username or password is missing', async () => {
    const app = createApp({ dbHealthy: true, pool: mockPool(), jwtSecret: SECRET });

    const res1 = await request(app).post('/api/admin/login').send({ username: 'admin' });
    expect(res1.status).toBe(400);

    const res2 = await request(app).post('/api/admin/login').send({ password: '123' });
    expect(res2.status).toBe(400);
  });
});

describe('ensureAdminAccount', () => {
  it('repairs placeholder admin password hash', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([[{ id: 1, username: 'admin', password_hash: '$2b$10$placeholder_change_in_production' }]])
      .mockResolvedValueOnce([[]]);
    const pool = { query } as any;

    await ensureAdminAccount(pool);

    expect(query).toHaveBeenNthCalledWith(
      2,
      'UPDATE admins SET password_hash = ? WHERE id = ?',
      [expect.any(String), 1],
    );

    const updatedHash = query.mock.calls[1][1][0];
    await expect(bcrypt.compare('admin123', updatedHash)).resolves.toBe(true);
  });

  it('creates default admin when missing', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);
    const pool = { query } as any;

    await ensureAdminAccount(pool);

    expect(query).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO admins (username, password_hash) VALUES (?, ?)',
      ['admin', expect.any(String)],
    );

    const insertedHash = query.mock.calls[1][1][1];
    await expect(bcrypt.compare('admin123', insertedHash)).resolves.toBe(true);
  });
});

describe('authenticateAdmin middleware', () => {
  it('blocks unauthenticated access to admin routes', async () => {
    const app = createApp({ dbHealthy: true, pool: mockPool(), jwtSecret: SECRET });
    const res = await request(app).get('/api/admin/versions');
    expect(res.status).toBe(401);
  });

  it('allows access with valid admin token', async () => {
    const pool = mockPool(
      vi.fn().mockResolvedValueOnce([[adminRow]])
        .mockResolvedValueOnce([[]])
    );
    const app = createApp({ dbHealthy: true, pool, jwtSecret: SECRET });

    const loginRes = await request(app)
      .post('/api/admin/login')
      .send({ username: 'admin', password: 'admin123' });

    const res = await request(app)
      .get('/api/admin/versions')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(res.status).toBe(200);
  });

  it('rejects student token on admin routes', async () => {
    const pool = mockPool();
    const app = createApp({ dbHealthy: true, pool, jwtSecret: SECRET });
    const jwt = require('jsonwebtoken');
    const studentToken = jwt.sign({ openid: 'o1', studentId: 1 }, SECRET);

    const res = await request(app)
      .get('/api/admin/versions')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });
});
