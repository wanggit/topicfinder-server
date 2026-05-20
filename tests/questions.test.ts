import { describe, it, expect, vi } from 'vitest';
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

const sampleQuestion = {
  id: 1, knowledge_point_id: 1, type: 'choice', difficulty: 'easy',
  stem: '1+1等于几？', options: JSON.stringify(['1', '2', '3', '4']),
  answer: '2', explanation: '基础加法', solution_steps: JSON.stringify(['step1']),
  common_mistakes: JSON.stringify(['误算为3']), concept_tags: JSON.stringify(['加法']),
  review_status: 'approved', version: 1, usage_count: 0, correct_count: 0,
  created_at: new Date().toISOString(),
};

describe('Admin Question CRUD', () => {
  it('GET /api/admin/questions returns paginated list', async () => {
    const pool = mockPool({
      query: vi.fn()
        .mockResolvedValueOnce([[sampleQuestion]])
        .mockResolvedValueOnce([[{ total: 1 }]]),
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: TEST_SECRET });

    const res = await request(app)
      .get('/api/admin/questions?kpId=1&page=1')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('POST /api/admin/questions creates a question', async () => {
    const pool = mockPool({ query: vi.fn().mockResolvedValueOnce([{ insertId: 5 }]) });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: TEST_SECRET });

    const res = await request(app)
      .post('/api/admin/questions')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        knowledgePointId: 1, type: 'choice', difficulty: 'easy',
        stem: '2+2等于几？', options: ['3', '4', '5', '6'], answer: '4',
        explanation: '基础加法', solutionSteps: [], commonMistakes: [], conceptTags: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(5);
  });

  it('PUT /api/admin/questions/:id updates a question', async () => {
    const pool = mockPool({ query: vi.fn().mockResolvedValueOnce([]) });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: TEST_SECRET });

    const res = await request(app)
      .put('/api/admin/questions/1')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ stem: '更新后的题目' });
    expect(res.status).toBe(200);
  });

  it('DELETE /api/admin/questions/:id deletes a question', async () => {
    const pool = mockPool({ query: vi.fn().mockResolvedValueOnce([]) });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: TEST_SECRET });

    const res = await request(app)
      .delete('/api/admin/questions/1')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
  });

  it('filters by type and difficulty', async () => {
    const pool = mockPool({
      query: vi.fn()
        .mockResolvedValueOnce([[sampleQuestion]])
        .mockResolvedValueOnce([[{ total: 1 }]]),
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: TEST_SECRET });

    const res = await request(app)
      .get('/api/admin/questions?kpId=1&type=choice&difficulty=easy')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
  });
});