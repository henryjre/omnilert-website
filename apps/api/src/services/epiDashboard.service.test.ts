import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET ??= 'test-jwt-secret-12345';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.SUPER_ADMIN_BOOTSTRAP_SECRET ??= 'test-bootstrap-secret-1234567890';
process.env.SUPER_ADMIN_JWT_SECRET ??= 'test-super-admin-jwt-secret-123456';
process.env.ODOO_DB ??= 'test-odoo-db';
process.env.ODOO_URL ??= 'http://localhost:8069';
process.env.ODOO_USERNAME ??= 'test-odoo-user@example.com';
process.env.ODOO_PASSWORD ??= 'test-odoo-password';
process.env.OPENAI_API_KEY ??= 'test-openai-key';
process.env.OPENAI_ORGANIZATION_ID ??= 'test-openai-org';
process.env.OPENAI_PROJECT_ID ??= 'test-openai-project';

const {
  applyGlobalLeaderboardFilters,
  createGlobalAverageByMonth,
  createLeaderboardDetail,
  createLeaderboardSummaryEntries,
} = await import('./epiDashboard.service.js');

type DashboardCriteria = import('./epiDashboard.service.js').DashboardCriteria;
type HistoricalMonthEntry = import('./epiDashboard.service.js').HistoricalMonthEntry;
type LeaderboardDetailUserRow = import('./epiDashboard.service.js').LeaderboardDetailUserRow;
type GlobalAverageUserRow = import('./epiDashboard.service.js').GlobalAverageUserRow;
type LeaderboardSummaryUserRow = import('./epiDashboard.service.js').LeaderboardSummaryUserRow;

function createQueryRecorder() {
  const operations: Array<Record<string, unknown>> = [];

  const query = {
    where: (...args: unknown[]) => {
      operations.push({ type: 'where', args });
      return query;
    },
    whereExists: (callback: (subquery: any) => void) => {
      const nested: Array<Record<string, unknown>> = [];
      const subquery = {
        select: (...args: unknown[]) => {
          nested.push({ type: 'select', args });
          return subquery;
        },
        from: (...args: unknown[]) => {
          nested.push({ type: 'from', args });
          return subquery;
        },
        join: (...args: unknown[]) => {
          nested.push({ type: 'join', args });
          return subquery;
        },
        whereRaw: (...args: unknown[]) => {
          nested.push({ type: 'whereRaw', args });
          return subquery;
        },
        where: (...args: unknown[]) => {
          nested.push({ type: 'where', args });
          return subquery;
        },
      };

      callback(subquery);
      operations.push({ type: 'whereExists', nested });
      return query;
    },
  };

  return { operations, query };
}

function createCriteria(overrides: Partial<DashboardCriteria> = {}): DashboardCriteria {
  return {
    sqaaScore: 4.5,
    workplaceRelationsScore: 4.2,
    professionalConductScore: null,
    productivityRate: 96,
    punctualityRate: 98,
    attendanceRate: 99,
    aov: 120,
    branchAov: 110,
    violationCount: 0,
    awardCount: 1,
    uniformComplianceRate: 100,
    hygieneComplianceRate: 100,
    sopComplianceRate: 100,
    customerInteractionScore: null,
    cashieringScore: null,
    suggestiveSellingUpsellingScore: null,
    serviceEfficiencyScore: null,
    ...overrides,
  };
}

function createMonthlyHistory(monthKey: string, epiScore: number, criteria: DashboardCriteria): HistoricalMonthEntry {
  const [year, month] = monthKey.split('-');
  const monthNumber = Number(month);
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return {
    monthKey,
    monthLabel: labels[monthNumber - 1] ?? 'Jan',
    year: Number(year),
    epiScore,
    criteria,
  };
}

