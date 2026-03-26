import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAccessTokenClaims } from '../src/features/auth/store/accessTokenClaims';

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function buildToken(payload: unknown): string {
  const header = encodeJson({ alg: 'none', typ: 'JWT' });
  return `${header}.${encodeJson(payload)}.signature`;
}

test('parseAccessTokenClaims extracts permissions, branch ids, and company slug', () => {
  const token = buildToken({
    permissions: ['admin.view_all_branches', 'admin.manage_departments'],
    branchIds: ['branch-1', 'branch-2'],
    companySlug: 'omnilert',
  });

  const claims = parseAccessTokenClaims(token);

  assert.deepEqual(claims, {
    permissions: ['admin.view_all_branches', 'admin.manage_departments'],
    branchIds: ['branch-1', 'branch-2'],
    companySlug: 'omnilert',
  });
});

test('parseAccessTokenClaims ignores malformed payloads', () => {
  assert.deepEqual(parseAccessTokenClaims('not-a-jwt'), {});
  assert.deepEqual(parseAccessTokenClaims('a.b.c'), {});
});

test('parseAccessTokenClaims filters non-string array values', () => {
  const token = buildToken({
    permissions: ['admin.view_all_branches', 123, null],
    branchIds: ['branch-1', false, 456],
  });

  const claims = parseAccessTokenClaims(token);

  assert.deepEqual(claims, {
    permissions: ['admin.view_all_branches'],
    branchIds: ['branch-1'],
  });
});

