import { db } from '../config/database.js';
import {
  getSnapshotDateForScheduledRun,
  runDailyEmployeeRollingMetricSnapshot,
} from '../services/employeeAnalyticsSnapshot.service.js';

const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

interface CliArgs {
  apply: boolean;
  all: boolean;
  fillGaps: boolean;
  date: string | null;
  from: string | null;
  to: string | null;
  limitDates: number | null;
}

interface SnapshotDateRow {
  snapshotDate: string;
}

function assertYmd(value: string, fieldName: string): string {
  if (!YMD_REGEX.test(value)) {
    throw new Error(`${fieldName} must be in YYYY-MM-DD format`);
  }
  return value;
}

function parseYmd(ymd: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) {
    throw new Error(`Invalid YMD format: ${ymd}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function normalizeRange(fromYmd: string, toYmd: string): { fromYmd: string; toYmd: string } {
  if (fromYmd <= toYmd) {
    return { fromYmd, toYmd };
  }
  return { fromYmd: toYmd, toYmd: fromYmd };
}

function snapshotYmdToScheduledFor(snapshotYmd: string): Date {
  const { year, month, day } = parseYmd(snapshotYmd);

  // Daily cron runs at 03:30 Manila. This UTC timestamp maps to that wall-clock
  // schedule while preserving the intended snapshot date in getSnapshotDateForScheduledRun.
  return new Date(Date.UTC(year, month - 1, day, 19, 30, 0, 0));
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let apply = false;
  let all = false;
  let fillGaps = false;
  let date: string | null = null;
  let from: string | null = null;
  let to: string | null = null;
  let limitDates: number | null = null;

  for (const arg of args) {
    if (arg === '--') {
      continue;
    }

    if (arg === '--apply') {
      apply = true;
      continue;
    }

    if (arg === '--dry-run') {
      apply = false;
      continue;
    }

    if (arg === '--all') {
      all = true;
      continue;
    }

    if (arg === '--fill-gaps') {
      fillGaps = true;
      continue;
    }

    if (arg.startsWith('--date=')) {
      date = assertYmd(arg.slice('--date='.length), 'date');
      continue;
    }

    if (arg.startsWith('--from=')) {
      from = assertYmd(arg.slice('--from='.length), 'from');
      continue;
    }

    if (arg.startsWith('--to=')) {
      to = assertYmd(arg.slice('--to='.length), 'to');
      continue;
    }

    if (arg.startsWith('--limit-dates=')) {
      const parsed = Number(arg.slice('--limit-dates='.length));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('limit-dates must be a positive integer');
      }
      limitDates = Math.floor(parsed);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (date && (all || fillGaps || from || to)) {
    throw new Error('date cannot be combined with all/fill-gaps/from/to');
  }

  if (all && (fillGaps || from || to)) {
    throw new Error('all cannot be combined with fill-gaps/from/to');
  }

  if (fillGaps && !from) {
    throw new Error('--fill-gaps requires --from (and optionally --to)');
  }

  if (!from && to) {
    from = to;
  }
  if (!to && from) {
    to = from;
  }

  return {
    apply,
    all,
    fillGaps,
    date,
    from,
    to,
    limitDates,
  };
}

function generateDateRange(fromYmd: string, toYmd: string): string[] {
  const dates: string[] = [];
  const { year: fy, month: fm, day: fd } = parseYmd(fromYmd);
  const { year: ty, month: tm, day: td } = parseYmd(toYmd);

  const current = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));

  while (current <= end) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, '0');
    const d = String(current.getUTCDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

async function listMissingSnapshotDates(fromYmd: string, toYmd: string): Promise<string[]> {
  const expected = new Set(generateDateRange(fromYmd, toYmd));
  const existing = await listDistinctSnapshotDates({ fromYmd, toYmd });
  const existingSet = new Set(existing);
  return [...expected].filter((d) => !existingSet.has(d)).sort();
}

async function getLatestSnapshotDate(): Promise<string | null> {
  const row = await db.getDb()('employee_metric_daily_snapshots as s')
    .select(db.getDb().raw('MAX(s.snapshot_date)::text as "snapshotDate"'))
    .first<{ snapshotDate?: string | null }>();

  if (!row?.snapshotDate || !YMD_REGEX.test(row.snapshotDate)) {
    return null;
  }

  return row.snapshotDate;
}

async function listDistinctSnapshotDates(input?: {
  fromYmd?: string;
  toYmd?: string;
}): Promise<string[]> {
  const query = db.getDb()('employee_metric_daily_snapshots as s')
    .distinct(db.getDb().raw('s.snapshot_date::text as "snapshotDate"'))
    .orderBy('snapshotDate', 'asc');

  if (input?.fromYmd && input?.toYmd) {
    query.whereBetween('s.snapshot_date', [input.fromYmd, input.toYmd]);
  }

  const rows = await query as SnapshotDateRow[];
  return rows
    .map((row) => row.snapshotDate)
    .filter((snapshotDate): snapshotDate is string => typeof snapshotDate === 'string' && YMD_REGEX.test(snapshotDate));
}

async function resolveTargetDates(args: CliArgs): Promise<string[]> {
  if (args.date) {
    return [args.date];
  }

  if (args.all) {
    return listDistinctSnapshotDates();
  }

  if (args.fillGaps && args.from && args.to) {
    const { fromYmd, toYmd } = normalizeRange(args.from, args.to);
    return listMissingSnapshotDates(fromYmd, toYmd);
  }

  if (args.from && args.to) {
    const { fromYmd, toYmd } = normalizeRange(args.from, args.to);
    return listDistinctSnapshotDates({ fromYmd, toYmd });
  }

  const latestSnapshotDate = await getLatestSnapshotDate();
  if (!latestSnapshotDate) {
    return [];
  }

  return [latestSnapshotDate];
}

async function run(): Promise<void> {
  const args = parseArgs();

  try {
    let targetDates = await resolveTargetDates(args);
    if (args.limitDates !== null) {
      targetDates = targetDates.slice(0, args.limitDates);
    }

    if (targetDates.length === 0) {
      console.log('No employee metric snapshots found for the selected scope.');
      return;
    }

    const summary = {
      mode: args.apply ? 'apply' : 'dry-run',
      totalDates: targetDates.length,
      firstDate: targetDates[0],
      lastDate: targetDates[targetDates.length - 1],
      sampleDates: targetDates.slice(0, 5),
    };

    if (!args.apply) {
      console.log('Employee metric snapshot backfill dry-run summary:');
      console.log(JSON.stringify(summary, null, 2));
      console.log('No rows were changed. Re-run with --apply to execute.');
      return;
    }

    for (let index = 0; index < targetDates.length; index += 1) {
      const snapshotDate = targetDates[index];
      if (!snapshotDate) continue;

      const scheduledFor = snapshotYmdToScheduledFor(snapshotDate);
      const resolvedSnapshotDate = getSnapshotDateForScheduledRun(scheduledFor);
      if (resolvedSnapshotDate !== snapshotDate) {
        throw new Error(
          `Snapshot date mapping mismatch for ${snapshotDate}. Resolved as ${resolvedSnapshotDate}.`,
        );
      }

      console.log(
        `[${index + 1}/${targetDates.length}] Recomputing snapshot ${snapshotDate} (scheduledFor=${scheduledFor.toISOString()})`,
      );
      await runDailyEmployeeRollingMetricSnapshot({ scheduledFor });
    }

    console.log('Employee metric snapshot backfill completed.');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await db.destroyAll();
  }
}

run().catch((error) => {
  console.error('Employee metric snapshot backfill failed:', error);
  process.exitCode = 1;
});
