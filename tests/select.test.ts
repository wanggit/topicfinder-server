import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const TEST_SECRET = 'test-secret';

function mockPool(overrides: Record<string, any> = {}) {
  return {
    query: vi.fn().mockResolvedValue([[]]),
    execute: vi.fn().mockResolvedValue([{ insertId: 1 }]),
    getConnection: vi.fn().mockResolvedValue({ ping: vi.fn().mockResolvedValue(undefined), release: vi.fn() }),
    ...overrides,
  } as any;
}

function makeQuestion(id: number, difficulty: string) {
  return {
    id, knowledge_point_id: 1, type: 'choice', difficulty,
    stem: `题目${id}`, options: '["A","B","C","D"]', answer: 'A',
    explanation: '', solution_steps: '[]', common_mistakes: '[]',
    concept_tags: '[]', review_status: 'approved', version: 1,
    usage_count: 0, correct_count: 0,
  };
}

const defaultStudent = { id: 1, openid: 'test-student', trial_expires_at: new Date().toISOString(), subscription_status: 'trial' };

async function loginAndGetToken(app: any) {
  const res = await request(app).post('/api/auth/login').send({ code: 'test' });
  return res.body.token;
}

describe('POST /api/questions/select', () => {
  it('first contact: returns questions ordered by difficulty asc', async () => {
    const pool = mockPool({
      query: vi.fn()
        .mockResolvedValueOnce([[defaultStudent]])         // login SELECT
        .mockResolvedValueOnce([[]])                       // answer_records → empty = first contact
        .mockResolvedValueOnce([[makeQuestion(1, 'easy'), makeQuestion(2, 'medium'), makeQuestion(3, 'hard')]]) // questions
        .mockResolvedValueOnce([[{ total: 3 }]]),          // count
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: TEST_SECRET });
    const token = await loginAndGetToken(app);

    const res = await request(app)
      .post('/api/questions/select')
      .set('Authorization', `Bearer ${token}`)
      .send({ knowledgePointId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(3);
    expect(res.body.questions[0].difficulty).toBe('easy');
    expect(res.body.questions[2].difficulty).toBe('hard');
  });

  it('revisit: prioritizes wrong notes before difficulty asc', async () => {
    const pool = mockPool({
      query: vi.fn()
        .mockResolvedValueOnce([[defaultStudent]])         // login
        .mockResolvedValueOnce([[{ id: 1 }]])              // answer_records → has history
        .mockResolvedValueOnce([[{ question_id: 5, consecutive_correct: 0 }]]) // wrong_notes
        .mockResolvedValueOnce([[makeQuestion(5, 'hard')]]) // wrong note Qs
        .mockResolvedValueOnce([[makeQuestion(1, 'easy'), makeQuestion(2, 'medium')]]) // remaining
        .mockResolvedValueOnce([[{ total: 5 }]]),          // count
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: TEST_SECRET });
    const token = await loginAndGetToken(app);

    const res = await request(app)
      .post('/api/questions/select')
      .set('Authorization', `Bearer ${token}`)
      .send({ knowledgePointId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.questions[0].id).toBe(5);
  });

  it('requires JWT authentication', async () => {
    const app = createApp({ dbHealthy: true, pool: mockPool(), jwtSecret: TEST_SECRET });
    const res = await request(app).post('/api/questions/select').send({ knowledgePointId: 1 });
    expect(res.status).toBe(401);
  });

  it('returns source: "partial_generate" when bank has fewer than requested questions', async () => {
    const pool = mockPool({
      query: vi.fn()
        .mockResolvedValueOnce([[defaultStudent]])         // login
        .mockResolvedValueOnce([[]])                       // first contact
        .mockResolvedValueOnce([[makeQuestion(1, 'easy')]]) // only 1 question
        .mockResolvedValueOnce([[{ total: 1 }]]),          // count
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: TEST_SECRET });
    const token = await loginAndGetToken(app);

    const res = await request(app)
      .post('/api/questions/select')
      .set('Authorization', `Bearer ${token}`)
      .send({ knowledgePointId: 1, count: 10 });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('partial_generate');
    expect(res.body.questions).toHaveLength(1);
  });
});