test('createLeaderboardSummaryEntries ranks the current month by official saved EPI', () => {
  const rows: LeaderboardSummaryUserRow[] = [
    {
      userId: 'user-1',
      fullName: 'Alex Crew',
      avatarUrl: null,
      officialEpiScore: 108,
      monthlyHistory: [],
    },
    {
      userId: 'user-2',
      fullName: 'Bianca Crew',
      avatarUrl: null,
      officialEpiScore: 111,
      monthlyHistory: [],
    },
  ];

  const summary = createLeaderboardSummaryEntries(rows, {
    currentUserId: 'user-1',
    monthKey: '2026-03',
    currentMonthKey: '2026-03',
  });

  assert.deepEqual(summary.map((entry) => ({
    userId: entry.userId,
    rank: entry.rank,
    displayEpiScore: entry.displayEpiScore,
    hasData: entry.hasData,
    isCurrentUser: entry.isCurrentUser,
  })), [
    { userId: 'user-2', rank: 1, displayEpiScore: 111, hasData: true, isCurrentUser: false },
    { userId: 'user-1', rank: 2, displayEpiScore: 108, hasData: true, isCurrentUser: true },
  ]);
});

test('createLeaderboardSummaryEntries ranks historical months by saved monthly history and pushes missing data to the bottom', () => {
  const highCriteria = createCriteria({ sqaaScore: 4.8 });
  const lowCriteria = createCriteria({ sqaaScore: 3.9 });

  const rows: LeaderboardSummaryUserRow[] = [
    {
      userId: 'user-1',
      fullName: 'Alex Crew',
      avatarUrl: null,
      officialEpiScore: 130,
      monthlyHistory: [createMonthlyHistory('2026-02', 104.5, lowCriteria)],
    },
    {
      userId: 'user-2',
      fullName: 'Bianca Crew',
      avatarUrl: null,
      officialEpiScore: 90,
      monthlyHistory: [],
    },
    {
      userId: 'user-3',
      fullName: 'Carlos Crew',
      avatarUrl: null,
      officialEpiScore: 99,
      monthlyHistory: [createMonthlyHistory('2026-02', 109.2, highCriteria)],
    },
  ];

  const summary = createLeaderboardSummaryEntries(rows, {
    currentUserId: 'user-2',
    monthKey: '2026-02',
    currentMonthKey: '2026-03',
  });

  assert.deepEqual(summary.map((entry) => ({
    userId: entry.userId,
    rank: entry.rank,
    displayEpiScore: entry.displayEpiScore,
    hasData: entry.hasData,
  })), [
    { userId: 'user-3', rank: 1, displayEpiScore: 109.2, hasData: true },
    { userId: 'user-1', rank: 2, displayEpiScore: 104.5, hasData: true },
    { userId: 'user-2', rank: 3, displayEpiScore: null, hasData: false },
  ]);
});

test('createLeaderboardDetail returns official current-month score with live criteria and projected EPI metadata', () => {
  const liveCriteria = createCriteria({ workplaceRelationsScore: 4.7, awardCount: 2 });
  const row: LeaderboardDetailUserRow = {
    userId: 'user-1',
    fullName: 'Alex Crew',
    avatarUrl: null,
    officialEpiScore: 112.4,
    monthlyHistory: [createMonthlyHistory('2026-02', 105.5, createCriteria({ sqaaScore: 4.1 }))],
  };

  const detail = createLeaderboardDetail({
    row,
    monthKey: '2026-03',
    currentMonthKey: '2026-03',
    currentLive: {
      monthKey: '2026-03',
      monthLabel: 'Mar',
      year: 2026,
      asOfDateTime: '2026-03-19T02:00:00.000Z',
      projectedEpiScore: 117.4,
      delta: 5,
      rawDelta: 5,
      capped: false,
      criteria: liveCriteria,
      wrsStatus: {
        effectiveCount: 2,
        delayedCount: 1,
      },
    },
  });

  assert.equal(detail?.epiScore, 112.4);
  assert.equal(detail?.projectedEpiScore, 117.4);
  assert.equal(detail?.scoreSource, 'official');
  assert.equal(detail?.criteriaSource, 'live');
  assert.equal(detail?.criteria.workplaceRelationsScore, 4.7);
  assert.deepEqual(detail?.wrsStatus, { effectiveCount: 2, delayedCount: 1 });
});

