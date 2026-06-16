import request from 'supertest';
import { createApp } from '@/app';

describe('GET /health', () => {
  it('returns 200 with a status payload', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('service', 'auth-gateway');
    expect(['ok', 'degraded']).toContain(res.body.status);
  });
});
