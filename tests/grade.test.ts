import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';

const SECRET = 'test-secret';
const TOKEN = jwt.sign({ openid: 'student1', studentId: 1 }, SECRET);

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
  stem: '1+1=?', options: '["1","2","3","4"]', answer: '2', explanation: '基础加法',
};

describe('POST /api/grade', () => {
  it('grades text answer correctly', async () => {
    const pool = mockPool({
      query: vi.fn()
        .mockResolvedValueOnce([[sampleQuestion]])  // get question
        .mockResolvedValueOnce([{ insertId: 1 }]),   // insert answer_record
    });
    const llmClient = {
      chatOnce: vi.fn().mockResolvedValue(JSON.stringify({ isCorrect: true, explanation: '答对了！' })),
      analyzeImage: vi.fn(),
      streamChat: vi.fn(),
    };
    const app = createApp({ dbHealthy: true, pool, jwtSecret: SECRET, llmClient });

    const res = await request(app)
      .post('/api/grade')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ questionId: 1, studentAnswer: '2' });

    expect(res.status).toBe(200);
    expect(res.body.isCorrect).toBe(true);
    expect(res.body.explanation).toBe('答对了！');
  });

  it('grades incorrect answer', async () => {
    const pool = mockPool({
      query: vi.fn()
        .mockResolvedValueOnce([[sampleQuestion]])
        .mockResolvedValueOnce([{ insertId: 1 }]),
    });
    const llmClient = {
      chatOnce: vi.fn().mockResolvedValue(JSON.stringify({ isCorrect: false, explanation: '应该是2' })),
      analyzeImage: vi.fn(),
      streamChat: vi.fn(),
    };
    const app = createApp({ dbHealthy: true, pool, jwtSecret: SECRET, llmClient });

    const res = await request(app)
      .post('/api/grade')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ questionId: 1, studentAnswer: '3' });

    expect(res.status).toBe(200);
    expect(res.body.isCorrect).toBe(false);
  });

  it('grades photo via OCR', async () => {
    const pool = mockPool({
      query: vi.fn()
        .mockResolvedValueOnce([[sampleQuestion]])
        .mockResolvedValueOnce([{ insertId: 1 }]),
    });
    const llmClient = {
      chatOnce: vi.fn().mockResolvedValue(JSON.stringify({ isCorrect: true, explanation: '正确' })),
      analyzeImage: vi.fn().mockResolvedValue('学生答案: 2'),
      streamChat: vi.fn(),
    };
    const app = createApp({ dbHealthy: true, pool, jwtSecret: SECRET, llmClient });

    const res = await request(app)
      .post('/api/grade')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ questionId: 1, studentImage: 'base64imagedata' });

    expect(res.status).toBe(200);
    expect(res.body.studentOcrText).toBe('学生答案: 2');
  });

  it('requires questionId and answer', async () => {
    const app = createApp({ dbHealthy: true, pool: mockPool(), jwtSecret: SECRET });
    const res = await request(app)
      .post('/api/grade')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
