import { db } from '../config/database.js';

export function toUtcDateBucket(value: string | Date): string {
  return new Date(value).toISOString().split('T')[0];
}

export function getUtcDateBucketRange(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`Invalid UTC date bucket: ${date}`);
  }

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return { start, end };
}

export async function getTotalEndedBreakMinutesByUserAndDate(
  userId: string,
  date: string,
): Promise<number> {
  const normalizedUserId = String(userId ?? '').trim();
  if (!normalizedUserId) {
    return 0;
  }

  const { start, end } = getUtcDateBucketRange(date);
  const tenantDb = db.getDb();

  const shifts = (await tenantDb('employee_shifts')
    .where({ user_id: normalizedUserId })
    .where('shift_start', '>=', start)
    .where('shift_start', '<', end)
    .select('id')) as Array<{ id: string }>;

  const shiftIds = shifts
    .map((shift) => String(shift.id ?? '').trim())
    .filter((shiftId) => shiftId.length > 0);
  if (shiftIds.length === 0) {
    return 0;
  }

  const breakActivities = (await tenantDb('shift_activities')
    .whereIn('shift_id', shiftIds)
    .where({ activity_type: 'break' })
    .whereNotNull('end_time')
    .select('duration_minutes')) as Array<{ duration_minutes?: number | null }>;

  return breakActivities.reduce((sum, activity) => sum + (Number(activity.duration_minutes) || 0), 0);
}
