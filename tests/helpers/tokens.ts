import jwt from 'jsonwebtoken';

export const TEST_SECRET = 'test-secret';

export function adminToken(secret = TEST_SECRET): string {
  return jwt.sign({ adminId: 1, username: 'admin', role: 'admin' }, secret, { expiresIn: '1h' });
}

export function studentToken(secret = TEST_SECRET): string {
  return jwt.sign({ openid: 'test-openid', studentId: 1 }, secret, { expiresIn: '1h' });
}