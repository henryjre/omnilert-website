import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

interface ActiveCompanyRow {
  id: string;
}

interface TenantBranchRow {
  isActive: boolean;
  odooBranchId: string | null;
}

interface GlobalBranchLogger {
  warn: (context: Record<string, unknown>, message: string) => void;
}

interface GlobalBranchResolverDeps {
  listActiveCompanies: () => Promise<ActiveCompanyRow[]>;
  listTenantBranches: (companyId: string) => Promise<TenantBranchRow[]>;
  logger?: GlobalBranchLogger;
  now?: () => number;
  ttlMs?: number;
}

interface CachedBranchIds {
  expiresAt: number;
  branchIds: number[];
}

export function createGlobalActiveOdooBranchIdResolver(
  deps: GlobalBranchResolverDeps,
): () => Promise<number[]> {
  const ttlMs = deps.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = deps.now ?? Date.now;
  let cache: CachedBranchIds | null = null;

  return async () => {
    const nowMs = now();
    if (cache && nowMs < cache.expiresAt) {
      return cache.branchIds;
    }

    const companies = await deps.listActiveCompanies();
    const branchIds = new Set<number>();

    await Promise.all(companies.map(async (company) => {
      try {
        const rows = await deps.listTenantBranches(company.id);
        for (const row of rows) {
          if (!row.isActive || !row.odooBranchId) continue;
          const parsed = Number(row.odooBranchId);
          if (!Number.isFinite(parsed)) continue;
          branchIds.add(parsed);
        }
      } catch (error) {
        deps.logger?.warn(
          {
            err: error,
            companyId: company.id,
          },
          'Failed to load tenant Odoo branch ids for global EPI benchmark',
        );
      }
    }));

    const resolved = Array.from(branchIds).sort((a, b) => a - b);
    cache = {
      branchIds: resolved,
      expiresAt: nowMs + ttlMs,
    };

    return resolved;
  };
}

export const listGlobalActiveOdooBranchIds = createGlobalActiveOdooBranchIdResolver({
  listActiveCompanies: async () => {
    const rows = await db.getDb()('companies')
      .where({ is_active: true })
      .select('id')
      .orderBy('created_at', 'asc');

    return rows.map((row: any) => ({
      id: String(row.id),
    }));
  },
  listTenantBranches: async (_companyId) => {
    const rows = await db.getDb()('branches')
      .select('is_active', 'odoo_branch_id');

    return rows.map((row: any) => ({
      isActive: row.is_active === true,
      odooBranchId: row.odoo_branch_id ? String(row.odoo_branch_id) : null,
    }));
  },
  logger: {
    warn: (context, message) => logger.warn(context, message),
  },
});
