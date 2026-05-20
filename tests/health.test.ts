import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /health', () => {
  it('returns 200 with db connected when pool is healthy', async () => {
    const app = createApp({ dbHealthy: true });

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'connected' });
  });

  it('returns 503 when db pool is unhealthy', async () => {
    const app = createApp({ dbHealthy: false });

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', db: 'disconnected' });
  });
});

describe('error middleware', () => {
  it('returns 500 JSON on uncaught errors', async () => {
    const app = createApp({ dbHealthy: true });

    const res = await request(app).get('/error-test');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code', 'INTERNAL_ERROR');
    expect(res.body.error).toHaveProperty('message');
  });
});
