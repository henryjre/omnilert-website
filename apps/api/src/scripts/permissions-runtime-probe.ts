import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import knex, { type Knex } from 'knex';
import { io } from 'socket.io-client';
import { PERMISSIONS } from '@omnilert/shared';

type ProbeResult = {
  id: string;
  kind: 'http' | 'socket' | 'branch-scope';
  passed: boolean;
  expected: string;
  actual: string;
  request: Record<string, unknown>;
};

type CompanyContext = {
  id: string;
  slug: string;
};

type HttpProbe = {
  id: string;
  method: 'GET';
  path: string;
  requiredAny: string[];
  query?: Record<string, string>;
};

type SocketProbe = {
  id: string;
  namespace: string;
  requiredAny: string[];
};

type DbSettings = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const OUTPUT_DIR = path.join(REPO_ROOT, 'project-context/permissions-audit');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'runtime-probe-results.json');
const OUTPUT_MD = path.join(OUTPUT_DIR, 'runtime-probe-results.md');

function toRepoRelative(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
}

function normalizeBaseUrl(input: string): string {
  return input.replace(/\/+$/, '');
}

function toQueryString(query: Record<string, string> | undefined): string {
  if (!query || Object.keys(query).length === 0) {
    return '';
  }
  const params = new URLSearchParams(query);
  return `?${params.toString()}`;
}

function readDbSettings(): DbSettings {
  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'omnilert',
  };
}

function createDbConnection(settings: DbSettings, database: string): Knex {
  return knex({
    client: 'pg',
    connection: {
      host: settings.host,
      port: settings.port,
      user: settings.user,
      password: settings.password,
      database,
    },
    pool: { min: 0, max: 5 },
  });
}

function createTokenFactory(
  company: CompanyContext,
  defaultBranchIds: string[],
  jwtSecret: string,
  expiresIn: string,
) {
  return (permissions: string[], branchIds: string[] = defaultBranchIds): string => jwt.sign(
    {
      sub: randomUUID(),
      companyId: company.id,
      companySlug: company.slug,
      roles: [] as string[],
      permissions,
      branchIds,
    },
    jwtSecret,
    { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] },
  );
}

async function runHttpPermissionProbe(
  apiBaseUrl: string,
  tokenFactory: (permissions: string[], branchIds?: string[]) => string,
  probe: HttpProbe,
): Promise<ProbeResult> {
  const url = `${apiBaseUrl}${probe.path}${toQueryString(probe.query)}`;
  const positivePermissions = [probe.requiredAny[0]];
  const negativeToken = tokenFactory([]);
  const positiveToken = tokenFactory(positivePermissions);

  const negativeResponse = await fetch(url, {
    method: probe.method,
    headers: { Authorization: `Bearer ${negativeToken}` },
  });
  const positiveResponse = await fetch(url, {
    method: probe.method,
    headers: { Authorization: `Bearer ${positiveToken}` },
  });

  const negativePass = negativeResponse.status === 403;
  const positivePass = positiveResponse.status !== 403 && positiveResponse.status !== 401;

  return {
    id: probe.id,
    kind: 'http',
    passed: negativePass && positivePass,
    expected: 'Negative token => 403, Positive token => non-403/non-401',
    actual: `Negative=${negativeResponse.status}, Positive=${positiveResponse.status}`,
    request: {
      method: probe.method,
      path: probe.path,
      query: probe.query ?? {},
      requiredAny: probe.requiredAny,
    },
  };
}

