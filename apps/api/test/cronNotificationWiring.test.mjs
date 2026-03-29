import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('env config and example include cron webhook settings', () => {
  const envConfigFile = new URL('../src/config/env.ts', import.meta.url);
  const envExampleFile = new URL('../.env.example', import.meta.url);
  const envConfigSource = readFileSync(envConfigFile, 'utf8');
  const envExampleSource = readFileSync(envExampleFile, 'utf8');

  assert.match(envConfigSource, /DISCORD_BOT_CRON_WEBHOOK_URL:\s*z\.string\(\)\.url\(\)\.optional\(\)/);
  assert.match(envConfigSource, /DISCORD_BOT_CRON_WEBHOOK_TOKEN:\s*z\.string\(\)\.optional\(\)/);
  assert.match(envConfigSource, /DISCORD_BOT_CRON_WEBHOOK_TIMEOUT_MS:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.default\(5000\)/);

  assert.match(envExampleSource, /DISCORD_BOT_CRON_WEBHOOK_URL=/);
  assert.match(envExampleSource, /DISCORD_BOT_CRON_WEBHOOK_TOKEN=/);
  assert.match(envExampleSource, /DISCORD_BOT_CRON_WEBHOOK_TIMEOUT_MS=5000/);
});

test('compliance cron wires shared cron notifier for success and failure events', () => {
  const file = new URL('../src/services/complianceCron.service.ts', import.meta.url);
  const source = readFileSync(file, 'utf8');

  assert.match(source, /import\s+\{\s*notifyCronJobRun\s*\}\s+from '\.\/cronNotification\.service\.js';/);
  assert.match(source, /notifyResult:\s*async\s*\(result\)\s*=>\s*\{\s*await notifyCronJobRun\(/);
  assert.match(source, /jobFamily:\s*'compliance'/);
});

test('epi snapshot cron sends notifications from scheduled job runner', () => {
  const file = new URL('../src/services/epiSnapshotCron.service.ts', import.meta.url);
  const source = readFileSync(file, 'utf8');

  assert.match(source, /import\s+\{\s*notifyCronJobRun\s*\}\s+from '\.\/cronNotification\.service\.js';/);
  assert.match(source, /await notifyCronJobRun\(\{\s*jobName:\s*job\.name,\s*jobFamily:\s*'epi_snapshot'/s);
  assert.match(source, /schedule:\s*job\.expression/);
  assert.match(source, /status:\s*'failed'/);
});

test('peer evaluation expiry cron tracks source and notifies failures', () => {
  const file = new URL('../src/services/peerEvaluationCron.service.ts', import.meta.url);
  const source = readFileSync(file, 'utf8');

  assert.match(source, /const PEER_EVALUATION_EXPIRY_JOB_NAME = 'peer-evaluation-expiry';/);
  assert.match(source, /input:\s*\{\s*source\?:\s*'scheduled'\s*\|\s*'startup'\s*\}\s*=\s*\{\s*\},/);
  assert.match(source, /void runPeerEvaluationExpiryRun\(\{ source: 'startup' \}\);/);
  assert.match(source, /void runPeerEvaluationExpiryRun\(\{ source: 'scheduled' \}\);/);
  assert.match(source, /await notifyCronJobRun\(\{\s*jobName:\s*PEER_EVALUATION_EXPIRY_JOB_NAME,\s*jobFamily:\s*'peer_evaluation_expiry'/s);
});
