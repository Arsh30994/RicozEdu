import request from 'supertest';
import mongoose from 'mongoose';
import { createExpressApp } from './app';

describe('Express API base behavior', () => {
  afterEach(async () => {
    await mongoose.disconnect();
  });

  it('reports the API unavailable while MongoDB is disconnected', async () => {
    const response = await request(createExpressApp()).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable', database: 'disconnected' });
  });

  it('returns a validation error for malformed login input without querying MongoDB', async () => {
    const response = await request(createExpressApp())
      .post('/v1/auth/login')
      .send({ email: 'not-an-email', password: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.correlationId).toBeTruthy();
  });

  it('enforces the new eight-character password minimum before querying MongoDB', async () => {
    const response = await request(createExpressApp())
      .post('/v1/auth/login')
      .send({ email: 'person@example.edu', password: '1234567' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.details).toContainEqual(expect.objectContaining({ path: 'password' }));
  });

  it('reports an actionable error when Google OAuth is not configured', async () => {
    const originalClientId = process.env.GOOGLE_CLIENT_ID;
    const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const originalRedirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_OAUTH_REDIRECT_URI;

    try {
      const response = await request(createExpressApp()).get('/v1/auth/google');
      expect(response.status).toBe(503);
      expect(response.body.code).toBe('GOOGLE_OAUTH_NOT_CONFIGURED');
    } finally {
      if (originalClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
      else process.env.GOOGLE_CLIENT_ID = originalClientId;
      if (originalClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
      else process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
      if (originalRedirectUri === undefined) delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
      else process.env.GOOGLE_OAUTH_REDIRECT_URI = originalRedirectUri;
    }
  });

  it('rejects invalid JSON with a client error', async () => {
    const response = await request(createExpressApp())
      .post('/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_JSON');
    expect(response.body.correlationId).toBeTruthy();
  });
});
