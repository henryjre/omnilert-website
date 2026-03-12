import type { Knex } from 'knex';

const STORE_AUDITS_TABLE = 'store_audits';
const STORE_AUDITS_STATUS_IDX = 'store_audits_status_idx';
const STORE_AUDITS_TYPE_STATUS_IDX = 'store_audits_type_status_idx';
const STORE_AUDITS_AUDITOR_IDX = 'store_audits_auditor_idx';
const STORE_AUDITS_ONE_ACTIVE_PER_AUDITOR_IDX = 'store_audits_one_active_per_auditor';
const STORE_AUDITS_CSS_ORDER_UNIQUE_IDX = 'store_audits_css_order_unique';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(STORE_AUDITS_TABLE);
  if (!hasTable) {
    await knex.schema.createTable(STORE_AUDITS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('type', 30).notNullable();
      table.string('status', 20).notNullable().defaultTo('pending');

      table.uuid('branch_id').notNullable().references('id').inTable('branches');
      table.uuid('auditor_user_id').nullable();
      table.decimal('monetary_reward', 10, 2).notNullable();
      table.timestamp('completed_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

      table.integer('css_odoo_order_id').nullable();
      table.string('css_pos_reference', 100).nullable();
      table.string('css_session_name', 100).nullable();
      table.string('css_company_name', 255).nullable();
      table.string('css_cashier_name', 255).nullable();
      table.uuid('css_cashier_user_key').nullable();
      table.timestamp('css_date_order').nullable();
      table.decimal('css_amount_total', 10, 2).nullable();
      table.jsonb('css_order_lines').nullable();
      table.jsonb('css_payments').nullable();
      table.integer('css_star_rating').nullable();
      table.text('css_audit_log').nullable();
      table.text('css_ai_report').nullable();

      table.integer('comp_odoo_employee_id').nullable();
      table.string('comp_employee_name', 255).nullable();
      table.text('comp_employee_avatar').nullable();
      table.timestamp('comp_check_in_time').nullable();
      table.jsonb('comp_extra_fields').nullable();
      table.boolean('comp_non_idle').nullable();
      table.boolean('comp_cellphone').nullable();
      table.boolean('comp_uniform').nullable();
      table.boolean('comp_hygiene').nullable();
      table.boolean('comp_sop').nullable();
    });
  }

  await knex.raw(`
    ALTER TABLE ${STORE_AUDITS_TABLE}
    ADD CONSTRAINT ${STORE_AUDITS_TABLE}_type_check
    CHECK (type IN ('customer_service', 'compliance'))
  `).catch(() => undefined);

  await knex.raw(`
    ALTER TABLE ${STORE_AUDITS_TABLE}
    ADD CONSTRAINT ${STORE_AUDITS_TABLE}_status_check
    CHECK (status IN ('pending', 'processing', 'completed'))
  `).catch(() => undefined);

  await knex.raw(`
    ALTER TABLE ${STORE_AUDITS_TABLE}
    ADD CONSTRAINT ${STORE_AUDITS_TABLE}_css_star_rating_check
    CHECK (css_star_rating BETWEEN 1 AND 5)
  `).catch(() => undefined);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${STORE_AUDITS_STATUS_IDX}
    ON ${STORE_AUDITS_TABLE}(status)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${STORE_AUDITS_TYPE_STATUS_IDX}
    ON ${STORE_AUDITS_TABLE}(type, status)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${STORE_AUDITS_AUDITOR_IDX}
    ON ${STORE_AUDITS_TABLE}(auditor_user_id)
    WHERE auditor_user_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${STORE_AUDITS_ONE_ACTIVE_PER_AUDITOR_IDX}
    ON ${STORE_AUDITS_TABLE}(auditor_user_id)
    WHERE status = 'processing'
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${STORE_AUDITS_CSS_ORDER_UNIQUE_IDX}
    ON ${STORE_AUDITS_TABLE}(css_odoo_order_id)
    WHERE type = 'customer_service' AND status != 'completed'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${STORE_AUDITS_CSS_ORDER_UNIQUE_IDX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${STORE_AUDITS_ONE_ACTIVE_PER_AUDITOR_IDX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${STORE_AUDITS_AUDITOR_IDX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${STORE_AUDITS_TYPE_STATUS_IDX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${STORE_AUDITS_STATUS_IDX}`);
  await knex.schema.dropTableIfExists(STORE_AUDITS_TABLE);
}