async function runBranchScopeProbe(
  apiBaseUrl: string,
  tokenFactory: (permissions: string[], branchIds?: string[]) => string,
  assignedBranchId: string,
  otherBranchId: string,
): Promise<ProbeResult[]> {
  const restrictedToken = tokenFactory([], [assignedBranchId]);
  const restrictedResponse = await fetch(`${apiBaseUrl}/branches?includeInactive=true`, {
    headers: { Authorization: `Bearer ${restrictedToken}` },
  });
  const restrictedData = await restrictedResponse.json().catch(() => ({ data: [] }));
  const restrictedRows: Array<{ id?: string }> = Array.isArray(restrictedData?.data) ? restrictedData.data : [];
  const restrictedOnlyAssigned = restrictedRows.every((row) => row.id === assignedBranchId);

  const restrictedResult: ProbeResult = {
    id: 'branch.scope.restricted-list',
    kind: 'branch-scope',
    passed: restrictedResponse.status === 200 && restrictedOnlyAssigned,
    expected: 'User without admin.view_all_branches only sees assigned branches',
    actual: `status=${restrictedResponse.status}, rows=${restrictedRows.length}, restrictedOnlyAssigned=${restrictedOnlyAssigned}`,
    request: {
      method: 'GET',
      path: '/branches',
      query: { includeInactive: 'true' },
      permissions: [],
      branchIds: [assignedBranchId],
    },
  };

  const unrestrictedToken = tokenFactory([PERMISSIONS.ADMIN_VIEW_ALL_BRANCHES], [assignedBranchId]);
  const unrestrictedResponse = await fetch(`${apiBaseUrl}/branches?includeInactive=true`, {
    headers: { Authorization: `Bearer ${unrestrictedToken}` },
  });
  const unrestrictedData = await unrestrictedResponse.json().catch(() => ({ data: [] }));
  const unrestrictedRows: Array<{ id?: string }> = Array.isArray(unrestrictedData?.data) ? unrestrictedData.data : [];
  const unrestrictedCountOk = unrestrictedRows.length >= restrictedRows.length;

  const unrestrictedResult: ProbeResult = {
    id: 'branch.scope.admin-list',
    kind: 'branch-scope',
    passed: unrestrictedResponse.status === 200 && unrestrictedCountOk,
    expected: 'User with admin.view_all_branches can see at least as many branches',
    actual: `status=${unrestrictedResponse.status}, unrestrictedRows=${unrestrictedRows.length}, restrictedRows=${restrictedRows.length}`,
    request: {
      method: 'GET',
      path: '/branches',
      query: { includeInactive: 'true' },
      permissions: [PERMISSIONS.ADMIN_VIEW_ALL_BRANCHES],
      branchIds: [assignedBranchId],
    },
  };

  const scopedToken = tokenFactory([PERMISSIONS.SCHEDULE_VIEW], [assignedBranchId]);
  const scopedResponse = await fetch(`${apiBaseUrl}/employee-shifts?branchIds=${encodeURIComponent(otherBranchId)}`, {
    headers: { Authorization: `Bearer ${scopedToken}` },
  });
  const scopedData = await scopedResponse.json().catch(() => ({ data: [] }));
  const scopedRows: Array<{ branch_id?: string }> = Array.isArray(scopedData?.data) ? scopedData.data : [];
  const scopedToAssigned = scopedRows.every((row) => row.branch_id === assignedBranchId);

  const shiftScopedResult: ProbeResult = {
    id: 'branch.scope.shift-list',
    kind: 'branch-scope',
    passed: scopedResponse.status === 200 && scopedToAssigned,
    expected: 'Without admin.view_all_branches, employee-shifts branch filter stays within assigned branches',
    actual: `status=${scopedResponse.status}, rows=${scopedRows.length}, scopedToAssigned=${scopedToAssigned}`,
    request: {
      method: 'GET',
      path: '/employee-shifts',
      query: { branchIds: otherBranchId },
      permissions: [PERMISSIONS.SCHEDULE_VIEW],
      branchIds: [assignedBranchId],
    },
  };

  return [restrictedResult, unrestrictedResult, shiftScopedResult];
}

async function connectSocketOnce(
  socketOrigin: string,
  namespace: string,
  token: string,
): Promise<{ connected: boolean; detail: string }> {
  return new Promise((resolve) => {
    const client = io(`${socketOrigin}${namespace}`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token },
      timeout: 7000,
      reconnection: false,
      forceNew: true,
    });

    const finalize = (connected: boolean, detail: string) => {
      try {
        client.disconnect();
      } catch {
        // ignore disconnect error
      }
      resolve({ connected, detail });
    };

    const timeout = setTimeout(() => finalize(false, 'timeout'), 9000);
    client.on('connect', () => {
      clearTimeout(timeout);
      finalize(true, 'connected');
    });
    client.on('connect_error', (error: Error) => {
      clearTimeout(timeout);
      finalize(false, error?.message ?? 'connect_error');
    });
  });
}

