import type { Knex } from 'knex';

const TABLE_NAME = 'global_store_audits';
const AUDIT_ID_IDX = 'global_store_audits_audit_id_idx';
const ACTIVE_AUDITOR_IDX = 'global_store_audits_active_auditor_unique';
const LIST_STATUS_IDX = 'global_store_audits_status_type_created_idx';
const COMPLETED_LIST_IDX = 'global_store_audits_completed_idx';
const ACCOUNT_CSS_OWNER_IDX = 'global_store_audits_css_owner_idx';
const ACCOUNT_COMP_OWNER_IDX = 'global_store_audits_comp_owner_idx';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (!hasTable) {
    await knex.schema.createTable(TABLE_NAME, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('company_name', 255).notNullable();
      table.string('company_slug', 255).notNullable();
      table.string('company_db_name', 255).notNullable();
      table.uuid('audit_id').notNullable();
      table.string('type', 30).notNullable();
      table.string('status', 20).notNullable();
      table.uuid('branch_id').notNullable();
      table.string('branch_name', 255).nullable();
      table.uuid('auditor_user_id').nullable();
      table.string('auditor_name', 255).nullable();
      table.decimal('monetary_reward', 10, 2).notNullable();
      table.timestamp('completed_at', { useTz: true }).nullable();
      table.timestamp('processing_started_at', { useTz: true }).nullable();
      table.boolean('vn_requested').notNullable().defaultTo(false);
      table.uuid('linked_vn_id').nullable();
      table.timestamp('created_at', { useTz: true }).notNullable();
      table.timestamp('updated_at', { useTz: true }).notNullable();
      table.timestamp('projection_synced_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.integer('css_odoo_order_id').nullable();
      table.string('css_pos_reference', 100).nullable();
      table.string('css_session_name', 100).nullable();
      table.string('css_company_name', 255).nullable();
      table.string('css_cashier_name', 255).nullable();
      table.uuid('css_cashier_user_key').nullable();
      table.timestamp('css_date_order', { useTz: true }).nullable();
      table.decimal('css_amount_total', 10, 2).nullable();
      table.jsonb('css_order_lines').nullable();
      table.jsonb('css_payments').nullable();
      table.decimal('css_star_rating', 3, 2).nullable();
      table.jsonb('css_criteria_scores').nullable();
      table.text('css_audit_log').nullable();
      table.text('css_ai_report').nullable();

      table.integer('comp_odoo_employee_id').nullable();
      table.string('comp_employee_name', 255).nullable();
      table.text('comp_employee_avatar').nullable();
      table.timestamp('comp_check_in_time', { useTz: true }).nullable();
      table.jsonb('comp_extra_fields').nullable();
      table.boolean('comp_productivity_rate').nullable();
      table.boolean('comp_uniform').nullable();
      table.boolean('comp_hygiene').nullable();
      table.boolean('comp_sop').nullable();
      table.text('comp_ai_report').nullable();

      table.unique(['company_id', 'audit_id']);
    });
  }

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${AUDIT_ID_IDX}
    ON ${TABLE_NAME}(audit_id)
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${ACTIVE_AUDITOR_IDX}
    ON ${TABLE_NAME}(auditor_user_id)
    WHERE status = 'processing' AND auditor_user_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${LIST_STATUS_IDX}
    ON ${TABLE_NAME}(status, type, created_at DESC)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${COMPLETED_LIST_IDX}
    ON ${TABLE_NAME}(status, completed_at DESC, created_at DESC)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${ACCOUNT_CSS_OWNER_IDX}
    ON ${TABLE_NAME}(status, type, css_cashier_user_key, completed_at DESC)
    WHERE css_cashier_user_key IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${ACCOUNT_COMP_OWNER_IDX}
    ON ${TABLE_NAME}(status, type, comp_odoo_employee_id, completed_at DESC)
    WHERE comp_odoo_employee_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${ACCOUNT_COMP_OWNER_IDX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${ACCOUNT_CSS_OWNER_IDX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${COMPLETED_LIST_IDX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${LIST_STATUS_IDX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${ACTIVE_AUDITOR_IDX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${AUDIT_ID_IDX}`);
  await knex.schema.dropTableIfExists(TABLE_NAME);
}
