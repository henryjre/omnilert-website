import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET ??= "test-jwt-secret-12345";
process.env.JWT_REFRESH_SECRET ??= "test-jwt-refresh-secret";
process.env.SUPER_ADMIN_BOOTSTRAP_SECRET ??= "test-bootstrap-secret-1234567890";
process.env.SUPER_ADMIN_JWT_SECRET ??= "test-super-admin-jwt-secret-123456";
process.env.ODOO_DB ??= "test-odoo-db";
process.env.ODOO_URL ??= "http://localhost:8069";
process.env.ODOO_USERNAME ??= "test-odoo-user@example.com";
process.env.ODOO_PASSWORD ??= "test-odoo-password";
process.env.OPENAI_API_KEY ??= "test-openai-key";
process.env.OPENAI_ORGANIZATION_ID ??= "test-openai-org";
process.env.OPENAI_PROJECT_ID ??= "test-openai-project";

const {
  normalizeOptionalUserKey,
  resolveProvidedUserKeyEmployeeNumberOrThrow,
  selectApprovalCanonicalUsers,
} = await import("./registration.service.js");

test("normalizeOptionalUserKey returns undefined for missing input", () => {
  assert.equal(normalizeOptionalUserKey(undefined), undefined);
  assert.equal(normalizeOptionalUserKey("   "), undefined);
});

test("normalizeOptionalUserKey returns UUID when valid", () => {
  const userKey = "7ceced51-2dc6-49fa-a38f-8798978f8763";
  assert.equal(normalizeOptionalUserKey(userKey), userKey);
});

test("normalizeOptionalUserKey throws for invalid UUID", () => {
  assert.throws(
    () => normalizeOptionalUserKey("not-a-uuid"),
    /Invalid user key/i,
  );
});

test("selectApprovalCanonicalUsers prefers userKey owner and marks email user as duplicate", () => {
  const decision = selectApprovalCanonicalUsers({
    existingByEmail: {
      id: "email-user-id",
      email: "registered@example.com",
      user_key: "f33c7d3e-049d-4f66-b5f8-9f664c5b18cc",
      employee_number: 22,
    },
    existingByUserKey: {
      id: "key-owner-id",
      email: "old-owner@example.com",
      user_key: "0f902f5f-77f2-4da9-9f95-9fae45a15829",
      employee_number: 77,
    },
  });

  assert.deepEqual(decision, {
    canonicalUserId: "key-owner-id",
    duplicateUserId: "email-user-id",
  });
});

test("selectApprovalCanonicalUsers keeps email user when no userKey owner exists", () => {
  const decision = selectApprovalCanonicalUsers({
    existingByEmail: {
      id: "email-user-id",
      email: "registered@example.com",
      user_key: null,
      employee_number: 10,
    },
    existingByUserKey: null,
  });

  assert.deepEqual(decision, {
    canonicalUserId: "email-user-id",
    duplicateUserId: null,
  });
});

test("selectApprovalCanonicalUsers returns nulls when both users are absent", () => {
  const decision = selectApprovalCanonicalUsers({
    existingByEmail: null,
    existingByUserKey: null,
  });

  assert.deepEqual(decision, {
    canonicalUserId: null,
    duplicateUserId: null,
  });
});

test("resolveProvidedUserKeyEmployeeNumberOrThrow uses provided number when no existing number", () => {
  const resolved = resolveProvidedUserKeyEmployeeNumberOrThrow({
    providedEmployeeNumber: 31,
    existingIdentityEmployeeNumber: null,
  });
  assert.equal(resolved, 31);
});

test("resolveProvidedUserKeyEmployeeNumberOrThrow reuses existing number when none provided", () => {
  const resolved = resolveProvidedUserKeyEmployeeNumberOrThrow({
    existingIdentityEmployeeNumber: 44,
  });
  assert.equal(resolved, 44);
});

test("resolveProvidedUserKeyEmployeeNumberOrThrow returns null when no number is available", () => {
  const resolved = resolveProvidedUserKeyEmployeeNumberOrThrow({
    existingIdentityEmployeeNumber: null,
  });
  assert.equal(resolved, null);
});

test("resolveProvidedUserKeyEmployeeNumberOrThrow throws on mismatch with existing identity number", () => {
  assert.throws(
    () =>
      resolveProvidedUserKeyEmployeeNumberOrThrow({
        providedEmployeeNumber: 12,
        existingIdentityEmployeeNumber: 22,
      }),
    /does not match existing identity employee number/i,
  );
});
