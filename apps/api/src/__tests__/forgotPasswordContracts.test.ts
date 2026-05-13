import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const apiSrc = path.resolve(dirname, '..');
const repoRoot = path.resolve(apiSrc, '..', '..', '..');

test('forgot password auth routes are public and validated', () => {
  const routes = readFileSync(path.join(apiSrc, 'routes', 'auth.routes.ts'), 'utf8');

  assert.match(routes, /router\.post\('\/forgot-password',\s*validateBody\(forgotPasswordSchema\),\s*authController\.forgotPassword\)/);
  assert.match(routes, /router\.post\('\/reset-password',\s*validateBody\(resetPasswordSchema\),\s*authController\.resetPassword\)/);
  assert.doesNotMatch(routes, /authenticate,\s*validateBody\(forgotPasswordSchema\)/);
  assert.doesNotMatch(routes, /authenticate,\s*validateBody\(resetPasswordSchema\)/);
});

test('forgot password service enforces normal-user reset rules', () => {
  const service = readFileSync(path.join(apiSrc, 'services', 'auth.service.ts'), 'utf8');

  assert.match(service, /PASSWORD_RESET_EXPIRES_MINUTES\s*=\s*10/);
  assert.match(service, /PASSWORD_RESET_COOLDOWN_MINUTES\s*=\s*30/);
  assert.match(service, /crypto\.randomBytes\(32\)\.toString\('base64url'\)/);
  assert.match(service, /createHash\('sha256'\)\.update\(token\)\.digest\('hex'\)/);
  assert.match(service, /db\.getDb\(\)\('super_admins'\)/);
  assert.match(service, /throw new AppError\(404,\s*'Email not found'\)/);
  assert.match(service, /throw new AppError\(429,\s*'You can request another password reset after 30 minutes'\)/);
  assert.match(service, /trx\('password_reset_tokens'\)[\s\S]*whereNull\('used_at'\)[\s\S]*update\(\{\s*used_at: now\s*\}\)/);
  assert.match(service, /trx\('refresh_tokens'\)[\s\S]*update\(\{\s*is_revoked: true\s*\}\)/);
});

test('forgot password email webhook contract matches n8n requirements', () => {
  const mailService = readFileSync(path.join(apiSrc, 'services', 'mail.service.ts'), 'utf8');
  const template = readFileSync(path.join(repoRoot, 'docs', 'email_templates', 'forgot_password.html'), 'utf8');

  assert.match(mailService, /https:\/\/n8n\.omnilert\.app\/webhook-test\/forgot-password/);
  assert.match(mailService, /jwt\.sign\(\{\s*iss:\s*'omnilert-api'\s*\},\s*env\.JWT_SECRET/);
  assert.match(mailService, /'Authorization':\s*`Bearer \$\{token\}`/);
  assert.match(mailService, /type:\s*'forgot_password'/);
  assert.match(mailService, /resetLink:\s*input\.resetLink/);
  assert.match(mailService, /expiresInMinutes:\s*input\.expiresInMinutes/);
  assert.match(template, /\{\{\s*\$json\.body\.data\.resetLink\s*\}\}/);
  assert.match(template, /\{\{\s*\$json\.body\.data\.expiresInMinutes\s*\}\}/);
});

test('password reset token migration stores hashed one-time links', () => {
  const migration = readFileSync(path.join(apiSrc, 'migrations', '064_password_reset_tokens.ts'), 'utf8');

  assert.match(migration, /createTable\(TABLE_NAME/);
  assert.match(migration, /token_hash/);
  assert.match(migration, /expires_at/);
  assert.match(migration, /used_at/);
  assert.match(migration, /index\(\['user_id', 'created_at'\]\)/);
});
