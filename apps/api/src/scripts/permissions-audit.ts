import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type EnforcementStatus =
  | 'enforced'
  | 'partially enforced'
  | 'ui-only'
  | 'dead/orphan'
  | 'legacy-alias'
  | 'intent-unclear';

type Occurrence = {
  file: string;
  line: number;
  context: string;
};

type PermissionMatrixRow = {
  constantKey: string;
  permission: string;
  status: EnforcementStatus;
  apiGuards: Occurrence[];
  apiInlineChecks: Occurrence[];
  socketGuards: Occurrence[];
  uiGuards: Occurrence[];
  roleGrants: Occurrence[];
  notes: string;
};

type AliasRow = {
  alias: string;
  status: 'legacy-alias';
  occurrences: Occurrence[];
  notes: string;
};

type LiteralViolation = {
  permission: string;
  occurrences: Occurrence[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const PATHS = {
  permissions: path.join(REPO_ROOT, 'packages/shared/src/constants/permissions.ts'),
  apiSrc: path.join(REPO_ROOT, 'apps/api/src'),
  webSrc: path.join(REPO_ROOT, 'apps/web/src'),
  routes: path.join(REPO_ROOT, 'apps/api/src/routes'),
  socket: path.join(REPO_ROOT, 'apps/api/src/config/socket.ts'),
  routeIndex: path.join(REPO_ROOT, 'apps/api/src/routes/index.ts'),
  migrations: path.join(REPO_ROOT, 'apps/api/src/migrations'),
  migrationScript: path.join(REPO_ROOT, 'apps/api/src/scripts/migration.ts'),
  outputDir: path.join(REPO_ROOT, 'project-context/permissions-audit'),
};

const LEGACY_ALIAS_ALLOWLIST = new Set<string>([
  'auth_request.view_service_crew',
]);

const LITERAL_ALLOWLIST_PATHS = [
  'packages/shared/src/constants/permissions.ts',
  'apps/api/src/migrations/',
  'apps/api/src/scripts/migration.ts',
  'apps/api/src/scripts/permissions-audit.ts',
  'apps/api/src/scripts/permissions-runtime-probe.ts',
];

function toRepoRelative(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
}

function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function permissionPrefix(permission: string): string {
  return permission.split('.')[0];
}

function isPermissionLike(value: string, knownPrefixes: Set<string>): boolean {
  if (!/^[a-z_]+\.[a-z0-9_]+$/.test(value)) {
    return false;
  }
  return knownPrefixes.has(permissionPrefix(value));
}

async function walkFiles(directory: string, extensions: Set<string>): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
        continue;
      }
      const nested = await walkFiles(fullPath, extensions);
      results.push(...nested);
      continue;
    }
    if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

function extractPermissionConstants(
  source: string,
  constantsToPermission: Map<string, string>,
): string[] {
  const result = new Set<string>();
  const constPattern = /PERMISSIONS\.([A-Z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = constPattern.exec(source)) !== null) {
    const permission = constantsToPermission.get(match[1]);
    if (permission) {
      result.add(permission);
    }
  }
  return [...result];
}

function extractPermissionLiterals(
  source: string,
  knownPrefixes: Set<string>,
): string[] {
  const result = new Set<string>();
  const literalPattern = /['"]([a-z_]+\.[a-z0-9_]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = literalPattern.exec(source)) !== null) {
    const literal = match[1];
    if (isPermissionLike(literal, knownPrefixes)) {
      result.add(literal);
    }
  }
  return [...result];
}

function addOccurrence(
  map: Map<string, Occurrence[]>,
  permission: string,
  occurrence: Occurrence,
): void {
  const list = map.get(permission) ?? [];
  list.push(occurrence);
  map.set(permission, list);
}

function normalizeRoute(basePath: string, routePath: string): string {
  const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  if (routePath === '/') {
    return normalizedBase || '/';
  }
  if (routePath.startsWith('/')) {
    return `${normalizedBase}${routePath}`;
  }
  return `${normalizedBase}/${routePath}`;
}

