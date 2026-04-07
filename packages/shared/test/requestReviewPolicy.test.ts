import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REQUEST_REVIEW_SELF_EXCEPTION_USER_ID,
  canReviewSubmittedRequest,
} from '../src/policies/requestReviewPolicy.js';

test('blocks regular users from reviewing their own submitted requests', () => {
  assert.equal(
    canReviewSubmittedRequest({
      actingUserId: 'user-1',
      requestUserId: 'user-1',
    }),
    false,
  );
});

test('allows users to review requests created by someone else', () => {
  assert.equal(
    canReviewSubmittedRequest({
      actingUserId: 'reviewer-1',
      requestUserId: 'requester-1',
    }),
    true,
  );
});

test('allows the self-review exception user to review their own submitted requests', () => {
  assert.equal(
    canReviewSubmittedRequest({
      actingUserId: REQUEST_REVIEW_SELF_EXCEPTION_USER_ID,
      requestUserId: REQUEST_REVIEW_SELF_EXCEPTION_USER_ID,
    }),
    true,
  );
});

test('allows review when the request has no recorded owner', () => {
  assert.equal(
    canReviewSubmittedRequest({
      actingUserId: 'reviewer-2',
      requestUserId: null,
    }),
    true,
  );
});
