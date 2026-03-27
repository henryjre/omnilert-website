import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

async function readJson(path) {
  const content = await readFile(path, 'utf8');
  return JSON.parse(content);
}

test('turbo dev builds dependency packages before starting app dev tasks', async () => {
  const turboConfig = await readJson(new URL('../turbo.json', import.meta.url));

  assert.deepEqual(turboConfig.tasks.dev.dependsOn, ['^build']);
});

test('shared package exposes a dev script so root turbo dev starts it too', async () => {
  const sharedPackage = await readJson(new URL('../packages/shared/package.json', import.meta.url));

  assert.equal(typeof sharedPackage.scripts.dev, 'string');
  assert.match(sharedPackage.scripts.dev, /tsc/);
});
