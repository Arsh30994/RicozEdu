import 'dotenv/config';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { config as loadEnvironment } from 'dotenv';
import mongoose from 'mongoose';
import { createExpressApp } from './express/app';

// pnpm runs a filtered package with apps/api as its working directory, while
// Docker runs from the repository root. Load the root development environment
// in either case, without replacing explicitly provided deployment variables.
const rootEnvironmentPath = resolve(__dirname, '../../../.env');
if (existsSync(rootEnvironmentPath)) {
  loadEnvironment({ path: rootEnvironmentPath, override: false });
}

async function bootstrap(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is required to start the Express API.');
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,
    autoIndex: process.env.NODE_ENV !== 'production',
  });

  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('API_PORT must be a valid TCP port.');
  const app = createExpressApp();
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`RicozEdu Express API listening on 0.0.0.0:${port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}; shutting down API.`);
    server.close((error) => {
      if (error) {
        console.error('Failed to close the HTTP server cleanly.', error);
        process.exitCode = 1;
      }
      void mongoose.disconnect().catch((disconnectError: unknown) => {
        console.error('Failed to close the MongoDB connection cleanly.', disconnectError);
        process.exitCode = 1;
      });
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((error: unknown) => {
  console.error('RicozEdu Express API failed to start.', error);
  process.exitCode = 1;
});
