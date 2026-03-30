import type { Knex } from 'knex';

const TABLE_NAME = 'store_audits';
const TYPE_CHECK_NAME = 'store_audits_type_check';
const RATING_COLUMNS = [
  'scc_customer_interaction',
  'scc_cashiering',
  'scc_suggestive_selling_and_upselling',
  'scc_service_efficiency',
] as const;

function buildCreateCheckConstraintSql(constraintName: string, condition: string): string {
  return `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = '${constraintName}'
      ) THEN
        ALTER TABLE ${TABLE_NAME}
        ADD CONSTRAINT ${constraintName}
        CHECK (${condition});
      END IF;
    END $$;
  `;
}

export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TABLE_NAME);
  if (!tableExists) {
    return;
  }

  await knex(TABLE_NAME)
    .where({ type: 'compliance' })
    .update({ type: 'service_crew_cctv' });

  const hasCompOdooEmployeeId = await knex.schema.hasColumn(TABLE_NAME, 'comp_odoo_employee_id');
  const hasSccOdooEmployeeId = await knex.schema.hasColumn(TABLE_NAME, 'scc_odoo_employee_id');
  const hasCompEmployeeName = await knex.schema.hasColumn(TABLE_NAME, 'comp_employee_name');
  const hasSccEmployeeName = await knex.schema.hasColumn(TABLE_NAME, 'scc_employee_name');
  const hasCompProductivityRate = await knex.schema.hasColumn(TABLE_NAME, 'comp_productivity_rate');
  const hasSccProductivityRate = await knex.schema.hasColumn(TABLE_NAME, 'scc_productivity_rate');
  const hasCompUniform = await knex.schema.hasColumn(TABLE_NAME, 'comp_uniform');
  const hasSccUniformCompliance = await knex.schema.hasColumn(TABLE_NAME, 'scc_uniform_compliance');
  const hasCompHygiene = await knex.schema.hasColumn(TABLE_NAME, 'comp_hygiene');
  const hasSccHygieneCompliance = await knex.schema.hasColumn(TABLE_NAME, 'scc_hygiene_compliance');
  const hasCompSop = await knex.schema.hasColumn(TABLE_NAME, 'comp_sop');
  const hasSccSopCompliance = await knex.schema.hasColumn(TABLE_NAME, 'scc_sop_compliance');
  const hasCompAiReport = await knex.schema.hasColumn(TABLE_NAME, 'comp_ai_report');
  const hasSccAiReport = await knex.schema.hasColumn(TABLE_NAME, 'scc_ai_report');
  const hasCompCheckInTime = await knex.schema.hasColumn(TABLE_NAME, 'comp_check_in_time');
  const hasCompExtraFields = await knex.schema.hasColumn(TABLE_NAME, 'comp_extra_fields');
  const hasCustomerInteraction = await knex.schema.hasColumn(TABLE_NAME, 'scc_customer_interaction');
  const hasCashiering = await knex.schema.hasColumn(TABLE_NAME, 'scc_cashiering');
  const hasSuggestiveSelling = await knex.schema.hasColumn(TABLE_NAME, 'scc_suggestive_selling_and_upselling');
  const hasServiceEfficiency = await knex.schema.hasColumn(TABLE_NAME, 'scc_service_efficiency');

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    if (hasCompOdooEmployeeId && !hasSccOdooEmployeeId) {
      table.renameColumn('comp_odoo_employee_id', 'scc_odoo_employee_id');
    }
    if (hasCompEmployeeName && !hasSccEmployeeName) {
      table.renameColumn('comp_employee_name', 'scc_employee_name');
    }
    if (hasCompProductivityRate && !hasSccProductivityRate) {
      table.renameColumn('comp_productivity_rate', 'scc_productivity_rate');
    }
    if (hasCompUniform && !hasSccUniformCompliance) {
      table.renameColumn('comp_uniform', 'scc_uniform_compliance');
    }
    if (hasCompHygiene && !hasSccHygieneCompliance) {
      table.renameColumn('comp_hygiene', 'scc_hygiene_compliance');
    }
    if (hasCompSop && !hasSccSopCompliance) {
      table.renameColumn('comp_sop', 'scc_sop_compliance');
    }
    if (hasCompAiReport && !hasSccAiReport) {
      table.renameColumn('comp_ai_report', 'scc_ai_report');
    }
    if (hasCompCheckInTime) {
      table.dropColumn('comp_check_in_time');
    }
    if (hasCompExtraFields) {
      table.dropColumn('comp_extra_fields');
    }
    if (!hasCustomerInteraction) {
      table.integer('scc_customer_interaction').nullable();
    }
    if (!hasCashiering) {
      table.integer('scc_cashiering').nullable();
    }
    if (!hasSuggestiveSelling) {
      table.integer('scc_suggestive_selling_and_upselling').nullable();
    }
    if (!hasServiceEfficiency) {
      table.integer('scc_service_efficiency').nullable();
    }
  });

  await knex.raw(`ALTER TABLE ${TABLE_NAME} DROP CONSTRAINT IF EXISTS ${TYPE_CHECK_NAME}`);
  await knex.raw(
    buildCreateCheckConstraintSql(
      TYPE_CHECK_NAME,
      `type IN ('customer_service', 'service_crew_cctv')`,
    ),
  );

  for (const column of RATING_COLUMNS) {
    await knex.raw(
      buildCreateCheckConstraintSql(
        `${TABLE_NAME}_${column}_check`,
        `${column} IS NULL OR (${column} BETWEEN 1 AND 5)`,
      ),
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TABLE_NAME);
  if (!tableExists) {
    return;
  }

  await knex(TABLE_NAME)
    .where({ type: 'service_crew_cctv' })
    .update({ type: 'compliance' });

  const hasSccOdooEmployeeId = await knex.schema.hasColumn(TABLE_NAME, 'scc_odoo_employee_id');
  const hasCompOdooEmployeeId = await knex.schema.hasColumn(TABLE_NAME, 'comp_odoo_employee_id');
  const hasSccEmployeeName = await knex.schema.hasColumn(TABLE_NAME, 'scc_employee_name');
  const hasCompEmployeeName = await knex.schema.hasColumn(TABLE_NAME, 'comp_employee_name');
  const hasSccProductivityRate = await knex.schema.hasColumn(TABLE_NAME, 'scc_productivity_rate');
  const hasCompProductivityRate = await knex.schema.hasColumn(TABLE_NAME, 'comp_productivity_rate');
  const hasSccUniformCompliance = await knex.schema.hasColumn(TABLE_NAME, 'scc_uniform_compliance');
  const hasCompUniform = await knex.schema.hasColumn(TABLE_NAME, 'comp_uniform');
  const hasSccHygieneCompliance = await knex.schema.hasColumn(TABLE_NAME, 'scc_hygiene_compliance');
  const hasCompHygiene = await knex.schema.hasColumn(TABLE_NAME, 'comp_hygiene');
  const hasSccSopCompliance = await knex.schema.hasColumn(TABLE_NAME, 'scc_sop_compliance');
  const hasCompSop = await knex.schema.hasColumn(TABLE_NAME, 'comp_sop');
  const hasSccAiReport = await knex.schema.hasColumn(TABLE_NAME, 'scc_ai_report');
  const hasCompAiReport = await knex.schema.hasColumn(TABLE_NAME, 'comp_ai_report');
  const hasCustomerInteraction = await knex.schema.hasColumn(TABLE_NAME, 'scc_customer_interaction');
  const hasCashiering = await knex.schema.hasColumn(TABLE_NAME, 'scc_cashiering');
  const hasSuggestiveSelling = await knex.schema.hasColumn(TABLE_NAME, 'scc_suggestive_selling_and_upselling');
  const hasServiceEfficiency = await knex.schema.hasColumn(TABLE_NAME, 'scc_service_efficiency');

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    if (hasCustomerInteraction) {
      table.dropColumn('scc_customer_interaction');
    }
    if (hasCashiering) {
      table.dropColumn('scc_cashiering');
    }
    if (hasSuggestiveSelling) {
      table.dropColumn('scc_suggestive_selling_and_upselling');
    }
    if (hasServiceEfficiency) {
      table.dropColumn('scc_service_efficiency');
    }
    if (hasSccAiReport && !hasCompAiReport) {
      table.renameColumn('scc_ai_report', 'comp_ai_report');
    }
    if (hasSccSopCompliance && !hasCompSop) {
      table.renameColumn('scc_sop_compliance', 'comp_sop');
    }
    if (hasSccHygieneCompliance && !hasCompHygiene) {
      table.renameColumn('scc_hygiene_compliance', 'comp_hygiene');
    }
    if (hasSccUniformCompliance && !hasCompUniform) {
      table.renameColumn('scc_uniform_compliance', 'comp_uniform');
    }
    if (hasSccProductivityRate && !hasCompProductivityRate) {
      table.renameColumn('scc_productivity_rate', 'comp_productivity_rate');
    }
    if (hasSccEmployeeName && !hasCompEmployeeName) {
      table.renameColumn('scc_employee_name', 'comp_employee_name');
    }
    if (hasSccOdooEmployeeId && !hasCompOdooEmployeeId) {
      table.renameColumn('scc_odoo_employee_id', 'comp_odoo_employee_id');
    }
  });

  await knex.raw(`ALTER TABLE ${TABLE_NAME} DROP CONSTRAINT IF EXISTS ${TYPE_CHECK_NAME}`);
  await knex.raw(
    buildCreateCheckConstraintSql(
      TYPE_CHECK_NAME,
      `type IN ('customer_service', 'compliance')`,
    ),
  );

  for (const column of RATING_COLUMNS) {
    await knex.raw(`ALTER TABLE ${TABLE_NAME} DROP CONSTRAINT IF EXISTS ${TABLE_NAME}_${column}_check`);
  }
}
