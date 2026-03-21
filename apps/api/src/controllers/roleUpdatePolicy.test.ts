import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRoleUpdates } from './roleUpdatePolicy.js';

test('buildRoleUpdates includes editable role fields when provided', () => {
  const updates = buildRoleUpdates({
    name: 'Operations Lead',
    color: '#123456',
    priority: 42,
  });

  assert.equal(updates.name, 'Operations Lead');
  assert.equal(updates.color, '#123456');
  assert.equal(updates.priority, 42);
  assert.ok(updates.updated_at instanceof Date);
});

test('buildRoleUpdates omits fields that are not provided', () => {
  const updates = buildRoleUpdates({});

  assert.deepEqual(Object.keys(updates).sort(), ['updated_at']);
});

test('buildRoleUpdates keeps system-role style renames in the payload', () => {
  const updates = buildRoleUpdates({ name: 'Administrator+' });

  assert.equal(updates.name, 'Administrator+');
});
