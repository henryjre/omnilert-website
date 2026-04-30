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
  assert.match(source, /updated:\s*true/);
  assert.match(source, /user_sensitive_info/);
  assert.match(source, /syncUserProfileToOdoo/);
  assert.match(source, /approved_profile:\s*JSON\.stringify\(approvedProfile\)/);
});
