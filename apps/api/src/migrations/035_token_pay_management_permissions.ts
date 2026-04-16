import { v4 as uuidv4 } from 'uuid';
import type { Knex } from 'knex';

const PERMISSIONS = [
  {
    key: 'token_pay.view',
    name: 'View Token Pay Management',
    description: 'View token pay management page and all user wallets',
    category: 'token_pay',
  },
  {
    key: 'token_pay.issue',
    name: 'Issue Token Pay',
    description: 'Submit token pay issuance and deduction requests',
    category: 'token_pay',
  },
  {
    key: 'token_pay.manage',
    name: 'Manage Token Pay',
    description: 'Approve and reject token pay issuance requests',
    category: 'token_pay',
  },
  {
    key: 'token_pay.account_manage',
    name: 'Manage Token Pay Accounts',
    description: 'Suspend and unsuspend user token pay accounts',
    category: 'token_pay',
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