test('createLeaderboardDetail returns historical score and criteria for past months without live metadata', () => {
  const historicalCriteria = createCriteria({ workplaceRelationsScore: 3.8, awardCount: 0 });
  const row: LeaderboardDetailUserRow = {
    userId: 'user-1',
    fullName: 'Alex Crew',
    avatarUrl: null,
    officialEpiScore: 112.4,
    monthlyHistory: [createMonthlyHistory('2026-02', 106.2, historicalCriteria)],
  };

  const detail = createLeaderboardDetail({
    row,
    monthKey: '2026-02',
    currentMonthKey: '2026-03',
    currentLive: null,
  });

  assert.equal(detail?.epiScore, 106.2);
  assert.equal(detail?.scoreSource, 'historical');
  assert.equal(detail?.criteriaSource, 'historical');
  assert.equal(detail?.criteria.workplaceRelationsScore, 3.8);
  assert.equal(detail?.wrsStatus, null);
  assert.equal(detail?.asOfDateTime, null);
  assert.equal(detail?.projectedEpiScore, null);
});

test('applyGlobalLeaderboardFilters keeps the leaderboard global while still restricting to active service crew', () => {
  const { operations, query } = createQueryRecorder();
  const masterDb = {
    raw: (value: string) => value,
  };

  applyGlobalLeaderboardFilters(query as any, masterDb);

  assert.deepEqual(operations, [
    { type: 'where', args: ['u.is_active', true] },
    { type: 'where', args: ['u.employment_status', 'active'] },
    {
      type: 'whereExists',
      nested: [
        { type: 'select', args: ['1'] },
        { type: 'from', args: ['user_roles as ur'] },
        { type: 'join', args: ['roles as r', 'ur.role_id', 'r.id'] },
        { type: 'whereRaw', args: ['ur.user_id = u.id'] },
        { type: 'where', args: ['r.name', 'Service Crew'] },
      ],
    },
  ]);
});

test('createGlobalAverageByMonth computes rounded current and historical averages', () => {
  const rows: GlobalAverageUserRow[] = [
    {
      officialEpiScore: 110,
      monthlyHistory: [
        createMonthlyHistory('2026-02', 100, createCriteria()),
        createMonthlyHistory('2026-01', 90, createCriteria()),
      ],
    },
    {
      officialEpiScore: 100,
      monthlyHistory: [
        createMonthlyHistory('2026-02', 80, createCriteria()),
        createMonthlyHistory('2026-01', 96.33, createCriteria()),
      ],
    },
    {
      officialEpiScore: 95,
      monthlyHistory: [],
    },
  ];

  assert.deepEqual(createGlobalAverageByMonth(rows, '2026-03'), {
    '2026-01': 93.2,
    '2026-02': 90,
    '2026-03': 101.7,
  });
});

test('createGlobalAverageByMonth omits historical months with no data and handles empty input', () => {
  const rows: GlobalAverageUserRow[] = [
    {
      officialEpiScore: 103.4,
      monthlyHistory: [],
    },
    {
      officialEpiScore: 96.6,
      monthlyHistory: [],
    },
  ];

  assert.deepEqual(createGlobalAverageByMonth(rows, '2026-03'), {
    '2026-03': 100,
  });
  assert.deepEqual(createGlobalAverageByMonth([], '2026-03'), {});
});

test('createGlobalAverageByMonth does not double-count current month history entries', () => {
  const rows: GlobalAverageUserRow[] = [
    {
      officialEpiScore: 110,
      monthlyHistory: [
        createMonthlyHistory('2026-03', 70, createCriteria()),
      ],
    },
    {
      officialEpiScore: 90,
      monthlyHistory: [
        createMonthlyHistory('2026-03', 70, createCriteria()),
      ],
    },
  ];

  assert.deepEqual(createGlobalAverageByMonth(rows, '2026-03'), {
    '2026-03': 100,
  });
});
