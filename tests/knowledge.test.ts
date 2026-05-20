import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

function mockPool(overrides: Record<string, any> = {}) {
  return {
    query: vi.fn().mockResolvedValue([[]]),
    execute: vi.fn().mockResolvedValue([{ insertId: 1 }]),
    getConnection: vi.fn().mockResolvedValue({ ping: vi.fn().mockResolvedValue(undefined), release: vi.fn() }),
    ...overrides,
  } as any;
}

const sampleVersion = { id: 1, name: '苏教版', created_at: new Date().toISOString() };
const sampleGrade = { id: 1, version_id: 1, name: '四年级', sort_order: 1, created_at: new Date().toISOString() };

describe('Admin Version CRUD', () => {
  it('GET /api/admin/versions returns list', async () => {
    const pool = mockPool({
      query: vi.fn().mockResolvedValueOnce([[sampleVersion]]),
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: 'test' });

    const res = await request(app).get('/api/admin/versions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([sampleVersion]);
  });

  it('POST /api/admin/versions creates a version', async () => {
    const pool = mockPool({
      query: vi.fn().mockResolvedValueOnce([{ insertId: 1 }]),
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: 'test' });

    const res = await request(app)
      .post('/api/admin/versions')
      .send({ name: '人教版' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
    expect(res.body.name).toBe('人教版');
  });

  it('PUT /api/admin/versions/:id updates a version', async () => {
    const pool = mockPool({
      query: vi.fn().mockResolvedValueOnce([]), // UPDATE result
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: 'test' });

    const res = await request(app)
      .put('/api/admin/versions/1')
      .send({ name: '北师大版' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('北师大版');
  });

  it('DELETE /api/admin/versions/:id deletes version and cascade grades', async () => {
    const pool = mockPool({
      query: vi.fn()
        .mockResolvedValueOnce([]) // DELETE grades
        .mockResolvedValueOnce([]), // DELETE version
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: 'test' });

    const res = await request(app).delete('/api/admin/versions/1');
    expect(res.status).toBe(200);
  });
});

describe('Admin Grade CRUD', () => {
  it('GET /api/admin/grades?versionId=X returns grades', async () => {
    const pool = mockPool({
      query: vi.fn().mockResolvedValueOnce([[sampleGrade]]),
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: 'test' });

    const res = await request(app).get('/api/admin/grades?versionId=1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([sampleGrade]);
  });

  it('POST /api/admin/grades creates a grade', async () => {
    const pool = mockPool({
      query: vi.fn().mockResolvedValueOnce([{ insertId: 2 }]),
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: 'test' });

    const res = await request(app)
      .post('/api/admin/grades')
      .send({ versionId: 1, name: '五年级', sortOrder: 2 });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(2);
  });
});

describe('Public Knowledge Tree', () => {
  it('GET /api/knowledge/tree?versionId=X returns full tree', async () => {
    const pool = mockPool({
      query: vi.fn()
        .mockResolvedValueOnce([[
          { id: 1, version_id: 1, grade_name: '四年级', subject_name: '数学', kp_id: 1, kp_name: '一元一次方程' },
          { id: 1, version_id: 1, grade_name: '四年级', subject_name: '数学', kp_id: 2, kp_name: '分数加减法' },
        ]]),
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: 'test' });

    const res = await request(app).get('/api/knowledge/tree?versionId=1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('四年级');
    expect(res.body[0].subjects[0].name).toBe('数学');
    expect(res.body[0].subjects[0].knowledgePoints).toHaveLength(2);
  });
});
