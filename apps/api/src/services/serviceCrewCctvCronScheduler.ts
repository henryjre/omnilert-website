import crypto from 'crypto';

export const SERVICE_CREW_CCTV_HOURLY_JOB_NAME = 'service_crew_cctv_hourly_audit';

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface ServiceCrewCctvOccurrence {
  hourKey: string;
  scheduledMinute: number;
  scheduledFor: Date;
}

export interface ServiceCrewCctvSchedulingDecision {
  currentOccurrence: ServiceCrewCctvOccurrence;
  nextOccurrence: ServiceCrewCctvOccurrence;
  scheduleCurrentHour: boolean;
  skipCurrentHour: boolean;
  nextOccurrenceToSchedule: ServiceCrewCctvOccurrence;
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

export function formatServiceCrewCctvHourKey(date: Date): string {
  const parts = getManilaHourParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}-${String(parts.hour).padStart(2, '0')}`;
}

export function getDeterministicServiceCrewCctvMinute(jobName: string, hourKey: string): number {
  const digest = crypto.createHash('sha256').update(`${jobName}:${hourKey}`).digest();
  return digest.readUInt32BE(0) % 60;
}

export function getServiceCrewCctvOccurrenceForHour(
  date: Date,
  jobName: string,
  hourOffset = 0,
): ServiceCrewCctvOccurrence {
  const hourStart = getManilaHourStart(date, hourOffset);
  const hourKey = formatServiceCrewCctvHourKey(hourStart);
  const scheduledMinute = getDeterministicServiceCrewCctvMinute(jobName, hourKey);

  return {
    hourKey,
    scheduledMinute,
    scheduledFor: new Date(hourStart.getTime() + scheduledMinute * 60 * 1000),
  };
}

export function getServiceCrewCctvSchedulingDecision(
  now: Date,
  jobName: string,
): ServiceCrewCctvSchedulingDecision {
  const currentOccurrence = getServiceCrewCctvOccurrenceForHour(now, jobName);
  const nextOccurrence = getServiceCrewCctvOccurrenceForHour(now, jobName, 1);
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
