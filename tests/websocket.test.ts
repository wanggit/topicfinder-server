import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { createServer } from 'http';
import WebSocket from 'ws';

const SECRET = 'test-secret';
const TOKEN = jwt.sign({ openid: 'student1', studentId: 1 }, SECRET);

function mockPool() {
  return {
    query: vi.fn().mockResolvedValue([[]]),
    execute: vi.fn().mockResolvedValue([{ insertId: 1 }]),
    getConnection: vi.fn().mockResolvedValue({ ping: vi.fn().mockResolvedValue(undefined), release: vi.fn() }),
  } as any;
}

function setup(extraOpts?: any) {
  const app = createApp({ dbHealthy: true, pool: mockPool(), jwtSecret: SECRET, ...extraOpts });
  const server = createServer(app);
  (app as any).attachWs(server);
  return { app, server };
}

function listen(server: any): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, () => resolve(server.address().port));
  });
}

describe('WebSocket /ws/tutor', () => {
  it('accepts connection with valid JWT token', async () => {
    const { server } = setup();
    const port = await listen(server);

    const ws = new WebSocket(`ws://localhost:${port}/ws/tutor?token=${TOKEN}`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 3000);
    });

    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
    server.close();
  });

  it('rejects connection without token', async () => {
    const { server } = setup();
    const port = await listen(server);

    const ws = new WebSocket(`ws://localhost:${port}/ws/tutor`);
    await new Promise<void>((resolve) => {
      ws.on('error', () => resolve());
      ws.on('close', () => resolve());
      setTimeout(() => resolve(), 2000);
    });

    expect(ws.readyState).not.toBe(WebSocket.OPEN);
    server.close();
  });

  it('handles start_session and returns session_started', async () => {
    const { server } = setup();
    const port = await listen(server);

    const ws = new WebSocket(`ws://localhost:${port}/ws/tutor?token=${TOKEN}`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'start_session', kpId: 1 })));
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        expect(msg.type).toBe('session_started');
        ws.close();
        resolve();
      });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 3000);
    });

    server.close();
  });
});
