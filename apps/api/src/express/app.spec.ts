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
