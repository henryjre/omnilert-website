import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('index routes wire the discord integration route namespace', () => {
  const routeFile = new URL('../src/routes/index.ts', import.meta.url);
  const source = readFileSync(routeFile, 'utf8');

  assert.match(source, /import discordIntegrationRoutes from '\.\/discordIntegration\.routes\.js';/);
  assert.match(source, /router\.use\('\/integrations\/discord', discordIntegrationRoutes\);/);
});

test('app applies dedicated discord integration rate limiting', () => {
  const appFile = new URL('../src/app.ts', import.meta.url);
  const source = readFileSync(appFile, 'utf8');

  assert.match(source, /'\/api\/v1\/integrations\/discord'/);
  assert.match(source, /max:\s*120/);
});

test('env configuration includes optional discord bot api token', () => {
  const envConfigFile = new URL('../src/config/env.ts', import.meta.url);
  const envExampleFile = new URL('../.env.example', import.meta.url);
  const envConfigSource = readFileSync(envConfigFile, 'utf8');
  const envExampleSource = readFileSync(envExampleFile, 'utf8');

  assert.match(envConfigSource, /DISCORD_BOT_API_TOKEN:\s*z\.string\(\)\.optional\(\)/);
  assert.match(envExampleSource, /DISCORD_BOT_API_TOKEN=/);
});
