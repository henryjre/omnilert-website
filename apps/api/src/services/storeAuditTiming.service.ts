export function buildProcessStoreAuditClaimUpdate(input: {
  userId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();

  return {
    status: 'processing' as const,
    auditor_user_id: input.userId,
    processing_started_at: now,
    updated_at: now,
  };
}

export function buildCompletedStoreAuditTimestamps(completedAt: Date = new Date()) {
  return {
    completed_at: completedAt,
    updated_at: completedAt,
  };
}
