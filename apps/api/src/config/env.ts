import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_URL: z.string().default('http://localhost:5173'),

  MASTER_DB_HOST: z.string().default('localhost'),
  MASTER_DB_PORT: z.coerce.number().default(5432),
  MASTER_DB_NAME: z.string().default('omnilert_master'),
  MASTER_DB_USER: z.string().default('postgres'),
  MASTER_DB_PASSWORD: z.string().default('postgres'),

  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  SUPER_ADMIN_BOOTSTRAP_SECRET: z.string().min(32),
  SUPER_ADMIN_JWT_SECRET: z.string().min(32),
  SUPER_ADMIN_JWT_EXPIRES_IN: z.string().default('1h'),

  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE: z.coerce.number().default(10485760), // 10MB

  // DigitalOcean Spaces (S3-compatible storage)
  DO_SPACES_ENDPOINT: z.string().optional(),
  DO_SPACES_CDN_ENDPOINT: z.string().optional(),
  DO_SPACES_KEY: z.string().optional(),
  DO_SPACES_SECRET_KEY: z.string().optional(),
  DO_SPACES_BUCKET: z.string().optional(),

  // Odoo credentials for JSON RPC
  ODOO_DB: z.string().min(1),           // Database name (e.g., "omnilert-website-test")
  ODOO_URL: z.string().min(1),            // URL without protocol (e.g., "omnilert-website-test.odoo.com")
  ODOO_USERNAME: z.string().email(),
  ODOO_PASSWORD: z.string().min(1),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  DISCORD_INVITE_URL: z.string().url().default('https://discord.gg/9E2e4TPS7g'),

  QUEUE_SCHEMA: z.string().default('pgboss'),
  EARLY_CHECKIN_QUEUE_NAME: z.string().default('early-checkin-auth'),
  EARLY_CHECKIN_RETRY_LIMIT: z.coerce.number().int().min(0).default(3),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