async function runSocketProbe(
  socketOrigin: string,
  tokenFactory: (permissions: string[], branchIds?: string[]) => string,
  probe: SocketProbe,
): Promise<ProbeResult> {
  const negativeToken = tokenFactory([]);
  const positiveToken = tokenFactory([probe.requiredAny[0]]);

  const negativeAttempt = await connectSocketOnce(socketOrigin, probe.namespace, negativeToken);
  const positiveAttempt = await connectSocketOnce(socketOrigin, probe.namespace, positiveToken);

  return {
    id: probe.id,
    kind: 'socket',
    passed: !negativeAttempt.connected && positiveAttempt.connected,
    expected: 'Negative token fails socket auth, positive token connects',
    actual: `negative=${negativeAttempt.detail}, positive=${positiveAttempt.detail}`,
    request: {
      namespace: probe.namespace,
      requiredAny: probe.requiredAny,
    },
  };
}

function renderMarkdown(results: ProbeResult[]): string {
  const generatedAt = new Date().toISOString();
  const passedCount = results.filter((result) => result.passed).length;
  const failedCount = results.length - passedCount;

  const table = [
    '| Probe | Kind | Passed | Expected | Actual |',
    '| --- | --- | --- | --- | --- |',
    ...results.map((result) => `| ${result.id} | ${result.kind} | ${result.passed ? 'yes' : 'no'} | ${result.expected} | ${result.actual} |`),
  ].join('\n');

  return [
    '# Runtime Permission Probe Results',
    '',
    `Generated: ${generatedAt}`,
    '',
    `- Total probes: ${results.length}`,
    `- Passed: ${passedCount}`,
    `- Failed: ${failedCount}`,
    '',
    table,
    '',
  ].join('\n');
}

async function resolveCompanyAndBranches(
  settings: DbSettings,
): Promise<{ company: CompanyContext; branchIds: string[]; singleDb: Knex }> {
  const singleDb = createDbConnection(settings, settings.database);

  const companyRow = await singleDb('companies')
    .where({ is_active: true })
    .orderBy('created_at', 'asc')
    .first('id', 'slug');

  if (!companyRow?.id || !companyRow?.slug) {
    await singleDb.destroy();
    throw new Error('No active company found in database.');
  }

  const branchRows = await singleDb('branches')
    .select('id')
    .where({ is_active: true, company_id: companyRow.id })
    .orderBy('created_at', 'asc')
    .limit(10);

  const branchIds = branchRows.map((branch) => String(branch.id)).filter(Boolean);
  if (branchIds.length === 0) {
    await singleDb.destroy();
    throw new Error(`No active branches found for company "${String(companyRow.id)}".`);
  }

  return {
    company: {
      id: String(companyRow.id),
      slug: String(companyRow.slug),
    },
    branchIds,
    singleDb,
  };
}