async function loadPermissions(): Promise<Map<string, string>> {
  const content = await fs.readFile(PATHS.permissions, 'utf8');
  const map = new Map<string, string>();
  const pattern = /^\s*([A-Z0-9_]+):\s*'([^']+)'/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    map.set(match[1], match[2]);
  }
  return map;
}

async function resolveMountedRoutes(): Promise<Array<{ file: string; basePath: string }>> {
  const content = await fs.readFile(PATHS.routeIndex, 'utf8');
  const imports = new Map<string, string>();
  const importPattern = /import\s+(\w+)\s+from\s+'\.\/([^']+)\.js';/g;
  let importMatch: RegExpExecArray | null;
  while ((importMatch = importPattern.exec(content)) !== null) {
    const variableName = importMatch[1];
    const relativeModule = importMatch[2];
    if (!relativeModule.endsWith('.routes')) {
      continue;
    }
    imports.set(variableName, path.join(PATHS.routes, `${relativeModule}.ts`));
  }

  const mounted: Array<{ file: string; basePath: string }> = [];
  const mountPattern = /router\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)/g;
  let mountMatch: RegExpExecArray | null;
  while ((mountMatch = mountPattern.exec(content)) !== null) {
    const basePath = mountMatch[1];
    const variableName = mountMatch[2];
    const routeFile = imports.get(variableName);
    if (!routeFile) {
      continue;
    }
    mounted.push({ file: routeFile, basePath });
  }
  return mounted;
}

async function collectRouteGuards(
  constantsToPermission: Map<string, string>,
  knownPermissionSet: Set<string>,
  knownPrefixes: Set<string>,
): Promise<Map<string, Occurrence[]>> {
  const map = new Map<string, Occurrence[]>();
  const mountedRoutes = await resolveMountedRoutes();

  const routeCallPattern = /router\.(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\2\s*,([\s\S]*?)\)\s*;/g;
  const guardPattern = /require(?:Any)?Permission\(([\s\S]*?)\)/g;

  for (const mounted of mountedRoutes) {
    const content = await fs.readFile(mounted.file, 'utf8');
    let routeMatch: RegExpExecArray | null;
    while ((routeMatch = routeCallPattern.exec(content)) !== null) {
      const method = routeMatch[1].toUpperCase();
      const routePath = routeMatch[3];
      const middlewareSource = routeMatch[4];
      const fullRoute = normalizeRoute(mounted.basePath, routePath);

      let guardMatch: RegExpExecArray | null;
      while ((guardMatch = guardPattern.exec(middlewareSource)) !== null) {
        const expression = guardMatch[1];
        const constants = extractPermissionConstants(expression, constantsToPermission);
        const literals = extractPermissionLiterals(expression, knownPrefixes);
        const combined = [...constants, ...literals].filter((permission) => knownPermissionSet.has(permission));

        for (const permission of new Set(combined)) {
          const offsetInRouteCall = routeMatch[0].indexOf(guardMatch[0]);
          const absoluteIndex = routeMatch.index + Math.max(0, offsetInRouteCall);
          addOccurrence(map, permission, {
            file: toRepoRelative(mounted.file),
            line: getLineNumber(content, absoluteIndex),
            context: `${method} ${fullRoute}`,
          });
        }
      }
    }
  }

  // Handle inline guarded route mounted in index.ts (for /permissions).
  const indexContent = await fs.readFile(PATHS.routeIndex, 'utf8');
  const indexUsePattern = /router\.use\(\s*['"]([^'"]+)['"]\s*,([\s\S]*?)\)\s*;/g;
  let useMatch: RegExpExecArray | null;
  while ((useMatch = indexUsePattern.exec(indexContent)) !== null) {
    const basePath = useMatch[1];
    const middleware = useMatch[2];
    const constants = extractPermissionConstants(middleware, constantsToPermission);
    for (const permission of constants) {
      if (!knownPermissionSet.has(permission)) {
        continue;
      }
      addOccurrence(map, permission, {
        file: toRepoRelative(PATHS.routeIndex),
        line: getLineNumber(indexContent, useMatch.index),
        context: `USE ${basePath}`,
      });
    }
  }

  return map;
}

