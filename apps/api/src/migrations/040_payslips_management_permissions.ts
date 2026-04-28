import { v4 as uuidv4 } from 'uuid';
import type { Knex } from 'knex';

const PERMISSIONS = [
  {
    key: 'payslips.view',
    name: 'View Payroll',
    description: 'Access the Payroll management page',
    category: 'payslips',
  },
  {
    key: 'payslips.issue',
    name: 'Issue Payroll',
    description: 'Submit payroll deduction and issuance requests',
    category: 'payslips',
  },
  {
    key: 'payslips.manage',
    name: 'Manage Payroll',
    description: 'Approve and reject payroll deduction and issuance requests',
    category: 'payslips',
  },
];

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    for (const perm of PERMISSIONS) {
      await trx('permissions')
        .insert({
          id: uuidv4(),
          key: perm.key,
          name: perm.name,
          description: perm.description,
          category: perm.category,
        })
        .onConflict('key')
        .merge(['name', 'description', 'category']);
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex('permissions')
    .whereIn(
      'key',
      PERMISSIONS.map((p) => p.key),
    )
    .delete();
}
