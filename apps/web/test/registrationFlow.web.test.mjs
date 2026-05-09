import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, '..', 'src');

test('router exposes standalone public registration route', () => {
  const source = readFileSync(path.join(srcDir, 'app', 'router.tsx'), 'utf8');
  assert.match(source, /path:\s*['"]\/register['"]/);
  assert.match(source, /element:\s*<RegisterPage\s*\/>/);
});

test('login page links registration instead of embedding the old registration form', () => {
  const source = readFileSync(path.join(srcDir, 'features', 'auth', 'components', 'LoginForm.tsx'), 'utf8');
  assert.match(source, /Go to Registration/);
  assert.match(source, /navigate\(['"]\/register['"]\)/);
  assert.doesNotMatch(source, /handleRegister/);
  assert.doesNotMatch(source, /registerFirstName/);
});

test('registration draft persists non-password inputs and keeps password out of localStorage', () => {
  const source = readFileSync(path.join(srcDir, 'features', 'auth', 'pages', 'RegisterPage.tsx'), 'utf8');
  assert.match(source, /localStorage\.setItem\(DRAFT_KEY,\s*JSON\.stringify\(draft\)\)/);
  assert.match(source, /indexedDB\.open\(DB_NAME,\s*1\)/);
  assert.match(source, /formData\.append\(['"]password['"],\s*password\)/);
  assert.doesNotMatch(source, /password[^,\n]*localStorage\.setItem/);
});

test('registration page requires image-only uploads with ten megabyte cap', () => {
  const source = readFileSync(path.join(srcDir, 'features', 'auth', 'pages', 'RegisterPage.tsx'), 'utf8');
  assert.match(source, /MAX_IMAGE_BYTES\s*=\s*10\s*\*\s*1024\s*\*\s*1024/);
  assert.match(source, /accept=['"]image\/\*,\.heic,\.heif['"]/);
  assert.match(source, /normalizeFileForUpload/);
  assert.match(source, /profilePicture/);
  assert.match(source, /validId/);
});

test('auth layout keeps mobile registration in document flow for iOS Safari scrolling', () => {
  const source = readFileSync(path.join(srcDir, 'features', 'auth', 'components', 'AuthLayout.tsx'), 'utf8');
  assert.match(source, /min-h-\[100svh\]/);
  assert.match(source, /pb-\[env\(safe-area-inset-bottom\)\]/);
  assert.match(source, /lg:absolute lg:inset-0/);
  assert.match(source, /relative top-auto w-full pointer-events-auto flex min-h-full flex-col lg:absolute/);
});