async function collectInlineBackendChecks(
  constantsToPermission: Map<string, string>,
  knownPermissionSet: Set<string>,
  knownPrefixes: Set<string>,
): Promise<Map<string, Occurrence[]>> {
  const map = new Map<string, Occurrence[]>();
  const files = await walkFiles(PATHS.apiSrc, new Set(['.ts']));

  const includePattern = /permissions\.includes\(([\s\S]*?)\)/g;
  const setHasPattern = /userPermissions\.has\(([\s\S]*?)\)/g;
  const patterns = [includePattern, setHasPattern];

  for (const file of files) {
    const rel = toRepoRelative(file);
    if (
      rel.startsWith('apps/api/src/routes/')
      || rel.startsWith('apps/api/src/migrations/')
      || rel.startsWith('apps/api/src/scripts/')
      || rel === 'apps/api/src/config/socket.ts'
    ) {
      continue;
    }

    const content = await fs.readFile(file, 'utf8');
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const expression = match[1];
        const constants = extractPermissionConstants(expression, constantsToPermission);
        const literals = extractPermissionLiterals(expression, knownPrefixes);
        const combined = [...constants, ...literals].filter((permission) => knownPermissionSet.has(permission));
        for (const permission of new Set(combined)) {
          addOccurrence(map, permission, {
            file: rel,
            line: getLineNumber(content, match.index),
            context: 'permissions.includes / userPermissions.has',
          });
        }
      }
    }
  }

  return map;
}

async function collectSocketGuards(
  constantsToPermission: Map<string, string>,
): Promise<Map<string, Occurrence[]>> {
  const map = new Map<string, Occurrence[]>();
  const content = await fs.readFile(PATHS.socket, 'utf8');
  const constantPattern = /PERMISSIONS\.([A-Z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = constantPattern.exec(content)) !== null) {
    const permission = constantsToPermission.get(match[1]);
    if (!permission) {
      continue;
    }
    addOccurrence(map, permission, {
      file: toRepoRelative(PATHS.socket),
      line: getLineNumber(content, match.index),
      context: 'socket namespace/branch guard',
    });
  }
  return map;
}

async function collectFrontendGuards(
  constantsToPermission: Map<string, string>,
): Promise<Map<string, Occurrence[]>> {
  const map = new Map<string, Occurrence[]>();
  const files = await walkFiles(PATHS.webSrc, new Set(['.ts', '.tsx']));
  const patterns = [
    /hasPermission\(\s*PERMISSIONS\.([A-Z0-9_]+)\s*\)/g,
    /hasAnyPermission\(\s*\[([\s\S]*?)\]\s*\)/g,
    /permission=\{\s*PERMISSIONS\.([A-Z0-9_]+)\s*\}/g,
    /anyPermission=\{\s*\[([\s\S]*?)\]\s*\}/g,
  ];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const rel = toRepoRelative(file);
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1]) {
          const directPermission = constantsToPermission.get(match[1]);
          if (directPermission) {
            addOccurrence(map, directPermission, {
              file: rel,
              line: getLineNumber(content, match.index),
              context: 'frontend guard',
            });
          } else {
            const constants = extractPermissionConstants(match[1], constantsToPermission);
            for (const permission of constants) {
              addOccurrence(map, permission, {
                file: rel,
                line: getLineNumber(content, match.index),
                context: 'frontend anyPermission/hasAnyPermission',
              });
            }
          }
        }
      }
    }
  }

  return map;
}

