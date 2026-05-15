import { db } from '../config/database.js';
import { getIO } from '../config/socket.js';
import { logger } from '../utils/logger.js';
import { notifyCronJobRun } from './cronNotification.service.js';

let cronHandle: NodeJS.Timeout | null = null;
const SHIFT_ABSENCE_JOB_NAME = 'shift-absence-marker';
const SHIFT_ABSENCE_SCHEDULE = '*/30 * * * *';

type ShiftAbsenceCandidate = {
  id: string;
  company_id: string;
  branch_id: string;
  user_id: string | null;
  status: string;
};

type MarkShiftAbsentResult = ShiftAbsenceCandidate & {
  check_in_status: string | null;
  total_worked_hours: number;
  updated_at: Date;
};

type ShiftAbsenceRunnerDeps = {
  now: () => Date;
  listAbsentCandidates: (now: Date) => Promise<ShiftAbsenceCandidate[]>;
  markShiftAbsent: (input: { shiftId: string; now: Date }) => Promise<MarkShiftAbsentResult | null>;
  createAbsenceLog: (input: { shift: ShiftAbsenceCandidate; eventTime: Date }) => Promise<Record<string, unknown>>;
  emitSocketEvent: (event: string, payload: Record<string, unknown>) => void;
  notifyCronJobRun: typeof notifyCronJobRun;
  logInfo: (context: Record<string, unknown>, message: string) => void;
  logError: (context: Record<string, unknown>, message: string) => void;
};

const defaultShiftAbsenceRunnerDeps: ShiftAbsenceRunnerDeps = {
  now: () => new Date(),
  listAbsentCandidates: async (now) => {
    const tenantDb = db.getDb();
    return (await tenantDb('employee_shifts as shift')
      .where('shift.status', 'open')
      .where('shift.shift_end', '<=', now)
      .whereNotIn(
        'shift.id',
        tenantDb('shift_logs')
          .where({ log_type: 'check_in' })
          .whereNotNull('shift_id')
          .select('shift_id'),
      )
      .select(
        'shift.id',
        'shift.company_id',
        'shift.branch_id',
        'shift.user_id',
        'shift.status',
      )) as ShiftAbsenceCandidate[];
  },
  markShiftAbsent: async ({ shiftId, now }) =>
    ((await db
      .getDb()('employee_shifts')
      .where({ id: shiftId, status: 'open' })
      .update({
        status: 'absent',
        check_in_status: null,
        total_worked_hours: 0,
        updated_at: now,
      })
      .returning('*'))[0] ?? null) as MarkShiftAbsentResult | null,
  createAbsenceLog: async ({ shift, eventTime }) =>
    ((await db
      .getDb()('shift_logs')
      .insert({
        company_id: shift.company_id,
        shift_id: shift.id,
        branch_id: shift.branch_id,
        log_type: 'shift_updated',
        changes: JSON.stringify({
          status: { from: 'open', to: 'absent' },
          reason: 'no_check_in_by_shift_end',
        }),
        event_time: eventTime,
        odoo_payload: JSON.stringify({}),
      })
      .returning('*'))[0] ?? {}) as Record<string, unknown>,
  emitSocketEvent: (event, payload) => {
    try {
      getIO()
        .of('/employee-shifts')
        .to(`branch:${String(payload.branch_id ?? '')}`)
        .emit(event as any, payload as any);
    } catch {
      logger.warn('Socket.IO unavailable for shift absence emit');
    }
  },
  notifyCronJobRun,
  logInfo: (context, message) => {
    logger.info(context, message);
  },
  logError: (context, message) => {
    logger.error(context, message);
  },
};

export function createShiftAbsenceRunner(overrides: Partial<ShiftAbsenceRunnerDeps> = {}) {
  const deps: ShiftAbsenceRunnerDeps = {
    ...defaultShiftAbsenceRunnerDeps,
    ...overrides,
  };

  return async function runShiftAbsenceRun(
    input: { source?: 'scheduled' | 'startup' } = {},
  ): Promise<void> {
    const source: 'scheduled' | 'startup' = input.source ?? 'scheduled';
    const startedAt = deps.now();

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    try {
      const now = deps.now();
      const candidates = await deps.listAbsentCandidates(now);

      for (const shift of candidates) {
        processed += 1;
        try {
          const updated = await deps.markShiftAbsent({ shiftId: shift.id, now });
          if (!updated) {
            skipped += 1;
            continue;
          }
          const absenceLog = await deps.createAbsenceLog({ shift, eventTime: now });
          deps.emitSocketEvent('shift:updated', updated as unknown as Record<string, unknown>);
          deps.emitSocketEvent('shift:log-new', absenceLog);
          succeeded += 1;
        } catch (err) {
          failed += 1;
          deps.logError({ err, shiftId: shift.id }, 'Failed to mark shift absent');
        }
      }

      if (processed > 0) {
        deps.logInfo(
          { processed, succeeded, failed, skipped },
          'Shift absence cron run completed',
        );
      }
    } catch (err) {
      failed += 1;
      deps.logError({ err }, 'Shift absence cron run failed');
    }

    const finishedAt = deps.now();
    const status: 'success' | 'failed' = failed > 0 ? 'failed' : 'success';

    await deps.notifyCronJobRun({
      jobName: SHIFT_ABSENCE_JOB_NAME,
      jobFamily: 'shift_absence',
      schedule: SHIFT_ABSENCE_SCHEDULE,
      source,
      startedAt,
      finishedAt,
      status,
      message:
        status === 'failed'
          ? 'Shift absence cron run failed'
          : 'Shift absence cron run completed',
      errorMessage: status === 'failed' ? `Failed processing ${failed} shifts` : null,
      stats: {
        processed,
        succeeded,
        failed,
        skipped,
      },
    });
  };
}

export const runShiftAbsenceRun = createShiftAbsenceRunner();

export function initShiftAbsenceCron(): void {
  if (cronHandle) return;
  void runShiftAbsenceRun({ source: 'startup' });
  cronHandle = setInterval(() => {
    void runShiftAbsenceRun({ source: 'scheduled' });
  }, 30 * 60 * 1000);
  logger.info('Shift absence cron initialized (every 30 minutes)');
}

export function stopShiftAbsenceCron(): void {
  if (!cronHandle) return;
  clearInterval(cronHandle);
  cronHandle = null;
}
