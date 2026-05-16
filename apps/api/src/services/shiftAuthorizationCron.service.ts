import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { notifyCronJobRun } from './cronNotification.service.js';
import {
  EXPIRING_EMPLOYEE_REASON_AUTH_TYPES,
  createShiftAuthorizationRejectResolver,
  hasSubmittedEmployeeReason,
  reconcileOvertimeForShift,
  shouldReconcileManagedOvertimeForAuthType,
} from './shiftAuthorizationResolution.service.js';

let cronHandle: NodeJS.Timeout | null = null;
const SHIFT_AUTH_EXPIRY_JOB_NAME = 'shift-authorization-expiry';
const SHIFT_AUTH_EXPIRY_REASON =
  'System generated rejection: No employee reason provided within 24 hours.';
const EMPLOYEE_REASON_EXPIRY_WINDOW_MS = 24 * 60 * 60 * 1000;

type ShiftAuthorizationExpiryRunnerDeps = {
  now: () => Date;
  listPendingReasonRequiredAuthorizations: () => Promise<Array<Record<string, unknown>>>;
  rejectAuthorization: (input: {
    auth: Record<string, unknown>;
    reason: string;
    resolvedAt: Date;
    resolvedBy: string | null;
    resolvedByName: string;
    companyId?: string | null;
  }) => Promise<unknown>;
  reconcileManagedOvertime: typeof reconcileOvertimeForShift;
  notifyCronJobRun: typeof notifyCronJobRun;
  logInfo: (context: Record<string, unknown>, message: string) => void;
  logError: (context: Record<string, unknown>, message: string) => void;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const defaultShiftAuthorizationExpiryRunnerDeps: ShiftAuthorizationExpiryRunnerDeps = {
  now: () => new Date(),
  listPendingReasonRequiredAuthorizations: async () =>
    (await db.getDb()('shift_authorizations')
      .where({ status: 'pending', needs_employee_reason: true })
      .select('*')) as Array<Record<string, unknown>>,
  rejectAuthorization: createShiftAuthorizationRejectResolver(),
  reconcileManagedOvertime: reconcileOvertimeForShift,
  notifyCronJobRun,
  logInfo: (context, message) => {
    logger.info(context, message);
  },
  logError: (context, message) => {
    logger.error(context, message);
  },
};

function isExpiredMissingEmployeeReasonAuthorization(
  auth: Record<string, unknown>,
  cutoffTime: number,
): boolean {
  const authType = String(auth.auth_type ?? '').trim();
  if (!EXPIRING_EMPLOYEE_REASON_AUTH_TYPES.has(authType)) {
    return false;
  }
  if (String(auth.status ?? '').trim() !== 'pending') {
    return false;
  }
  if (!auth.needs_employee_reason) {
    return false;
  }
  if (hasSubmittedEmployeeReason(auth)) {
    return false;
  }

  const createdAt = new Date(String(auth.created_at ?? ''));
  if (Number.isNaN(createdAt.getTime())) {
    return false;
  }

  return createdAt.getTime() < cutoffTime;
}

export function createShiftAuthorizationExpiryRunner(
  overrides: Partial<ShiftAuthorizationExpiryRunnerDeps> = {},
) {
  const deps: ShiftAuthorizationExpiryRunnerDeps = {
    ...defaultShiftAuthorizationExpiryRunnerDeps,
    ...overrides,
  };

  return async function runShiftAuthorizationExpiryRun(
    input: { source?: 'scheduled' | 'startup' } = {},
  ): Promise<void> {
    const source: 'scheduled' | 'startup' = input.source ?? 'scheduled';
    const startedAt = deps.now();

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const failures: Array<{ authId: string | null; error: string }> = [];

    try {
      const now = deps.now();
      const cutoffTime = now.getTime() - EMPLOYEE_REASON_EXPIRY_WINDOW_MS;
      const candidateRows = await deps.listPendingReasonRequiredAuthorizations();
      const expiredRows = candidateRows.filter((auth) =>
        isExpiredMissingEmployeeReasonAuthorization(auth, cutoffTime),
      );

      for (const auth of expiredRows) {
        processed += 1;
        try {
          const resolvedAt = deps.now();
          await deps.rejectAuthorization({
            auth,
            reason: SHIFT_AUTH_EXPIRY_REASON,
            resolvedAt,
            resolvedBy: null,
            resolvedByName: 'System',
            companyId: typeof auth.company_id === 'string' ? auth.company_id : null,
          });
          if (shouldReconcileManagedOvertimeForAuthType(auth.auth_type)) {
            await deps.reconcileManagedOvertime({
              shiftId: String(auth.shift_id ?? ''),
              triggeringAuth: auth,
            });
          }
          succeeded += 1;
        } catch (err) {
          failed += 1;
          failures.push({
            authId: typeof auth.id === 'string' ? auth.id : null,
            error: toErrorMessage(err),
          });
          deps.logError({ err, authId: auth.id }, 'Failed to process shift authorization expiry');
        }
      }

      if (processed > 0) {
        deps.logInfo({ processed, succeeded, failed }, 'Shift authorizations expiry run completed');
      }
    } catch (error) {
      deps.logError({ err: error }, 'Shift authorizations expiry cron run failed');
      failed += 1;
      failures.push({
        authId: null,
        error: toErrorMessage(error),
      });
    }

    const finishedAt = deps.now();
    const status: 'success' | 'failed' = failed > 0 ? 'failed' : 'success';
    const errorMessage = failed > 0
      ? JSON.stringify({ failed, failures })
      : null;

    await deps.notifyCronJobRun({
      jobName: SHIFT_AUTH_EXPIRY_JOB_NAME,
      jobFamily: 'shift_authorization_expiry' as any,
      schedule: '*/30 * * * *',
      source,
      startedAt,
      finishedAt,
      status,
      message:
        status === 'failed'
          ? 'Shift authorization expiry cron run failed'
          : 'Shift authorization expiry cron run completed',
      errorMessage,
      stats: {
        processed,
        succeeded,
        failed,
        skipped: 0,
      },
    });
  };
}

export const runShiftAuthorizationExpiryRun = createShiftAuthorizationExpiryRunner();

export function initShiftAuthorizationCron(): void {
  if (cronHandle) return;
  void runShiftAuthorizationExpiryRun({ source: 'startup' });
  cronHandle = setInterval(() => {
    void runShiftAuthorizationExpiryRun({ source: 'scheduled' });
  }, 30 * 60 * 1000);
  logger.info('Shift authorization expiry cron initialized (every 30 minutes)');
}

export function stopShiftAuthorizationCron(): void {
  if (!cronHandle) return;
  clearInterval(cronHandle);
  cronHandle = null;
}