async function collectRoleGrants(
  knownPermissionSet: Set<string>,
  knownPrefixes: Set<string>,
): Promise<{ grants: Map<string, Occurrence[]>; legacyAliases: Map<string, Occurrence[]> }> {
  const grants = new Map<string, Occurrence[]>();
  const legacyAliases = new Map<string, Occurrence[]>();
  const migrationFiles = await walkFiles(PATHS.migrations, new Set(['.ts']));
  migrationFiles.push(PATHS.migrationScript);

  for (const file of migrationFiles) {
    const content = await fs.readFile(file, 'utf8');
    const rel = toRepoRelative(file);
    const literalPattern = /['"]([a-z_]+\.[a-z0-9_]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = literalPattern.exec(content)) !== null) {
      const literal = match[1];
      if (!isPermissionLike(literal, knownPrefixes)) {
        continue;
      }
      if (knownPermissionSet.has(literal)) {
        addOccurrence(grants, literal, {
          file: rel,
          line: getLineNumber(content, match.index),
          context: 'migration/seed grant',
        });
        continue;
      }
      addOccurrence(legacyAliases, literal, {
        file: rel,
        line: getLineNumber(content, match.index),
        context: 'migration legacy alias',
      });
    }
  }

  return { grants, legacyAliases };
}

async function collectLiteralViolations(
  knownPermissionSet: Set<string>,
  knownPrefixes: Set<string>,
): Promise<Map<string, Occurrence[]>> {
  const violations = new Map<string, Occurrence[]>();
  const scanRoots = [PATHS.apiSrc, PATHS.webSrc, path.join(REPO_ROOT, 'packages')];
  const files = (await Promise.all(scanRoots.map((scanRoot) => walkFiles(scanRoot, new Set(['.ts', '.tsx'])))))
    .flat();

  const literalPattern = /['"]([a-z_]+\.[a-z0-9_]+)['"]/g;

  for (const file of files) {
    const rel = toRepoRelative(file);
    if (LITERAL_ALLOWLIST_PATHS.some((allowPath) => rel === allowPath || rel.startsWith(allowPath))) {
      continue;
    }

    const content = await fs.readFile(file, 'utf8');
    let match: RegExpExecArray | null;
    while ((match = literalPattern.exec(content)) !== null) {
      const literal = match[1];
      const isKnownPermission = knownPermissionSet.has(literal);
      const isLegacyAlias = LEGACY_ALIAS_ALLOWLIST.has(literal);
      if (!isKnownPermission && !isLegacyAlias) {
        continue;
      }
      if (!isPermissionLike(literal, knownPrefixes)) {
        continue;
      }
      addOccurrence(violations, literal, {
        file: rel,
        line: getLineNumber(content, match.index),
        context: 'raw permission string literal',
      });
    }
  }

  return violations;
}

function classifyRow(row: Omit<PermissionMatrixRow, 'status' | 'notes'>): Pick<PermissionMatrixRow, 'status' | 'notes'> {
  const hasApiGuards = row.apiGuards.length > 0 || row.apiInlineChecks.length > 0;
  const hasSocketGuards = row.socketGuards.length > 0;
  const hasBackend = hasApiGuards || hasSocketGuards;
  const hasUi = row.uiGuards.length > 0;
  const hasGrants = row.roleGrants.length > 0;

  if (hasBackend && hasUi && hasGrants) {
    return { status: 'enforced', notes: 'Backend, socket/UI checks, and grants are present.' };
  }

  if (!hasBackend && hasUi) {
    return { status: 'ui-only', notes: 'UI checks exist but backend/socket enforcement is missing.' };
  }

  if (!hasBackend && !hasUi && hasGrants) {
    return { status: 'intent-unclear', notes: 'Granted in roles/migrations but no runtime enforcement found.' };
  }

  if (!hasBackend && !hasUi && !hasGrants) {
    return { status: 'dead/orphan', notes: 'Defined constant has no guard, UI usage, or grants.' };
  }

  return {
    status: 'partially enforced',
    notes: 'Permission is referenced, but one or more layers (backend/UI/grants) are missing.',
  };
}

function summarizeByStatus(rows: PermissionMatrixRow[]): Record<EnforcementStatus, number> {
  const summary: Record<EnforcementStatus, number> = {
    enforced: 0,
    'partially enforced': 0,
    'ui-only': 0,
    'dead/orphan': 0,
    'legacy-alias': 0,
    'intent-unclear': 0,
  };
  for (const row of rows) {
    summary[row.status] += 1;
  }
  return summary;
}

function formatTopOccurrences(occurrences: Occurrence[], limit = 3): string {
  if (occurrences.length === 0) {
    return '-';
  }
  return occurrences
    .slice(0, limit)
    .map((occurrence) => `${occurrence.file}:${occurrence.line}`)
    .join(', ');
}

function buildRemediationTasks(rows: PermissionMatrixRow[], aliases: AliasRow[]): string[] {
  const tasks: string[] = [];
  for (const row of rows) {
    if (row.status === 'enforced') {
      continue;
    }
    if (row.status === 'ui-only') {
      tasks.push(`Add backend guard(s) for \`${row.permission}\` and align socket authorization if needed.`);
      continue;
    }
    if (row.status === 'dead/orphan') {
      tasks.push(`Decide whether to deprecate/remove \`${row.permission}\` or wire it to a concrete action.`);
      continue;
    }
    if (row.status === 'intent-unclear') {
      tasks.push(`Validate intent for \`${row.permission}\`: currently granted but not enforced at runtime.`);
      continue;
    }
    if (row.status === 'partially enforced') {
      tasks.push(`Close enforcement gap for \`${row.permission}\` (missing one of backend/UI/grants).`);
    }
  }

  for (const alias of aliases) {
    tasks.push(`Replace legacy alias \`${alias.alias}\` with shared constants and remove alias grants when migrated.`);
  }

  return [...new Set(tasks)];
}

function toMatrixMarkdown(
  rows: PermissionMatrixRow[],
  aliases: AliasRow[],
  literalViolations: LiteralViolation[],
): string {
  const generatedAt = new Date().toISOString();
  const summary = summarizeByStatus(rows);
  const remediationTasks = buildRemediationTasks(rows, aliases);

  const canonicalTable = [
    '| Permission | Status | API Guards | API Inline | Socket Guards | UI Guards | Role Grants | Notes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => [
      `| \`${row.permission}\``,
      row.status,
      String(row.apiGuards.length),
      String(row.apiInlineChecks.length),
      String(row.socketGuards.length),
      String(row.uiGuards.length),
      String(row.roleGrants.length),
      `${row.notes} (e.g. ${formatTopOccurrences([...row.apiGuards, ...row.socketGuards, ...row.uiGuards, ...row.roleGrants])}) |`,
    ].join(' | ')),
  ].join('\n');

  const aliasTable = aliases.length > 0
    ? [
      '| Alias | Status | Occurrences | Notes |',
      '| --- | --- | --- | --- |',
      ...aliases.map((alias) => `| \`${alias.alias}\` | ${alias.status} | ${alias.occurrences.length} | ${alias.notes} (e.g. ${formatTopOccurrences(alias.occurrences)}) |`),
    ].join('\n')
    : 'No legacy aliases found.';

  const literalSection = literalViolations.length > 0
    ? [
      '| Literal | Occurrences | Sample Locations |',
      '| --- | --- | --- |',
      ...literalViolations.map((violation) => `| \`${violation.permission}\` | ${violation.occurrences.length} | ${formatTopOccurrences(violation.occurrences, 5)} |`),
    ].join('\n')
    : 'No literal permission violations found outside allowlisted files.';

  const remediationSection = remediationTasks.length > 0
    ? remediationTasks.map((task, index) => `${index + 1}. ${task}`).join('\n')
    : 'No remediation tasks generated. All permissions are currently enforced.';

  return [
    '# Permissions Audit Matrix',
    '',
    `Generated: ${generatedAt}`,
    '',
    '## Summary',
    '',
    `- Total canonical permissions: ${rows.length}`,
    `- Enforced: ${summary.enforced}`,
    `- Partially enforced: ${summary['partially enforced']}`,
    `- UI-only: ${summary['ui-only']}`,
    `- Dead/Orphan: ${summary['dead/orphan']}`,
    `- Intent unclear: ${summary['intent-unclear']}`,
    `- Legacy aliases: ${aliases.length}`,
    '',
    '## Canonical Matrix',
    '',
    canonicalTable,
    '',
    '## Legacy Alias Findings',
    '',
    aliasTable,
    '',
    '## Literal Permission String Check',
    '',
    literalSection,
    '',
    '## Remediation Tasks',
    '',
    remediationSection,
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const constantsToPermission = await loadPermissions();
  const knownPermissionSet = new Set(constantsToPermission.values());
  const knownPrefixes = new Set([...knownPermissionSet].map(permissionPrefix));

  const [routeGuards, inlineChecks, socketGuards, frontendGuards, grantsWithAliases, literalViolationsMap] = await Promise.all([
    collectRouteGuards(constantsToPermission, knownPermissionSet, knownPrefixes),
    collectInlineBackendChecks(constantsToPermission, knownPermissionSet, knownPrefixes),
    collectSocketGuards(constantsToPermission),
    collectFrontendGuards(constantsToPermission),
    collectRoleGrants(knownPermissionSet, knownPrefixes),
    collectLiteralViolations(knownPermissionSet, knownPrefixes),
  ]);

  const rows: PermissionMatrixRow[] = [...constantsToPermission.entries()]
    .map(([constantKey, permission]) => {
      const base: Omit<PermissionMatrixRow, 'status' | 'notes'> = {
        constantKey,
        permission,
        apiGuards: routeGuards.get(permission) ?? [],
        apiInlineChecks: inlineChecks.get(permission) ?? [],
        socketGuards: socketGuards.get(permission) ?? [],
        uiGuards: frontendGuards.get(permission) ?? [],
        roleGrants: grantsWithAliases.grants.get(permission) ?? [],
      };
      const classification = classifyRow(base);
      return {
        ...base,
        ...classification,
      };
    })
    .sort((a, b) => a.permission.localeCompare(b.permission));

  const aliasRows: AliasRow[] = [...grantsWithAliases.legacyAliases.entries()]
    .map(([alias, occurrences]) => ({
      alias,
      status: 'legacy-alias' as const,
      occurrences,
      notes: LEGACY_ALIAS_ALLOWLIST.has(alias)
        ? 'Legacy alias remains in migration history; map to canonical key before cleanup.'
        : 'Unknown permission-like alias found in grants/migrations.',
    }))
    .sort((a, b) => a.alias.localeCompare(b.alias));

  const literalViolations: LiteralViolation[] = [...literalViolationsMap.entries()]
    .map(([permission, occurrences]) => ({ permission, occurrences }))
    .sort((a, b) => a.permission.localeCompare(b.permission));

  const markdown = toMatrixMarkdown(rows, aliasRows, literalViolations);
  const jsonPayload = {
    generatedAt: new Date().toISOString(),
    totals: {
      permissions: rows.length,
      aliases: aliasRows.length,
      literalViolations: literalViolations.length,
    },
    rows,
    aliases: aliasRows,
    literalViolations,
    remediationTasks: buildRemediationTasks(rows, aliasRows),
  };

  await fs.mkdir(PATHS.outputDir, { recursive: true });
  const matrixMdPath = path.join(PATHS.outputDir, 'permission-matrix.md');
  const matrixJsonPath = path.join(PATHS.outputDir, 'permission-matrix.json');
  await fs.writeFile(matrixMdPath, markdown, 'utf8');
  await fs.writeFile(matrixJsonPath, JSON.stringify(jsonPayload, null, 2), 'utf8');

  const unclassified = rows.filter((row) => !row.status).length;
  const hasLiteralViolations = literalViolations.length > 0;
  const exitWithFailure = unclassified > 0 || hasLiteralViolations;

  console.log(`Permission matrix generated: ${toRepoRelative(matrixMdPath)}`);
  console.log(`Machine-readable matrix: ${toRepoRelative(matrixJsonPath)}`);
  console.log(`Permissions analyzed: ${rows.length}`);
  console.log(`Legacy aliases: ${aliasRows.length}`);
  console.log(`Literal permission violations: ${literalViolations.length}`);

  if (exitWithFailure) {
    if (unclassified > 0) {
      console.error(`Unclassified permissions: ${unclassified}`);
    }
    if (hasLiteralViolations) {
      console.error('Found raw permission literals outside allowlisted files.');
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Permission audit script failed:', error);
  process.exit(1);
});

