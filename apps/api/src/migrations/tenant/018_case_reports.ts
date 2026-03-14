import type { Knex } from 'knex';

const CASE_REPORTS_TABLE = 'case_reports';
const CASE_MESSAGES_TABLE = 'case_messages';
const CASE_ATTACHMENTS_TABLE = 'case_attachments';
const CASE_REACTIONS_TABLE = 'case_reactions';
const CASE_PARTICIPANTS_TABLE = 'case_participants';
const CASE_MENTIONS_TABLE = 'case_mentions';

export async function up(knex: Knex): Promise<void> {
  const hasCaseReports = await knex.schema.hasTable(CASE_REPORTS_TABLE);
  if (!hasCaseReports) {
    await knex.schema.createTable(CASE_REPORTS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.specificType('case_number', 'serial').notNullable();
      table.string('title', 255).notNullable();
      table.text('description').notNullable();
      table.string('status', 20).notNullable().defaultTo('open');
      table.text('corrective_action').nullable();
      table.text('resolution').nullable();
      table.boolean('vn_requested').notNullable().defaultTo(false);
      table.uuid('created_by').notNullable();
      table.uuid('closed_by').nullable();
      table.timestamp('closed_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  const hasCaseMessages = await knex.schema.hasTable(CASE_MESSAGES_TABLE);
  if (!hasCaseMessages) {
    await knex.schema.createTable(CASE_MESSAGES_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('case_id').notNullable().references('id').inTable(CASE_REPORTS_TABLE).onDelete('CASCADE');
      table.uuid('user_id').notNullable();
      table.text('content').notNullable();
      table.boolean('is_system').notNullable().defaultTo(false);
      table.uuid('parent_message_id').nullable().references('id').inTable(CASE_MESSAGES_TABLE).onDelete('SET NULL');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  const hasCaseAttachments = await knex.schema.hasTable(CASE_ATTACHMENTS_TABLE);
  if (!hasCaseAttachments) {
    await knex.schema.createTable(CASE_ATTACHMENTS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('case_id').notNullable().references('id').inTable(CASE_REPORTS_TABLE).onDelete('CASCADE');
      table.uuid('message_id').nullable().references('id').inTable(CASE_MESSAGES_TABLE).onDelete('SET NULL');
      table.uuid('uploaded_by').notNullable();
      table.text('file_url').notNullable();
      table.string('file_name', 255).notNullable();
      table.integer('file_size').notNullable();
      table.string('content_type', 100).notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  const hasCaseReactions = await knex.schema.hasTable(CASE_REACTIONS_TABLE);
  if (!hasCaseReactions) {
    await knex.schema.createTable(CASE_REACTIONS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('message_id').notNullable().references('id').inTable(CASE_MESSAGES_TABLE).onDelete('CASCADE');
      table.uuid('user_id').notNullable();
      table.string('emoji', 20).notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['message_id', 'user_id', 'emoji'], 'case_reactions_message_user_emoji_unique');
    });
  }

  const hasCaseParticipants = await knex.schema.hasTable(CASE_PARTICIPANTS_TABLE);
  if (!hasCaseParticipants) {
    await knex.schema.createTable(CASE_PARTICIPANTS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('case_id').notNullable().references('id').inTable(CASE_REPORTS_TABLE).onDelete('CASCADE');
      table.uuid('user_id').notNullable();
      table.boolean('is_joined').notNullable().defaultTo(true);
      table.boolean('is_muted').notNullable().defaultTo(false);
      table.timestamp('last_read_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['case_id', 'user_id'], 'case_participants_case_user_unique');
    });
  }

  const hasCaseMentions = await knex.schema.hasTable(CASE_MENTIONS_TABLE);
  if (!hasCaseMentions) {
    await knex.schema.createTable(CASE_MENTIONS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('message_id').notNullable().references('id').inTable(CASE_MESSAGES_TABLE).onDelete('CASCADE');
      table.uuid('mentioned_user_id').nullable();
      table.uuid('mentioned_role_id').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  await knex.raw(`
    ALTER TABLE ${CASE_REPORTS_TABLE}
    ADD CONSTRAINT ${CASE_REPORTS_TABLE}_status_check
    CHECK (status IN ('open', 'closed'))
  `).catch(() => undefined);

  await knex.raw(`
    ALTER TABLE ${CASE_MENTIONS_TABLE}
    ADD CONSTRAINT ${CASE_MENTIONS_TABLE}_target_check
    CHECK (mentioned_user_id IS NOT NULL OR mentioned_role_id IS NOT NULL)
  `).catch(() => undefined);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS case_reports_status_idx
    ON ${CASE_REPORTS_TABLE}(status)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS case_reports_created_by_idx
    ON ${CASE_REPORTS_TABLE}(created_by)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS case_reports_created_at_idx
    ON ${CASE_REPORTS_TABLE}(created_at DESC)
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS case_reports_case_number_unique
    ON ${CASE_REPORTS_TABLE}(case_number)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS case_messages_case_id_idx
    ON ${CASE_MESSAGES_TABLE}(case_id, created_at ASC)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS case_messages_parent_idx
    ON ${CASE_MESSAGES_TABLE}(parent_message_id)
    WHERE parent_message_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS case_attachments_case_id_idx
    ON ${CASE_ATTACHMENTS_TABLE}(case_id)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS case_attachments_message_id_idx
    ON ${CASE_ATTACHMENTS_TABLE}(message_id)
    WHERE message_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS case_participants_user_joined_idx
    ON ${CASE_PARTICIPANTS_TABLE}(user_id)
    WHERE is_joined = true
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS case_mentions_message_id_idx
    ON ${CASE_MENTIONS_TABLE}(message_id)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS case_mentions_user_idx
    ON ${CASE_MENTIONS_TABLE}(mentioned_user_id)
    WHERE mentioned_user_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS case_mentions_user_idx');
  await knex.raw('DROP INDEX IF EXISTS case_mentions_message_id_idx');
  await knex.raw('DROP INDEX IF EXISTS case_participants_user_joined_idx');
  await knex.raw('DROP INDEX IF EXISTS case_attachments_message_id_idx');
  await knex.raw('DROP INDEX IF EXISTS case_attachments_case_id_idx');
  await knex.raw('DROP INDEX IF EXISTS case_messages_parent_idx');
  await knex.raw('DROP INDEX IF EXISTS case_messages_case_id_idx');
  await knex.raw('DROP INDEX IF EXISTS case_reports_case_number_unique');
  await knex.raw('DROP INDEX IF EXISTS case_reports_created_at_idx');
  await knex.raw('DROP INDEX IF EXISTS case_reports_created_by_idx');
  await knex.raw('DROP INDEX IF EXISTS case_reports_status_idx');

  await knex.schema.dropTableIfExists(CASE_MENTIONS_TABLE);
  await knex.schema.dropTableIfExists(CASE_PARTICIPANTS_TABLE);
  await knex.schema.dropTableIfExists(CASE_REACTIONS_TABLE);
  await knex.schema.dropTableIfExists(CASE_ATTACHMENTS_TABLE);
  await knex.schema.dropTableIfExists(CASE_MESSAGES_TABLE);
  await knex.schema.dropTableIfExists(CASE_REPORTS_TABLE);
}
