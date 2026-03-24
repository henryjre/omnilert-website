import { db } from '../config/database.js';

export interface AssignedBranchGroup {
  companyId: string;
  companyName: string;
  companySlug: string;
  branches: Array<{
    id: string;
    name: string;
    odoo_branch_id: string | null;
  }>;
}

export async function getAssignedBranches(
  userId: string,
  isSuperAdmin: boolean,
): Promise<AssignedBranchGroup[]> {
  let rows: Array<{
    company_id: string;
    company_name: string;
    company_slug: string;
    branch_id: string;
    branch_name: string;
    odoo_branch_id: string | null;
  }>;

  if (isSuperAdmin) {
    rows = await db.getDb()('branches as b')
      .join('companies as c', 'b.company_id', 'c.id')
      .where('b.is_active', true)
      .where('c.is_active', true)
      .where('c.is_root', false)
      .select(
        'c.id as company_id',
        'c.name as company_name',
        'c.slug as company_slug',
        'b.id as branch_id',
        'b.name as branch_name',
        'b.odoo_branch_id',
      )
      .orderBy('c.name', 'asc')
      .orderBy('b.name', 'asc');
  } else {
    rows = await db.getDb()('user_company_branches as ucb')
      .join('branches as b', 'ucb.branch_id', 'b.id')
      .join('companies as c', 'ucb.company_id', 'c.id')
      .where('ucb.user_id', userId)
      .where('b.is_active', true)
      .where('c.is_active', true)
      .where('c.is_root', false)
      .select(
        'c.id as company_id',
        'c.name as company_name',
        'c.slug as company_slug',
        'b.id as branch_id',
        'b.name as branch_name',
        'b.odoo_branch_id',
      )
      .orderBy('c.name', 'asc')
      .orderBy('b.name', 'asc');
  }

  // Group by company
  const groupMap = new Map<string, AssignedBranchGroup>();
  for (const row of rows) {
    let group = groupMap.get(row.company_id);
    if (!group) {
      group = {
        companyId: String(row.company_id),
        companyName: String(row.company_name),
        companySlug: String(row.company_slug),
        branches: [],
      };
      groupMap.set(row.company_id, group);
    }
    // Deduplicate branches
    if (!group.branches.some((br) => br.id === row.branch_id)) {
      group.branches.push({
        id: String(row.branch_id),
        name: String(row.branch_name),
        odoo_branch_id: row.odoo_branch_id ? String(row.odoo_branch_id) : null,
      });
    }
  }

  return Array.from(groupMap.values());
}
