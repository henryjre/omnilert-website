import type { Knex } from 'knex';

const TABLE = 'users';

export async function up(knex: Knex): Promise<void> {
  const addIfMissing = async (column: string, cb: (table: Knex.AlterTableBuilder) => void) => {
    const has = await knex.schema.hasColumn(TABLE, column);
    if (!has) {
      await knex.schema.alterTable(TABLE, cb);
    }
  };

  await addIfMissing('mobile_number', (table) => {
    table.string('mobile_number', 50).nullable();
  });

  await addIfMissing('legal_name', (table) => {
    table.string('legal_name', 255).nullable();
  });

  await addIfMissing('birthday', (table) => {
    table.date('birthday').nullable();
  });

  await addIfMissing('gender', (table) => {
    table.string('gender', 20).nullable();
  });

  await addIfMissing('pin', (table) => {
    table.string('pin', 50).nullable();
  });

  await addIfMissing('updated', (table) => {
    table.boolean('updated').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  const dropIfExists = async (column: string) => {
    const has = await knex.schema.hasColumn(TABLE, column);
    if (has) {
      await knex.schema.alterTable(TABLE, (table) => {
        table.dropColumn(column);
      });
    }
  };

  await dropIfExists('updated');
  await dropIfExists('pin');
  await dropIfExists('gender');
  await dropIfExists('birthday');
  await dropIfExists('legal_name');
  await dropIfExists('mobile_number');
}
