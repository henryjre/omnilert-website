import type { Knex } from 'knex';

const TABLE_NAME = 'registration_requests';

async function addColumnIfMissing(
  knex: Knex,
  columnName: string,
  addColumn: (table: Knex.AlterTableBuilder) => void,
): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, columnName);
  if (hasColumn) return;
  await knex.schema.alterTable(TABLE_NAME, addColumn);
}

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (!hasTable) return;

  await addColumnIfMissing(knex, 'middle_name', (table) => table.string('middle_name', 100).nullable());
  await addColumnIfMissing(knex, 'suffix', (table) => table.string('suffix', 50).nullable());
  await addColumnIfMissing(knex, 'birthday', (table) => table.date('birthday').nullable());
  await addColumnIfMissing(knex, 'gender', (table) => table.string('gender', 20).nullable());
  await addColumnIfMissing(knex, 'marital_status', (table) => table.string('marital_status', 50).nullable());
  await addColumnIfMissing(knex, 'address', (table) => table.string('address', 500).nullable());
  await addColumnIfMissing(knex, 'mobile_number', (table) => table.string('mobile_number', 50).nullable());
  await addColumnIfMissing(knex, 'sss_number', (table) => table.string('sss_number', 100).nullable());
  await addColumnIfMissing(knex, 'tin_number', (table) => table.string('tin_number', 100).nullable());
  await addColumnIfMissing(knex, 'pagibig_number', (table) => table.string('pagibig_number', 100).nullable());
  await addColumnIfMissing(knex, 'philhealth_number', (table) => table.string('philhealth_number', 100).nullable());
  await addColumnIfMissing(knex, 'emergency_contact', (table) => table.string('emergency_contact', 255).nullable());
  await addColumnIfMissing(knex, 'emergency_phone', (table) => table.string('emergency_phone', 50).nullable());
  await addColumnIfMissing(knex, 'emergency_relationship', (table) => table.string('emergency_relationship', 100).nullable());
  await addColumnIfMissing(knex, 'profile_picture_url', (table) => table.string('profile_picture_url', 500).nullable());
  await addColumnIfMissing(knex, 'valid_id_url', (table) => table.string('valid_id_url', 500).nullable());
  await addColumnIfMissing(knex, 'approved_profile', (table) => table.jsonb('approved_profile').nullable());
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (!hasTable) return;

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.dropColumns(
      'approved_profile',
      'valid_id_url',
      'profile_picture_url',
      'emergency_relationship',
      'emergency_phone',
      'emergency_contact',
      'philhealth_number',
      'pagibig_number',
      'tin_number',
      'sss_number',
      'mobile_number',
      'address',
      'marital_status',
      'gender',
      'birthday',
      'suffix',
      'middle_name',
    );
  });
}
