import type { Knex } from 'knex';

type ConstraintDrop = {
  table: string;
  constraint: string;
};

const CONSTRAINTS_TO_DROP: ConstraintDrop[] = [
  { table: 'shift_authorizations', constraint: 'shift_authorizations_user_id_foreign' },
  { table: 'shift_authorizations', constraint: 'shift_authorizations_resolved_by_foreign' },
  { table: 'registration_requests', constraint: 'registration_requests_reviewed_by_foreign' },
  {
    table: 'personal_information_verifications',
    constraint: 'personal_information_verifications_user_id_foreign',
  },
  {
    table: 'personal_information_verifications',
    constraint: 'personal_information_verifications_reviewed_by_foreign',
  },
  {
    table: 'employment_requirement_submissions',
    constraint: 'employment_requirement_submissions_user_id_foreign',
  },
  {
    table: 'employment_requirement_submissions',
    constraint: 'employment_requirement_submissions_reviewed_by_foreign',
  },
  {
    table: 'bank_information_verifications',
    constraint: 'bank_information_verifications_user_id_foreign',
  },
  {
    table: 'bank_information_verifications',
    constraint: 'bank_information_verifications_reviewed_by_foreign',
  },
];

async function hasConstraint(knex: Knex, tableName: string, constraintName: string): Promise<boolean> {
  const result = await knex
    .select('con.conname')
    .from({ con: 'pg_constraint' })
    .join({ rel: 'pg_class' }, 'rel.oid', 'con.conrelid')
    .join({ nsp: 'pg_namespace' }, 'nsp.oid', 'rel.relnamespace')
    .whereRaw('rel.relname = ?', [tableName])
    .andWhereRaw('nsp.nspname = current_schema()')
    .andWhere('con.conname', constraintName)
    .first();

  return Boolean(result);
}

export async function up(knex: Knex): Promise<void> {
  for (const item of CONSTRAINTS_TO_DROP) {
    const hasTable = await knex.schema.hasTable(item.table);
    if (!hasTable) continue;

    if (await hasConstraint(knex, item.table, item.constraint)) {
      await knex.raw(`
        ALTER TABLE ${item.table}
        DROP CONSTRAINT ${item.constraint}
      `);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasShiftAuth = await knex.schema.hasTable('shift_authorizations');
  if (hasShiftAuth) {
    if (!(await hasConstraint(knex, 'shift_authorizations', 'shift_authorizations_user_id_foreign'))) {
      await knex.raw(`
        ALTER TABLE shift_authorizations
        ADD CONSTRAINT shift_authorizations_user_id_foreign
        FOREIGN KEY (user_id)
        REFERENCES users(id)
      `);
    }
    if (!(await hasConstraint(knex, 'shift_authorizations', 'shift_authorizations_resolved_by_foreign'))) {
      await knex.raw(`
        ALTER TABLE shift_authorizations
        ADD CONSTRAINT shift_authorizations_resolved_by_foreign
        FOREIGN KEY (resolved_by)
        REFERENCES users(id)
      `);
    }
  }

  const hasRegistration = await knex.schema.hasTable('registration_requests');
  if (
    hasRegistration &&
    !(await hasConstraint(knex, 'registration_requests', 'registration_requests_reviewed_by_foreign'))
  ) {
    await knex.raw(`
      ALTER TABLE registration_requests
      ADD CONSTRAINT registration_requests_reviewed_by_foreign
      FOREIGN KEY (reviewed_by)
      REFERENCES users(id)
    `);
  }

  const hasPersonal = await knex.schema.hasTable('personal_information_verifications');
  if (hasPersonal) {
    if (
      !(await hasConstraint(
        knex,
        'personal_information_verifications',
        'personal_information_verifications_user_id_foreign',
      ))
    ) {
      await knex.raw(`
        ALTER TABLE personal_information_verifications
        ADD CONSTRAINT personal_information_verifications_user_id_foreign
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
      `);
    }
    if (
      !(await hasConstraint(
        knex,
        'personal_information_verifications',
        'personal_information_verifications_reviewed_by_foreign',
      ))
    ) {
      await knex.raw(`
        ALTER TABLE personal_information_verifications
        ADD CONSTRAINT personal_information_verifications_reviewed_by_foreign
        FOREIGN KEY (reviewed_by)
        REFERENCES users(id)
      `);
    }
  }

  const hasRequirements = await knex.schema.hasTable('employment_requirement_submissions');
  if (hasRequirements) {
    if (
      !(await hasConstraint(
        knex,
        'employment_requirement_submissions',
        'employment_requirement_submissions_user_id_foreign',
      ))
    ) {
      await knex.raw(`
        ALTER TABLE employment_requirement_submissions
        ADD CONSTRAINT employment_requirement_submissions_user_id_foreign
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
      `);
    }
    if (
      !(await hasConstraint(
        knex,
        'employment_requirement_submissions',
        'employment_requirement_submissions_reviewed_by_foreign',
      ))
    ) {
      await knex.raw(`
        ALTER TABLE employment_requirement_submissions
        ADD CONSTRAINT employment_requirement_submissions_reviewed_by_foreign
        FOREIGN KEY (reviewed_by)
        REFERENCES users(id)
      `);
    }
  }

  const hasBankVerifications = await knex.schema.hasTable('bank_information_verifications');
  if (hasBankVerifications) {
    if (
      !(await hasConstraint(
        knex,
        'bank_information_verifications',
        'bank_information_verifications_user_id_foreign',
      ))
    ) {
      await knex.raw(`
        ALTER TABLE bank_information_verifications
        ADD CONSTRAINT bank_information_verifications_user_id_foreign
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
      `);
    }
    if (
      !(await hasConstraint(
        knex,
        'bank_information_verifications',
        'bank_information_verifications_reviewed_by_foreign',
      ))
    ) {
      await knex.raw(`
        ALTER TABLE bank_information_verifications
        ADD CONSTRAINT bank_information_verifications_reviewed_by_foreign
        FOREIGN KEY (reviewed_by)
        REFERENCES users(id)
      `);
    }
  }
}