async function main(): Promise<void> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required to run runtime permission probes.');
  }

  const settings = readDbSettings();
  const apiBaseUrl = normalizeBaseUrl(process.env.PERMISSIONS_PROBE_BASE_URL ?? 'http://localhost:3001/api');
  const socketOrigin = apiBaseUrl.replace(/\/api$/, '');
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? '15m';

  let singleDb: Knex | null = null;
  try {
    const companyData = await resolveCompanyAndBranches(settings);
    singleDb = companyData.singleDb;

    const assignedBranchId = companyData.branchIds[0];
    const otherBranchId = companyData.branchIds[1] ?? companyData.branchIds[0];
    const tokenFactory = createTokenFactory(companyData.company, [assignedBranchId], jwtSecret, jwtExpiresIn);

    const httpProbes: HttpProbe[] = [
      {
        id: 'http.peer-evaluations.pending-mine',
        method: 'GET',
        path: '/peer-evaluations/pending-mine',
        requiredAny: [PERMISSIONS.WORKPLACE_RELATIONS_VIEW],
      },
      {
        id: 'http.employee-shifts.list',
        method: 'GET',
        path: '/employee-shifts',
        requiredAny: [PERMISSIONS.SCHEDULE_VIEW],
      },
      {
        id: 'http.pos-sessions.list',
        method: 'GET',
        path: '/pos-sessions',
        requiredAny: [PERMISSIONS.POS_VIEW],
      },
      {
        id: 'http.pos-verifications.list',
        method: 'GET',
        path: '/pos-verifications',
        requiredAny: [PERMISSIONS.POS_VIEW],
      },
      {
        id: 'http.account.profile',
        method: 'GET',
        path: '/account/profile',
        requiredAny: [PERMISSIONS.ACCOUNT_VIEW_SCHEDULE],
      },
      {
        id: 'http.account.notifications.count',
        method: 'GET',
        path: '/account/notifications/count',
        requiredAny: [PERMISSIONS.ACCOUNT_VIEW_SCHEDULE],
      },
      {
        id: 'http.account.schedule',
        method: 'GET',
        path: '/account/schedule',
        requiredAny: [PERMISSIONS.ACCOUNT_VIEW_SCHEDULE],
      },
    ];

    const socketProbes: SocketProbe[] = [
      { id: 'socket.pos-verification', namespace: '/pos-verification', requiredAny: [PERMISSIONS.POS_VIEW] },
      { id: 'socket.pos-session', namespace: '/pos-session', requiredAny: [PERMISSIONS.POS_VIEW] },
      { id: 'socket.employee-shifts', namespace: '/employee-shifts', requiredAny: [PERMISSIONS.SCHEDULE_VIEW, PERMISSIONS.ACCOUNT_VIEW_SCHEDULE] },
      { id: 'socket.employee-verifications', namespace: '/employee-verifications', requiredAny: [PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW_PAGE] },
      { id: 'socket.store-audits', namespace: '/store-audits', requiredAny: [PERMISSIONS.STORE_AUDIT_VIEW] },
      { id: 'socket.case-reports', namespace: '/case-reports', requiredAny: [PERMISSIONS.CASE_REPORT_VIEW] },
      { id: 'socket.violation-notices', namespace: '/violation-notices', requiredAny: [PERMISSIONS.VIOLATION_NOTICE_VIEW] },
      {
        id: 'socket.employee-requirements',
        namespace: '/employee-requirements',
        requiredAny: [PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REQUIREMENTS, PERMISSIONS.SCHEDULE_VIEW],
      },
      { id: 'socket.peer-evaluations', namespace: '/peer-evaluations', requiredAny: [PERMISSIONS.WORKPLACE_RELATIONS_VIEW] },
    ];

    const results: ProbeResult[] = [];

    for (const probe of httpProbes) {
      try {
        results.push(await runHttpPermissionProbe(apiBaseUrl, tokenFactory, probe));
      } catch (error) {
        results.push({
          id: probe.id,
          kind: 'http',
          passed: false,
          expected: 'Negative token => 403, Positive token => non-403/non-401',
          actual: `probe error: ${error instanceof Error ? error.message : String(error)}`,
          request: {
            method: probe.method,
            path: probe.path,
            query: probe.query ?? {},
            requiredAny: probe.requiredAny,
          },
        });
      }
    }

    try {
      results.push(
        ...(await runBranchScopeProbe(
          apiBaseUrl,
          tokenFactory,
          assignedBranchId,
          otherBranchId,
        )),
      );
    } catch (error) {
      results.push({
        id: 'branch.scope.probe',
        kind: 'branch-scope',
        passed: false,
        expected: 'Branch-scope probes complete',
        actual: `probe error: ${error instanceof Error ? error.message : String(error)}`,
        request: {
          paths: ['/branches', '/employee-shifts'],
          assignedBranchId,
          otherBranchId,
        },
      });
    }

    for (const probe of socketProbes) {
      try {
        results.push(await runSocketProbe(socketOrigin, tokenFactory, probe));
      } catch (error) {
        results.push({
          id: probe.id,
          kind: 'socket',
          passed: false,
          expected: 'Negative token fails socket auth, positive token connects',
          actual: `probe error: ${error instanceof Error ? error.message : String(error)}`,
          request: {
            namespace: probe.namespace,
            requiredAny: probe.requiredAny,
          },
        });
      }
    }

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const payload = {
      generatedAt: new Date().toISOString(),
      apiBaseUrl,
      socketOrigin,
      company: companyData.company,
      assignedBranchId,
      otherBranchId,
      results,
    };
    await fs.writeFile(OUTPUT_JSON, JSON.stringify(payload, null, 2), 'utf8');
    await fs.writeFile(OUTPUT_MD, renderMarkdown(results), 'utf8');

    const failures = results.filter((result) => !result.passed);
    console.log(`Runtime probe report: ${toRepoRelative(OUTPUT_JSON)}`);
    console.log(`Runtime probe summary: ${toRepoRelative(OUTPUT_MD)}`);
    console.log(`Probes passed: ${results.length - failures.length}/${results.length}`);

    if (failures.length > 0) {
      console.error('Failed probes:');
      for (const failure of failures) {
        console.error(`- ${failure.id}: ${failure.actual}`);
      }
      process.exitCode = 1;
    }
  } finally {
    if (singleDb) {
      await singleDb.destroy();
    }
  }
}

main().catch((error) => {
  console.error('Runtime permission probe failed:', error);
  process.exitCode = 1;
});
