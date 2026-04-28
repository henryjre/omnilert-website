import type { Knex } from 'knex';

const DISPLAY_UPDATES = [
  {
    key: 'rewards.view',
    name: 'View EPI Adjustment',
    description: 'Access the EPI Adjustment page and view adjustment requests',
  },
  {
    key: 'rewards.issue',
    name: 'Issue EPI Adjustment',
    description: 'Submit EPI adjustment requests',
  },
  {
    key: 'rewards.manage',
    name: 'Manage EPI Adjustment',
    description: 'Approve and reject EPI adjustment requests',
  },
  {
    key: 'payslips.view',
    name: 'View Payroll',
    description: 'Access the Payroll management page',
  },
  {
    key: 'payslips.issue',
    name: 'Issue Payroll',
    description: 'Submit payroll deduction and issuance requests',
  },
  {
    key: 'payslips.manage',
    name: 'Manage Payroll',
    description: 'Approve and reject payroll deduction and issuance requests',
  },
];

const LEGACY_DISPLAY_UPDATES = [
  {
    key: 'rewards.view',
    name: 'View Rewards',
    description: 'Access the Rewards page and view reward requests',
  },
  {
    key: 'rewards.issue',
    name: 'Issue Rewards',
    description: 'Submit EPI reward requests',
  },
  {
    key: 'rewards.manage',
    name: 'Manage Rewards',
    description: 'Approve and reject EPI reward requests',
  },
  {
    key: 'payslips.view',
    name: 'View Payslips Management',
    description: 'Access the Payslips management page',
  },
  {
    key: 'payslips.issue',
    name: 'Issue Payslips',
    description: 'Submit payslip deduction and issuance requests',
  },
  {
    key: 'payslips.manage',
    name: 'Manage Payslips',
    description: 'Approve and reject payslip deduction and issuance requests',
  },
];

async function applyDisplayUpdates(
  knex: Knex,
  updates: Array<{ key: string; name: string; description: string }>,
): Promise<void> {
  await knex.transaction(async (trx) => {
    for (const update of updates) {
      await trx('permissions')
        .where({ key: update.key })
        .update({ name: update.name, description: update.description });
    }
  });
}

export async function up(knex: Knex): Promise<void> {
  await applyDisplayUpdates(knex, DISPLAY_UPDATES);
}

export async function down(knex: Knex): Promise<void> {
  await applyDisplayUpdates(knex, LEGACY_DISPLAY_UPDATES);
}
