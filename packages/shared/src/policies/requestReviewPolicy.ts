export const REQUEST_REVIEW_SELF_EXCEPTION_USER_ID = 'ff822208-5bfe-40df-9417-a9d66ac8d4ef';

function normalizeUserId(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

export function canReviewSubmittedRequest(input: {
  actingUserId: string | null | undefined;
  requestUserId: string | null | undefined;
}): boolean {
  const actingUserId = normalizeUserId(input.actingUserId);
  const requestUserId = normalizeUserId(input.requestUserId);

  if (!actingUserId || !requestUserId) {
    return true;
  }

  return actingUserId !== requestUserId || actingUserId === REQUEST_REVIEW_SELF_EXCEPTION_USER_ID;
}
