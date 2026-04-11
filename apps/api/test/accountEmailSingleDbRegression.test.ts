import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const accountControllerPath = path.resolve(testDir, '..', 'src', 'controllers', 'account.controller.ts');

test('updateAccountEmail reads sensitive profile fields from user_sensitive_info', () => {
  const source = fs.readFileSync(accountControllerPath, 'utf8');
  const updateAccountEmailBlock = source.slice(
    source.indexOf('export async function updateAccountEmail'),
    source.indexOf('export async function submitPersonalInformationVerification'),
  );

  assert.match(
    updateAccountEmailBlock,
    /masterDb\('users as users'\)\s*\.leftJoin\('user_sensitive_info as usi', 'usi\.user_id', 'users\.id'\)/s,
    'updateAccountEmail should join user_sensitive_info so single-db sensitive columns come from the correct table',
  );
  assert.match(
    updateAccountEmailBlock,
    /'users\.user_key'[\s\S]*'users\.mobile_number'[\s\S]*'usi\.legal_name'[\s\S]*'usi\.birthday'[\s\S]*'usi\.gender'/,
    'updateAccountEmail should select Odoo sync fields from users + user_sensitive_info aliases',
  );
  assert.doesNotMatch(
    updateAccountEmailBlock,
    /first\([\s\S]*'legal_name'[\s\S]*'birthday'[\s\S]*'gender'[\s\S]*\)/,
    'updateAccountEmail should not select removed sensitive columns directly from users',
  );
});
