import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';

export function createApp() {
  const app = express();

  // Security
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
    }),
  );

  // Rate limiting
  app.use(
    '/api/v1/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 50,
      message: { success: false, error: 'Too many requests, please try again later' },
    }),
  );

  app.use(
    '/api/v1/webhooks',
    rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 100,
      message: { success: false, error: 'Too many webhook requests' },
    }),
  );

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Routes
  app.use('/api/v1', routes);

  // Error handler
  app.use(errorHandler);

  return app;
}
