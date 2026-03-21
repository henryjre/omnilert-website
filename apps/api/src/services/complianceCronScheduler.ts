import crypto from 'crypto';

export const COMPLIANCE_HOURLY_JOB_NAME = 'compliance_hourly_audit';

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface ComplianceOccurrence {
  hourKey: string;
  scheduledMinute: number;
  scheduledFor: Date;
}

export interface ComplianceSchedulingDecision {
  currentOccurrence: ComplianceOccurrence;
  nextOccurrence: ComplianceOccurrence;
  scheduleCurrentHour: boolean;
  skipCurrentHour: boolean;
  nextOccurrenceToSchedule: ComplianceOccurrence;
}

interface ManilaHourParts {
  year: number;
  month: number;
  day: number;
  hour: number;
}

function getManilaHourParts(date: Date): ManilaHourParts {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  };
}

function getManilaHourStart(date: Date, hourOffset = 0): Date {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
  shifted.setUTCMinutes(0, 0, 0);
  shifted.setUTCHours(shifted.getUTCHours() + hourOffset);
  return new Date(shifted.getTime() - MANILA_OFFSET_MS);
}

export function formatComplianceHourKey(date: Date): string {
  const parts = getManilaHourParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}-${String(parts.hour).padStart(2, '0')}`;
}

export function getDeterministicComplianceMinute(jobName: string, hourKey: string): number {
  const digest = crypto.createHash('sha256').update(`${jobName}:${hourKey}`).digest();
  return digest.readUInt32BE(0) % 60;
}

export function getComplianceOccurrenceForHour(
  date: Date,
  jobName: string,
  hourOffset = 0,
): ComplianceOccurrence {
  const hourStart = getManilaHourStart(date, hourOffset);
  const hourKey = formatComplianceHourKey(hourStart);
  const scheduledMinute = getDeterministicComplianceMinute(jobName, hourKey);

  return {
    hourKey,
    scheduledMinute,
    scheduledFor: new Date(hourStart.getTime() + scheduledMinute * 60 * 1000),
  };
}

export function getComplianceSchedulingDecision(
  now: Date,
  jobName: string,
): ComplianceSchedulingDecision {
  const currentOccurrence = getComplianceOccurrenceForHour(now, jobName);
  const nextOccurrence = getComplianceOccurrenceForHour(now, jobName, 1);
  const scheduleCurrentHour = currentOccurrence.scheduledFor.getTime() > now.getTime();
  const skipCurrentHour = !scheduleCurrentHour;

  return {
    currentOccurrence,
    nextOccurrence,
    scheduleCurrentHour,
    skipCurrentHour,
    nextOccurrenceToSchedule: scheduleCurrentHour ? currentOccurrence : nextOccurrence,
  };
}
