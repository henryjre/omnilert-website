import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const authorizationRequestControllerPath = path.join(srcDir, 'controllers', 'authorizationRequest.controller.ts');
const cashRequestControllerPath = path.join(srcDir, 'controllers', 'cashRequest.controller.ts');
const shiftAuthorizationControllerPath = path.join(srcDir, 'controllers', 'shiftAuthorization.controller.ts');
const authorizationRequestsPagePath = path.resolve(srcDir, '..', '..', 'web', 'src', 'features', 'authorization-requests', 'pages', 'AuthorizationRequestsPage.tsx');
const cashRequestsPagePath = path.resolve(srcDir, '..', '..', 'web', 'src', 'features', 'cash-requests', 'pages', 'CashRequestsPage.tsx');
const requestReviewPolicyPath = path.resolve(srcDir, '..', '..', '..', 'packages', 'shared', 'src', 'policies', 'requestReviewPolicy.ts');

test('authorization and cash review flows use the shared self-review policy', () => {
  const requestReviewPolicySource = fs.readFileSync(requestReviewPolicyPath, 'utf8');
  const authorizationRequestControllerSource = fs.readFileSync(authorizationRequestControllerPath, 'utf8');
  const shiftAuthorizationControllerSource = fs.readFileSync(shiftAuthorizationControllerPath, 'utf8');
  const cashRequestControllerSource = fs.readFileSync(cashRequestControllerPath, 'utf8');
  const authorizationRequestsPageSource = fs.readFileSync(authorizationRequestsPagePath, 'utf8');
  const cashRequestsPageSource = fs.readFileSync(cashRequestsPagePath, 'utf8');

  assert.match(
    requestReviewPolicySource,
    /REQUEST_REVIEW_SELF_EXCEPTION_USER_ID\s*=\s*'ff822208-5bfe-40df-9417-a9d66ac8d4ef'/,
    'shared request review policy should define the self-review exception user id',
  );
  assert.match(
    requestReviewPolicySource,
    /export function canReviewSubmittedRequest/,
    'shared request review policy should export canReviewSubmittedRequest',
  );
  assert.match(
    authorizationRequestControllerSource,
    /canReviewSubmittedRequest/,
    'authorizationRequest controller should use the shared self-review policy',
  );
  assert.match(
    shiftAuthorizationControllerSource,
    /canReviewSubmittedRequest/,
    'shiftAuthorization controller should use the shared self-review policy',
  );
  assert.match(
    cashRequestControllerSource,
    /canReviewSubmittedRequest/,
    'cashRequest controller should use the shared self-review policy',
  );
  assert.match(
    authorizationRequestsPageSource,
    /canReviewSubmittedRequest/,
    'AuthorizationRequestsPage should use the shared self-review policy',
  );
  assert.match(
    authorizationRequestsPageSource,
    /useAuthStore/,
    'AuthorizationRequestsPage should read the current user when deciding whether actions are available',
  );
  assert.match(
    cashRequestsPageSource,
    /canReviewSubmittedRequest/,
    'CashRequestsPage should use the shared self-review policy',
  );
  assert.match(
    cashRequestsPageSource,
    /useAuthStore/,
    'CashRequestsPage should read the current user when deciding whether actions are available',
  );
});
