import { v4 as uuidv4 } from 'uuid';
import type { Knex } from 'knex';

const PERMISSIONS = [
  {
    key: 'aic_variance.view',
    name: 'View AIC Variance',
    description: 'Access the AIC Variance page and view records you have joined',
    category: 'aic_variance',
  },
  {
    key: 'aic_variance.manage',
    name: 'Manage AIC Variance',
    description: 'Mark AIC records as resolved, request violation notices, and manage tasks',
    category: 'aic_variance',
  },
];

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    for (const permission of PERMISSIONS) {
      await trx('permissions')
        .insert({
          id: uuidv4(),
          key: permission.key,
          name: permission.name,
          description: permission.description,
          category: permission.category,
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
      PERMISSIONS.map((permission) => permission.key),
    )
    .delete();
}
