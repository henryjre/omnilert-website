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
  assert.match(routes, /router\.post\('\/reset-password\/validate',\s*validateBody\(validateResetPasswordTokenSchema\),\s*authController\.validateResetPasswordToken\)/);
  assert.doesNotMatch(routes, /authenticate,\s*validateBody\(forgotPasswordSchema\)/);
  assert.doesNotMatch(routes, /authenticate,\s*validateBody\(resetPasswordSchema\)/);
  assert.doesNotMatch(routes, /authenticate,\s*validateBody\(validateResetPasswordTokenSchema\)/);
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
  assert.match(service, /where\(\{\s*token_hash:\s*tokenHash\s*\}\)[\s\S]*whereNull\('used_at'\)[\s\S]*where\('expires_at',\s*'>',\s*now\)/);
  assert.match(service, /export async function validateResetPasswordToken[\s\S]*whereNull\('used_at'\)[\s\S]*where\('expires_at',\s*'>',\s*new Date\(\)\)[\s\S]*where\(\{\s*id:\s*resetToken\.user_id,\s*is_active:\s*true\s*\}\)/);
  assert.match(service, /trx\('password_reset_tokens'\)[\s\S]*whereNull\('used_at'\)[\s\S]*update\(\{\s*used_at: now\s*\}\)/);
  assert.match(service, /trx\('refresh_tokens'\)[\s\S]*update\(\{\s*is_revoked: true\s*\}\)/);
});

test('forgot password email contract uses Resend and includes reset details', () => {
  const mailService = readFileSync(path.join(apiSrc, 'services', 'mail.service.ts'), 'utf8');
  const authTemplates = readFileSync(path.join(apiSrc, 'services', 'emailTemplates', 'authTemplates.ts'), 'utf8');
  const template = readFileSync(path.join(repoRoot, 'docs', 'email_templates', 'forgot_password.html'), 'utf8');

  assert.match(mailService, /new Resend\(env\.RESEND_API_KEY\)/);
  assert.match(mailService, /from:\s*getResendFromEmail\(\)/);
  assert.match(mailService, /name:\s*'email_type',\s*value:\s*'forgot_password'/);
  assert.match(mailService, /renderForgotPasswordEmail\(input\)/);
  assert.match(authTemplates, /input\.resetLink/);
  assert.match(authTemplates, /input\.expiresInMinutes/);
  assert.doesNotMatch(mailService, /n8n\.omnilert\.app/);
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
