import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRoleEditorDraft,
  hasRoleEditorChanges,
} from '../src/features/roles/pages/roleEditorState';

test('createRoleEditorDraft seeds editable fields and permission ids', () => {
  const draft = createRoleEditorDraft(
    {
      id: 'role-1',
      name: 'Branch Manager',
      color: '#ff0000',
      priority: 60,
      discord_id: '123456789012345678',
    },
    ['perm-2', 'perm-1'],
  );

  assert.deepEqual(draft, {
    name: 'Branch Manager',
    color: '#ff0000',
    priority: 60,
    discord_id: '123456789012345678',
    permissionIds: ['perm-1', 'perm-2'],
  });
});

test('hasRoleEditorChanges detects metadata edits', () => {
  const original = {
    name: 'Branch Manager',
    color: '#ff0000',
    priority: 60,
    discord_id: '',
    permissionIds: ['perm-1'],
  };

  assert.equal(
    hasRoleEditorChanges(original, {
      ...original,
      name: 'Senior Branch Manager',
    }),
    true,
  );
});

test('hasRoleEditorChanges ignores permission order-only differences', () => {
  const original = {
    name: 'Branch Manager',
    color: '#ff0000',
    priority: 60,
    discord_id: '',
    permissionIds: ['perm-1', 'perm-2'],
  };

  assert.equal(
    hasRoleEditorChanges(original, {
      ...original,
      permissionIds: ['perm-2', 'perm-1'],
    }),
    false,
  );
});

test('hasRoleEditorChanges detects discord id edits', () => {
  const original = {
    name: 'Branch Manager',
    color: '#ff0000',
    priority: 60,
    discord_id: '',
    permissionIds: ['perm-1'],
  };

  assert.equal(
    hasRoleEditorChanges(original, {
      ...original,
      discord_id: '123456789012345678',
    }),
    true,
  );
});
