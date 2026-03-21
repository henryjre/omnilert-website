import type { Knex } from 'knex';
import { buildAddCheckConstraintIfMissingSql } from '../../utils/migrationSql.js';

const VN_TABLE = 'violation_notices';
const VN_TARGETS_TABLE = 'violation_notice_targets';
const VN_MESSAGES_TABLE = 'violation_notice_messages';
const VN_ATTACHMENTS_TABLE = 'violation_notice_attachments';
const VN_REACTIONS_TABLE = 'violation_notice_reactions';
const VN_PARTICIPANTS_TABLE = 'violation_notice_participants';
const VN_MENTIONS_TABLE = 'violation_notice_mentions';
const VN_READS_TABLE = 'violation_notice_reads';

export async function up(knex: Knex): Promise<void> {
  const hasViolationNotices = await knex.schema.hasTable(VN_TABLE);
  if (!hasViolationNotices) {
    await knex.schema.createTable(VN_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.specificType('vn_number', 'serial').notNullable();
      table.string('status', 30).notNullable().defaultTo('queued');
      table.string('category', 20).notNullable();
      table.text('description').notNullable();
      table.uuid('created_by').notNullable();
      table.uuid('confirmed_by').nullable();
      table.uuid('issued_by').nullable();
      table.uuid('completed_by').nullable();
      table.uuid('rejected_by').nullable();
      table.text('rejection_reason').nullable();
      table.uuid('source_case_report_id').nullable().references('id').inTable('case_reports').onDelete('SET NULL');
      table.uuid('source_store_audit_id').nullable().references('id').inTable('store_audits').onDelete('SET NULL');
      table.text('issuance_file_url').nullable();
      table.string('issuance_file_name', 255).nullable();
      table.text('disciplinary_file_url').nullable();
      table.string('disciplinary_file_name', 255).nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  const hasViolationNoticeTargets = await knex.schema.hasTable(VN_TARGETS_TABLE);
  if (!hasViolationNoticeTargets) {
    await knex.schema.createTable(VN_TARGETS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('violation_notice_id').notNullable().references('id').inTable(VN_TABLE).onDelete('CASCADE');
      table.uuid('user_id').notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['violation_notice_id', 'user_id']);
    });
  }

  const hasViolationNoticeMessages = await knex.schema.hasTable(VN_MESSAGES_TABLE);
  if (!hasViolationNoticeMessages) {
    await knex.schema.createTable(VN_MESSAGES_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('violation_notice_id').notNullable().references('id').inTable(VN_TABLE).onDelete('CASCADE');
      table.uuid('user_id').notNullable();
      table.text('content').notNullable();
      table.string('type', 10).notNullable().defaultTo('message');
      table.boolean('is_deleted').notNullable().defaultTo(false);
      table.uuid('deleted_by').nullable();
      table.uuid('parent_message_id').nullable().references('id').inTable(VN_MESSAGES_TABLE).onDelete('SET NULL');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  const hasViolationNoticeAttachments = await knex.schema.hasTable(VN_ATTACHMENTS_TABLE);
  if (!hasViolationNoticeAttachments) {
    await knex.schema.createTable(VN_ATTACHMENTS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('violation_notice_id').notNullable().references('id').inTable(VN_TABLE).onDelete('CASCADE');
      table.uuid('message_id').nullable().references('id').inTable(VN_MESSAGES_TABLE).onDelete('SET NULL');
      table.uuid('uploaded_by').notNullable();
      table.text('file_url').notNullable();
      table.string('file_name', 255).notNullable();
      table.integer('file_size').notNullable();
      table.string('content_type', 100).notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  const hasViolationNoticeReactions = await knex.schema.hasTable(VN_REACTIONS_TABLE);
  if (!hasViolationNoticeReactions) {
    await knex.schema.createTable(VN_REACTIONS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('message_id').notNullable().references('id').inTable(VN_MESSAGES_TABLE).onDelete('CASCADE');
      table.uuid('user_id').notNullable();
      table.string('emoji', 20).notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['message_id', 'user_id', 'emoji'], 'vn_reactions_message_user_emoji_unique');
    });
  }

  const hasViolationNoticeParticipants = await knex.schema.hasTable(VN_PARTICIPANTS_TABLE);
  if (!hasViolationNoticeParticipants) {
    await knex.schema.createTable(VN_PARTICIPANTS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('violation_notice_id').notNullable().references('id').inTable(VN_TABLE).onDelete('CASCADE');
      table.uuid('user_id').notNullable();
      table.boolean('is_joined').notNullable().defaultTo(true);
      table.boolean('is_muted').notNullable().defaultTo(false);
      table.timestamp('last_read_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['violation_notice_id', 'user_id'], 'vn_participants_vn_user_unique');
    });
  }

  const hasViolationNoticeMentions = await knex.schema.hasTable(VN_MENTIONS_TABLE);
  if (!hasViolationNoticeMentions) {
    await knex.schema.createTable(VN_MENTIONS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('message_id').notNullable().references('id').inTable(VN_MESSAGES_TABLE).onDelete('CASCADE');
      table.uuid('mentioned_user_id').nullable();
      table.uuid('mentioned_role_id').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  const hasViolationNoticeReads = await knex.schema.hasTable(VN_READS_TABLE);
  if (!hasViolationNoticeReads) {
    await knex.schema.createTable(VN_READS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('violation_notice_id').notNullable().references('id').inTable(VN_TABLE).onDelete('CASCADE');
      table.uuid('user_id').notNullable();
      table.timestamp('last_read_at').notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['violation_notice_id', 'user_id'], 'vn_reads_vn_user_unique');
    });
  }

  await knex.raw(buildAddCheckConstraintIfMissingSql(
    VN_TABLE,
    'violation_notices_status_check',
    `status IN ('queued', 'discussion', 'issuance', 'disciplinary_meeting', 'completed', 'rejected')`,
  ));

  await knex.raw(buildAddCheckConstraintIfMissingSql(
    VN_TABLE,
    'violation_notices_category_check',
    `category IN ('manual', 'case_reports', 'store_audits')`,
  ));

  await knex.raw(buildAddCheckConstraintIfMissingSql(
    VN_MESSAGES_TABLE,
    'violation_notice_messages_type_check',
    `type IN ('message', 'system')`,
  ));

  await knex.raw(buildAddCheckConstraintIfMissingSql(
    VN_MENTIONS_TABLE,
    'violation_notice_mentions_target_check',
    'mentioned_user_id IS NOT NULL OR mentioned_role_id IS NOT NULL',
  ));

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS vn_status_idx
    ON ${VN_TABLE}(status)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS vn_created_by_idx
    ON ${VN_TABLE}(created_by)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS vn_created_at_idx
    ON ${VN_TABLE}(created_at DESC)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS vn_category_idx
    ON ${VN_TABLE}(category)
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS vn_number_unique
    ON ${VN_TABLE}(vn_number)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS vn_messages_vn_id_idx
    ON ${VN_MESSAGES_TABLE}(violation_notice_id, created_at ASC)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS vn_messages_parent_idx
    ON ${VN_MESSAGES_TABLE}(parent_message_id)
    WHERE parent_message_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS vn_attachments_vn_id_idx
    ON ${VN_ATTACHMENTS_TABLE}(violation_notice_id)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS vn_attachments_message_id_idx
    ON ${VN_ATTACHMENTS_TABLE}(message_id)
    WHERE message_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS vn_participants_user_joined_idx
    ON ${VN_PARTICIPANTS_TABLE}(user_id)
    WHERE is_joined = true
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS vn_mentions_message_id_idx
    ON ${VN_MENTIONS_TABLE}(message_id)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS vn_mentions_user_idx
    ON ${VN_MENTIONS_TABLE}(mentioned_user_id)
    WHERE mentioned_user_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS vn_targets_vn_id_idx
    ON ${VN_TARGETS_TABLE}(violation_notice_id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS vn_targets_vn_id_idx');
  await knex.raw('DROP INDEX IF EXISTS vn_mentions_user_idx');
  await knex.raw('DROP INDEX IF EXISTS vn_mentions_message_id_idx');
  await knex.raw('DROP INDEX IF EXISTS vn_participants_user_joined_idx');
  await knex.raw('DROP INDEX IF EXISTS vn_attachments_message_id_idx');
  await knex.raw('DROP INDEX IF EXISTS vn_attachments_vn_id_idx');
  await knex.raw('DROP INDEX IF EXISTS vn_messages_parent_idx');
  await knex.raw('DROP INDEX IF EXISTS vn_messages_vn_id_idx');
  await knex.raw('DROP INDEX IF EXISTS vn_number_unique');
  await knex.raw('DROP INDEX IF EXISTS vn_category_idx');
  await knex.raw('DROP INDEX IF EXISTS vn_created_at_idx');
  await knex.raw('DROP INDEX IF EXISTS vn_created_by_idx');
  await knex.raw('DROP INDEX IF EXISTS vn_status_idx');

  await knex.schema.dropTableIfExists(VN_READS_TABLE);
  await knex.schema.dropTableIfExists(VN_MENTIONS_TABLE);
  await knex.schema.dropTableIfExists(VN_PARTICIPANTS_TABLE);
  await knex.schema.dropTableIfExists(VN_REACTIONS_TABLE);
  await knex.schema.dropTableIfExists(VN_ATTACHMENTS_TABLE);
  await knex.schema.dropTableIfExists(VN_MESSAGES_TABLE);
  await knex.schema.dropTableIfExists(VN_TARGETS_TABLE);
  await knex.schema.dropTableIfExists(VN_TABLE);
}
