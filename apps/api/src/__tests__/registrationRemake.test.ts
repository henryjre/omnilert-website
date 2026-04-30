import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const apiSrc = path.join(repoRoot, 'apps', 'api', 'src');
const sharedSrc = path.join(repoRoot, 'packages', 'shared', 'src');

test('registration schema includes expanded onboarding fields and approval profile edits', () => {
  const source = readFileSync(path.join(sharedSrc, 'validation', 'auth.schema.ts'), 'utf8');
  for (const field of [
    'middleName',
    'birthday',
    'maritalStatus',
    'mobileNumber',
    'profilePictureUrl',
    'validIdUrl',
    'profile: registrationApprovalProfileSchema.optional()',
  ]) {
    assert.match(source, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('public auth registration accepts multipart files and exposes discord invite config', () => {
  const routes = readFileSync(path.join(apiSrc, 'routes', 'auth.routes.ts'), 'utf8');
  const controller = readFileSync(path.join(apiSrc, 'controllers', 'auth.controller.ts'), 'utf8');
  assert.match(routes, /registrationUpload\.fields/);
  assert.match(routes, /['"]\/register['"]/);
  assert.match(routes, /['"]\/public-config['"]/);
  assert.match(controller, /DISCORD_INVITE_URL/);
});

test('registration listing sanitizes encrypted password and approval writes profile data', () => {
  const source = readFileSync(path.join(apiSrc, 'services', 'registration.service.ts'), 'utf8');
  assert.match(source, /sanitizeRegistrationRequest/);
  assert.match(source, /encrypted_password:\s*_encryptedPassword/);
  assert.match(source, /discord_user_id:\s*_discordUserId/);
  assert.match(source, /updated:\s*true/);
  assert.match(source, /user_sensitive_info/);
  assert.match(source, /syncUserProfileToOdoo/);
  assert.match(source, /approved_profile:\s*JSON\.stringify\(approvedProfile\)/);
});

test('registration approval copies pending discord id to approved user', () => {
  const source = readFileSync(path.join(apiSrc, 'services', 'registration.service.ts'), 'utf8');
  assert.match(source, /request\.discord_user_id/);
  assert.match(source, /registrationDiscordUserId/);
  assert.match(source, /updatePayload\.discord_user_id\s*=\s*registrationDiscordUserId/);
  assert.match(source, /createPayload\.discord_user_id\s*=\s*registrationDiscordUserId/);
  assert.match(source, /Discord ID is already linked to another user/);
});

test('registration approval syncs discord id onto final Odoo partner contact', () => {
  const registrationSource = readFileSync(path.join(apiSrc, 'services', 'registration.service.ts'), 'utf8');
  const odooSource = readFileSync(path.join(apiSrc, 'services', 'odoo.service.ts'), 'utf8');

  assert.match(registrationSource, /discordId:\s*registrationDiscordUserId/);
  assert.match(odooSource, /discordId\?:\s*string \| null/);
  assert.match(odooSource, /partnerUpdate\.x_discord_id\s*=\s*input\.discordId/);
});

test('registration requests migration includes discord user id column', () => {
  const source = readFileSync(
    path.join(apiSrc, 'migrations', '061_registration_requests_discord_user_id.ts'),
    'utf8',
  );
  assert.match(source, /TABLE_NAME\s*=\s*'registration_requests'/);
  assert.match(source, /COLUMN_NAME\s*=\s*'discord_user_id'/);
  assert.match(source, /table\.string\(COLUMN_NAME,\s*32\)\.nullable\(\)/);
});
