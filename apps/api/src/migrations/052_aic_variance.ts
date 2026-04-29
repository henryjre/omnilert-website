import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('aic_records', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.integer('aic_number').notNullable();
    t.text('reference').notNullable();
    t.uuid('branch_id').nullable().references('id').inTable('branches').onDelete('SET NULL');
    t.date('aic_date').notNullable();
    t.text('status').notNullable().defaultTo('open');
    t.text('summary').nullable();
    t.text('resolution').nullable();
    t.boolean('vn_requested').notNullable().defaultTo(false);
    t.uuid('linked_vn_id').nullable();
    t.uuid('resolved_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('resolved_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(
    'ALTER TABLE aic_records ADD CONSTRAINT aic_records_company_reference_unique UNIQUE (company_id, reference)',
  );
  await knex.raw('CREATE INDEX idx_aic_records_company_id ON aic_records (company_id)');
  await knex.raw('CREATE INDEX idx_aic_records_status ON aic_records (status)');

  await knex.schema.createTable('aic_products', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('aic_record_id').notNullable().references('id').inTable('aic_records').onDelete('CASCADE');
    t.integer('odoo_product_tmpl_id').notNullable();
    t.text('product_name').notNullable();
    t.decimal('quantity', 15, 4).notNullable();
    t.text('uom_name').notNullable();
    t.text('flag_type').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_aic_products_record_id ON aic_products (aic_record_id)');

  await knex.schema.createTable('aic_participants', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('aic_record_id').notNullable().references('id').inTable('aic_records').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.boolean('is_joined').notNullable().defaultTo(false);
    t.boolean('is_muted').notNullable().defaultTo(false);
    t.timestamp('last_read_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['aic_record_id', 'user_id']);
  });

  await knex.schema.createTable('aic_messages', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('aic_record_id').notNullable().references('id').inTable('aic_records').onDelete('CASCADE');
    t.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.text('content').notNullable().defaultTo('');
    t.boolean('is_system').notNullable().defaultTo(false);
    t.boolean('is_deleted').notNullable().defaultTo(false);
    t.boolean('is_edited').notNullable().defaultTo(false);
    t.uuid('parent_message_id').nullable().references('id').inTable('aic_messages').onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_aic_messages_record_id ON aic_messages (aic_record_id)');

  await knex.schema.createTable('aic_message_reactions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('message_id').notNullable().references('id').inTable('aic_messages').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('emoji').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['message_id', 'user_id', 'emoji']);
  });

  await knex.schema.createTable('aic_message_attachments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('message_id').nullable().references('id').inTable('aic_messages').onDelete('CASCADE');
    t.uuid('aic_record_id').notNullable().references('id').inTable('aic_records').onDelete('CASCADE');
    t.text('file_url').notNullable();
    t.text('file_name').notNullable();
    t.bigint('file_size').notNullable();
    t.text('content_type').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('aic_message_mentions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('message_id').notNullable().references('id').inTable('aic_messages').onDelete('CASCADE');
    t.uuid('mentioned_user_id').nullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('mentioned_role_id').nullable().references('id').inTable('roles').onDelete('CASCADE');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('aic_tasks', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('aic_record_id').notNullable().references('id').inTable('aic_records').onDelete('CASCADE');
    t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.uuid('source_message_id').nullable().references('id').inTable('aic_messages').onDelete('SET NULL');
    t.text('description').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_aic_tasks_record_id ON aic_tasks (aic_record_id)');

  await knex.schema.createTable('aic_task_assignees', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('task_id').notNullable().references('id').inTable('aic_tasks').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.timestamp('completed_at', { useTz: true }).nullable();
    t.uuid('completed_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['task_id', 'user_id']);
  });

  await knex.schema.createTable('aic_task_messages', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('task_id').notNullable().references('id').inTable('aic_tasks').onDelete('CASCADE');
    t.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.text('content').nullable();
    t.text('file_url').nullable();
    t.text('file_name').nullable();
    t.bigint('file_size').nullable();
    t.text('content_type').nullable();
    t.uuid('parent_message_id').nullable().references('id').inTable('aic_task_messages').onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_aic_task_messages_task_id ON aic_task_messages (task_id)');

  await knex.schema.createTable('aic_task_message_reactions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('message_id').notNullable().references('id').inTable('aic_task_messages').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('emoji').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['message_id', 'user_id', 'emoji']);
  });

  await knex.schema.createTable('aic_task_message_mentions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('message_id').notNullable().references('id').inTable('aic_task_messages').onDelete('CASCADE');
    t.uuid('mentioned_user_id').nullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('mentioned_role_id').nullable().references('id').inTable('roles').onDelete('CASCADE');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('aic_task_message_mentions');
  await knex.schema.dropTableIfExists('aic_task_message_reactions');
  await knex.schema.dropTableIfExists('aic_task_messages');
  await knex.schema.dropTableIfExists('aic_task_assignees');
  await knex.schema.dropTableIfExists('aic_tasks');
  await knex.schema.dropTableIfExists('aic_message_mentions');
  await knex.schema.dropTableIfExists('aic_message_attachments');
  await knex.schema.dropTableIfExists('aic_message_reactions');
  await knex.schema.dropTableIfExists('aic_messages');
  await knex.schema.dropTableIfExists('aic_participants');
  await knex.schema.dropTableIfExists('aic_products');
  await knex.schema.dropTableIfExists('aic_records');
}
