import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { adminToken, TEST_SECRET } from './helpers/tokens';

function mockPool(overrides: Record<string, any> = {}) {
  return {
    query: vi.fn().mockResolvedValue([[]]),
    execute: vi.fn().mockResolvedValue([{ insertId: 1 }]),
    getConnection: vi.fn().mockResolvedValue({ ping: vi.fn().mockResolvedValue(undefined), release: vi.fn() }),
    ...overrides,
  } as any;
}

const sampleTask = {
  id: 1, knowledge_point_id: 1, question_types: JSON.stringify(['choice', 'fill']),
  difficulty: 'easy', count: 10, status: 'pending', progress: 0, error_message: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

describe('Generation Tasks API', () => {
  it('POST /api/admin/generation-tasks creates a task', async () => {
    const pool = mockPool({ query: vi.fn().mockResolvedValueOnce([{ insertId: 1 }]) });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: TEST_SECRET });

    const res = await request(app)
      .post('/api/admin/generation-tasks')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        knowledgePointId: 1, questionTypes: ['choice', 'fill'], difficulty: 'easy', count: 10,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
    expect(res.body.status).toBe('pending');
  });

  it('GET /api/admin/generation-tasks returns task list', async () => {
    const pool = mockPool({ query: vi.fn().mockResolvedValueOnce([[sampleTask]]) });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: TEST_SECRET });

    const res = await request(app)
      .get('/api/admin/generation-tasks')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('GET /api/admin/generation-tasks/:id returns single task', async () => {
    const pool = mockPool({ query: vi.fn().mockResolvedValueOnce([[sampleTask]]) });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: TEST_SECRET });

    const res = await request(app)
      .get('/api/admin/generation-tasks/1')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
  });
});