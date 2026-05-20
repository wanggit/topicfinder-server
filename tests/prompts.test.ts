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

const samplePrompt = {
  id: 1,
  prompt_key: 'tutor_system',
  template: 'You are a Socratic tutor. {{safety_rules}}',
  description: '辅导引擎系统提示词',
  version: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('Admin Prompt CRUD', () => {
  it('GET /api/admin/prompts returns list of all prompts', async () => {
    const pool = mockPool({
      query: vi.fn().mockResolvedValueOnce([[samplePrompt]]),
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: TEST_SECRET });

    const res = await request(app)
      .get('/api/admin/prompts')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].prompt_key).toBe('tutor_system');
  });

  it('PUT /api/admin/prompts/:key updates a prompt template', async () => {
    const pool = mockPool({
      query: vi.fn()
        .mockResolvedValueOnce([[{ version: 1 }]])
        .mockResolvedValueOnce([]),
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: TEST_SECRET });

    const res = await request(app)
      .put('/api/admin/prompts/tutor_system')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ template: 'Updated template' });

    expect(res.status).toBe(200);
    expect(res.body.prompt_key).toBe('tutor_system');
    expect(res.body.version).toBe(2);
    expect(res.body.template).toBe('Updated template');
  });
});

describe('Internal Prompt API', () => {
  it('GET /api/prompts/:key returns the prompt template', async () => {
    const pool = mockPool({
      query: vi.fn().mockResolvedValueOnce([[samplePrompt]]),
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: TEST_SECRET });

    const res = await request(app).get('/api/prompts/tutor_system');
    expect(res.status).toBe(200);
    expect(res.body.template).toBe('You are a Socratic tutor. {{safety_rules}}');
  });

  it('GET /api/prompts/:key returns 404 for unknown key', async () => {
    const pool = mockPool({
      query: vi.fn().mockResolvedValueOnce([[]]),
    });
    const app = createApp({ dbHealthy: true, pool, jwtSecret: TEST_SECRET });

    const res = await request(app).get('/api/prompts/unknown_key');
    expect(res.status).toBe(404);
  });
});