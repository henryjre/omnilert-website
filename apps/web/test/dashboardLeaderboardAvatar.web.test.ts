import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAvatarDisplay } from '../src/features/dashboard/components/epi/avatarDisplay';

test('prefers the profile image when avatarUrl is provided', () => {
  const avatar = resolveAvatarDisplay({
    firstName: 'Ada',
    lastName: 'Lovelace',
    avatarUrl: 'https://cdn.example.com/ada.jpg',
  });

  assert.deepEqual(avatar, {
    imageUrl: 'https://cdn.example.com/ada.jpg',
    initials: 'AL',
  });
});

test('falls back to initials when avatarUrl is missing', () => {
  const avatar = resolveAvatarDisplay({
    firstName: 'Ada',
    lastName: 'Lovelace',
    avatarUrl: null,
  });

  assert.deepEqual(avatar, {
    imageUrl: null,
    initials: 'AL',
  });
});

test('treats blank avatar urls as missing', () => {
  const avatar = resolveAvatarDisplay({
    firstName: 'Ada',
    lastName: 'Lovelace',
    avatarUrl: '   ',
  });

  assert.deepEqual(avatar, {
    imageUrl: null,
    initials: 'AL',
  });
});
