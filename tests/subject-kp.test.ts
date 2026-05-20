import { describe, it, expect, vi } from 'vitest';
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

const sampleSubject = { id: 1, grade_id: 1, name: '数学', sort_order: 1, created_at: new Date().toISOString() };
const sampleKP = { id: 1, subject_id: 1, name: '一元一次方程', description: '解一元一次方程', created_at: new Date().toISOString() };

describe('Admin Subject CRUD', () => {
  it('GET /api/admin/subjects?gradeId=X returns subjects', async () => {
    const pool = mockPool({ query: vi.fn().mockResolvedValueOnce([[sampleSubject]]) });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: 'test' });

    const res = await request(app).get('/api/admin/subjects?gradeId=1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([sampleSubject]);
  });

  it('POST /api/admin/subjects creates a subject', async () => {
    const pool = mockPool({ query: vi.fn().mockResolvedValueOnce([{ insertId: 2 }]) });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: 'test' });

    const res = await request(app).post('/api/admin/subjects').send({ gradeId: 1, name: '英语', sortOrder: 2 });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(2);
  });

  it('DELETE /api/admin/subjects/:id cascades to knowledge_points', async () => {
    const pool = mockPool({ query: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]) });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: 'test' });

    const res = await request(app).delete('/api/admin/subjects/1');
    expect(res.status).toBe(200);
  });
});

describe('Admin KnowledgePoint CRUD', () => {
  it('GET /api/admin/knowledge-points?subjectId=X returns KPs', async () => {
    const pool = mockPool({ query: vi.fn().mockResolvedValueOnce([[sampleKP]]) });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: 'test' });

    const res = await request(app).get('/api/admin/knowledge-points?subjectId=1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([sampleKP]);
  });

  it('POST /api/admin/knowledge-points creates a KP', async () => {
    const pool = mockPool({ query: vi.fn().mockResolvedValueOnce([{ insertId: 3 }]) });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: 'test' });

    const res = await request(app).post('/api/admin/knowledge-points').send({ subjectId: 1, name: '分数加减法' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(3);
  });

  it('PUT /api/admin/knowledge-points/:id/versions sets version associations', async () => {
    const pool = mockPool({
      query: vi.fn()
        .mockResolvedValueOnce([]) // DELETE existing
        .mockResolvedValueOnce([{ insertId: 1 }]), // INSERT
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: 'test' });

    const res = await request(app)
      .put('/api/admin/knowledge-points/1/versions')
      .send({ versionIds: [1, 2] });

    expect(res.status).toBe(200);
  });
});
