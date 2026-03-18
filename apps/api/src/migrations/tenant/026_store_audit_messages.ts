import type { Knex } from 'knex';

const STORE_AUDIT_MESSAGES_TABLE = 'store_audit_messages';
const STORE_AUDIT_ATTACHMENTS_TABLE = 'store_audit_attachments';

const STORE_AUDIT_MESSAGES_AUDIT_IDX = 'store_audit_messages_audit_idx';
const STORE_AUDIT_MESSAGES_USER_IDX = 'store_audit_messages_user_idx';
const STORE_AUDIT_ATTACHMENTS_AUDIT_IDX = 'store_audit_attachments_audit_idx';
const STORE_AUDIT_ATTACHMENTS_MESSAGE_IDX = 'store_audit_attachments_message_idx';

export async function up(knex: Knex): Promise<void> {
  const hasMessagesTable = await knex.schema.hasTable(STORE_AUDIT_MESSAGES_TABLE);
  if (!hasMessagesTable) {
    await knex.schema.createTable(STORE_AUDIT_MESSAGES_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('store_audit_id').notNullable().references('id').inTable('store_audits').onDelete('CASCADE');
      table.uuid('user_id').notNullable();
      table.text('content').notNullable();
      table.boolean('is_deleted').notNullable().defaultTo(false);
      table.uuid('deleted_by').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  const hasAttachmentsTable = await knex.schema.hasTable(STORE_AUDIT_ATTACHMENTS_TABLE);
  if (!hasAttachmentsTable) {
    await knex.schema.createTable(STORE_AUDIT_ATTACHMENTS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('store_audit_id').notNullable().references('id').inTable('store_audits').onDelete('CASCADE');
      table.uuid('message_id').nullable().references('id').inTable(STORE_AUDIT_MESSAGES_TABLE).onDelete('SET NULL');
      table.uuid('uploaded_by').notNullable();
      table.text('file_url').notNullable();
      table.string('file_name', 255).notNullable();
      table.integer('file_size').notNullable();
      table.string('content_type', 100).notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${STORE_AUDIT_MESSAGES_AUDIT_IDX}
    ON ${STORE_AUDIT_MESSAGES_TABLE}(store_audit_id, created_at ASC)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${STORE_AUDIT_MESSAGES_USER_IDX}
    ON ${STORE_AUDIT_MESSAGES_TABLE}(user_id)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${STORE_AUDIT_ATTACHMENTS_AUDIT_IDX}
    ON ${STORE_AUDIT_ATTACHMENTS_TABLE}(store_audit_id)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${STORE_AUDIT_ATTACHMENTS_MESSAGE_IDX}
    ON ${STORE_AUDIT_ATTACHMENTS_TABLE}(message_id)
    WHERE message_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${STORE_AUDIT_ATTACHMENTS_MESSAGE_IDX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${STORE_AUDIT_ATTACHMENTS_AUDIT_IDX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${STORE_AUDIT_MESSAGES_USER_IDX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${STORE_AUDIT_MESSAGES_AUDIT_IDX}`);

  await knex.schema.dropTableIfExists(STORE_AUDIT_ATTACHMENTS_TABLE);
  await knex.schema.dropTableIfExists(STORE_AUDIT_MESSAGES_TABLE);
}
