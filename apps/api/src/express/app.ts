import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { authRouter } from './auth';
import { accessRouter } from './access';
import { academicsRouter } from './academics';
import { configurationRouter } from './configuration';
import { importsRouter } from './imports';
import { correlationId, errorHandler, HttpError } from './http';
import { authenticate, requireTenant } from './middleware';
import { privacyRouter } from './privacy';
import { studentsRouter } from './students';

export function createExpressApp(): Express {
  const app = express();
  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(correlationId);
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new HttpError(403, 'CORS_ORIGIN_DENIED', 'This origin is not allowed.'));
    },
    credentials: false,
  }));
  app.use(express.json({ limit: '1mb', strict: true }));
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
  app.use('/v1/auth/login', authLimiter);
  app.use('/v1/auth/google', authLimiter);
  app.use('/v1/tenants', rateLimit({ windowMs: 60 * 60 * 1000, limit: 3, standardHeaders: 'draft-8', legacyHeaders: false }));

  app.get('/health', (_request, response) => {
    const ready = mongoose.connection.readyState === 1;
    response.status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'unavailable',
      database: ready ? 'connected' : 'disconnected',
    });
  });
  app.use('/v1/me', authenticate);
  app.use('/v1/tenants/current', authenticate, requireTenant);
  app.use('/v1', authRouter);
  app.use('/v1', authenticate, studentsRouter);
  app.use('/v1', authenticate, academicsRouter);
  app.use('/v1', authenticate, configurationRouter);
  app.use('/v1', authenticate, accessRouter);
  app.use('/v1', authenticate, privacyRouter);
  app.use('/v1', authenticate, importsRouter);
  app.use((_request, response) => {
    response.status(404).json({ message: 'Route not found.', code: 'NOT_FOUND' });
  });
  app.use(errorHandler);
  return app;
}
