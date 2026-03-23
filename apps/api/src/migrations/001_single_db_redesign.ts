import type { Knex } from 'knex';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Capitalise every word and replace underscores with spaces.
 * e.g. 'manage_roles' → 'Manage Roles'
 */
function toPermissionName(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// UP
// ---------------------------------------------------------------------------

export async function up(knex: Knex): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. pgcrypto extension
  // -------------------------------------------------------------------------
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  // -------------------------------------------------------------------------
  // 2. companies
  // -------------------------------------------------------------------------
  await knex.schema.createTable('companies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 255).notNullable();
    table.string('slug', 255).notNullable().unique();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.string('odoo_api_key', 255).nullable();
    table.string('theme_color', 7).notNullable().defaultTo('#2563EB');
    table.string('company_code', 20).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Partial unique index: company_code WHERE company_code IS NOT NULL
  await knex.raw(`
    CREATE UNIQUE INDEX companies_company_code_unique
    ON companies (company_code)
    WHERE company_code IS NOT NULL
  `);

  // -------------------------------------------------------------------------
  // 3. departments — created WITHOUT head_user_id FK (circular dep with users)
  //    head_user_id is a plain nullable UUID; FK added after users is created.
  // -------------------------------------------------------------------------
  await knex.schema.createTable('departments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 255).notNullable();
    // head_user_id stored as plain UUID — FK added via alterTable after users
    table.uuid('head_user_id').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Case-insensitive unique on name
  await knex.raw(`
    CREATE UNIQUE INDEX departments_name_lower_unique
    ON departments (LOWER(name))
  `);

  // -------------------------------------------------------------------------
  // 4. users — references departments(id) for department_id FK
  // -------------------------------------------------------------------------
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.uuid('user_key').nullable().unique();
    table.string('mobile_number', 50).nullable();
    table.string('avatar_url', 500).nullable();
    table.integer('employee_number').nullable().unique();
    table.boolean('updated').notNullable().defaultTo(false);
    table.boolean('is_active').notNullable().defaultTo(true);
    table
      .string('employment_status', 20)
      .notNullable()
      .defaultTo('active')
      .checkIn(['active', 'resigned', 'inactive', 'suspended']);
    table.boolean('push_notifications_enabled').notNullable().defaultTo(true);
    table.timestamp('last_login_at', { useTz: true }).nullable();
    table
      .uuid('last_company_id')
      .nullable()
      .references('id')
      .inTable('companies')
      .onDelete('SET NULL');
    table.decimal('epi_score', 5, 1).notNullable().defaultTo(100.0);
    table
      .uuid('department_id')
      .nullable()
      .references('id')
      .inTable('departments')
      .onDelete('SET NULL');
    table.jsonb('epi_history').defaultTo('[]');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -------------------------------------------------------------------------
  // 5. Add FK constraint on departments.head_user_id → users(id)
  // -------------------------------------------------------------------------
  await knex.schema.alterTable('departments', (table) => {
    table
      .foreign('head_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
  });

  // -------------------------------------------------------------------------
  // 6. super_admins
  // -------------------------------------------------------------------------
  await knex.schema.createTable('super_admins', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('name', 255).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -------------------------------------------------------------------------
  // 7. user_sensitive_info
  // -------------------------------------------------------------------------
  await knex.schema.createTable('user_sensitive_info', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('user_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('legal_name', 255).nullable();
    table.date('birthday').nullable();
    table.string('gender', 20).nullable();
    table.string('address', 500).nullable();
    table.string('marital_status', 50).nullable();
    table.string('sss_number', 100).nullable();
    table.string('tin_number', 100).nullable();
    table.string('pagibig_number', 100).nullable();
    table.string('philhealth_number', 100).nullable();
    table.string('valid_id_url', 500).nullable();
    table.timestamp('valid_id_updated_at', { useTz: true }).nullable();
    table.string('pin', 50).nullable();
    table.string('emergency_contact', 255).nullable();
    table.string('emergency_phone', 50).nullable();
    table.string('emergency_relationship', 100).nullable();
    table.string('bank_account_number', 255).nullable();
    table.integer('bank_id').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -------------------------------------------------------------------------
  // 8. permissions
  // -------------------------------------------------------------------------
  await knex.schema.createTable('permissions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('key', 100).notNullable().unique();
    table.string('name', 100).notNullable();
    table.text('description').nullable();
    table.string('category', 50).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -------------------------------------------------------------------------
  // 9. roles
  // -------------------------------------------------------------------------
  await knex.schema.createTable('roles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 100).notNullable().unique();
    table.text('description').nullable();
    table.string('color', 20).nullable();
    table.boolean('is_system').notNullable().defaultTo(false);
    table.integer('priority').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -------------------------------------------------------------------------
  // 10. role_permissions
  // -------------------------------------------------------------------------
  await knex.schema.createTable('role_permissions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('role_id').notNullable();
    table.uuid('permission_id').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('role_id').references('id').inTable('roles').onDelete('CASCADE');
    table.foreign('permission_id').references('id').inTable('permissions').onDelete('CASCADE');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX role_permissions_role_id_permission_id_unique
    ON role_permissions (role_id, permission_id)
  `);

  // -------------------------------------------------------------------------
  // 11. user_roles
  // -------------------------------------------------------------------------
  await knex.schema.createTable('user_roles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.uuid('role_id').notNullable();
    table.uuid('assigned_by').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('role_id').references('id').inTable('roles').onDelete('CASCADE');
    table.foreign('assigned_by').references('id').inTable('users').onDelete('SET NULL');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX user_roles_user_id_role_id_unique
    ON user_roles (user_id, role_id)
  `);

  // -------------------------------------------------------------------------
  // 12. user_company_access
  // -------------------------------------------------------------------------
  await knex.schema.createTable('user_company_access', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.uuid('company_id').notNullable();
    table.string('position_title', 255).nullable();
    table.date('date_started').nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('company_id').references('id').inTable('companies').onDelete('CASCADE');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX user_company_access_user_id_company_id_unique
    ON user_company_access (user_id, company_id)
  `);

  // -------------------------------------------------------------------------
  // 13. branches (must exist before user_company_branches, shift_exchange_requests, etc.)
  // -------------------------------------------------------------------------
  await knex.schema.createTable('branches', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.text('address').nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.boolean('is_main_branch').notNullable().defaultTo(false);
    table.string('odoo_branch_id', 100).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX branches_company_id_is_active_idx
    ON branches (company_id, is_active)
  `);
  await knex.raw(`
    CREATE INDEX branches_odoo_branch_id_idx
    ON branches (odoo_branch_id)
    WHERE odoo_branch_id IS NOT NULL
  `);

  // -------------------------------------------------------------------------
  // 14. user_branches
  // -------------------------------------------------------------------------
  await knex.schema.createTable('user_branches', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('company_id').notNullable();
    table.uuid('user_id').notNullable();
    table.uuid('branch_id').notNullable();
    table.boolean('is_primary').notNullable().defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('company_id').references('id').inTable('companies').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('branch_id').references('id').inTable('branches').onDelete('CASCADE');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX user_branches_user_id_branch_id_unique
    ON user_branches (user_id, branch_id)
  `);

  // -------------------------------------------------------------------------
  // 15. user_company_branches
  // -------------------------------------------------------------------------
  await knex.schema.createTable('user_company_branches', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.uuid('company_id').notNullable();
    table.uuid('branch_id').notNullable();
    table.string('assignment_type', 20).notNullable().checkIn(['resident', 'borrow']);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('company_id').references('id').inTable('companies').onDelete('CASCADE');
    table.foreign('branch_id').references('id').inTable('branches').onDelete('CASCADE');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX user_company_branches_user_id_company_id_branch_id_unique
    ON user_company_branches (user_id, company_id, branch_id)
  `);

  // -------------------------------------------------------------------------
  // 16. pos_sessions
  // -------------------------------------------------------------------------
  await knex.schema.createTable('pos_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table.uuid('branch_id').notNullable().references('id').inTable('branches');
    table.string('odoo_session_id', 100).nullable();
    table.jsonb('odoo_payload').notNullable();
    table.string('session_name', 255).nullable();
    table.timestamp('opened_at', { useTz: true }).nullable();
    table.timestamp('closed_at', { useTz: true }).nullable();
    table
      .string('status', 20)
      .notNullable()
      .defaultTo('open')
      .checkIn(['open', 'closed', 'audit_complete']);
    table.jsonb('closing_reports').nullable();
    table
      .uuid('audited_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('audited_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -------------------------------------------------------------------------
  // 17. employee_shifts (must exist before shift_exchange_requests)
  // -------------------------------------------------------------------------
  await knex.schema.createTable('employee_shifts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table.integer('odoo_shift_id').notNullable();
    table.uuid('branch_id').notNullable().references('id').inTable('branches');
    table
      .uuid('user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.string('employee_name', 255).notNullable();
    table.string('employee_avatar_url', 500).nullable();
    table.string('duty_type', 100).notNullable();
    table.integer('duty_color').notNullable();
    table.timestamp('shift_start', { useTz: true }).notNullable();
    table.timestamp('shift_end', { useTz: true }).notNullable();
    table.decimal('allocated_hours', 5, 2).notNullable();
    table.decimal('total_worked_hours', 5, 2).nullable();
    table.integer('pending_approvals').notNullable().defaultTo(0);
    table.string('status', 20).notNullable().defaultTo('open');
    table.string('check_in_status', 20).nullable();
    table.jsonb('odoo_payload').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`
    CREATE UNIQUE INDEX employee_shifts_odoo_shift_id_branch_id_unique
    ON employee_shifts (odoo_shift_id, branch_id)
  `);

  await knex.raw(`
    CREATE INDEX employee_shifts_company_id_branch_id_idx
    ON employee_shifts (company_id, branch_id)
  `);

  // -------------------------------------------------------------------------
  // 18. shift_exchange_requests
  // -------------------------------------------------------------------------
  await knex.schema.createTable('shift_exchange_requests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('requester_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .uuid('accepting_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .uuid('requested_by')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .uuid('requester_company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table.uuid('requester_branch_id').notNullable().references('id').inTable('branches');
    table.uuid('requester_shift_id').notNullable().references('id').inTable('employee_shifts');
    table.integer('requester_shift_odoo_id').notNullable();
    table
      .uuid('accepting_company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table.uuid('accepting_branch_id').notNullable().references('id').inTable('branches');
    table.uuid('accepting_shift_id').notNullable().references('id').inTable('employee_shifts');
    table.integer('accepting_shift_odoo_id').notNullable();
    table
      .string('status', 20)
      .notNullable()
      .defaultTo('pending')
      .checkIn(['pending', 'approved', 'rejected']);
    table
      .string('approval_stage', 30)
      .notNullable()
      .defaultTo('awaiting_employee')
      .checkIn(['awaiting_employee', 'awaiting_hr', 'resolved']);
    table.timestamp('employee_decision_at', { useTz: true }).nullable();
    table.text('employee_rejection_reason').nullable();
    table
      .uuid('hr_decision_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('hr_decision_at', { useTz: true }).nullable();
    table.text('hr_rejection_reason').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Partial unique: one pending request per requester shift
  await knex.raw(`
    CREATE UNIQUE INDEX shift_exchange_requests_requester_shift_pending_unique
    ON shift_exchange_requests (requester_company_id, requester_shift_id)
    WHERE status = 'pending'
  `);

  // Partial unique: one pending request per accepting shift
  await knex.raw(`
    CREATE UNIQUE INDEX shift_exchange_requests_accepting_shift_pending_unique
    ON shift_exchange_requests (accepting_company_id, accepting_shift_id)
    WHERE status = 'pending'
  `);

  // -------------------------------------------------------------------------
  // 19. pos_verifications
  // -------------------------------------------------------------------------
  await knex.schema.createTable('pos_verifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table.uuid('branch_id').notNullable().references('id').inTable('branches');
    table.uuid('pos_session_id').nullable().references('id').inTable('pos_sessions');
    table.jsonb('odoo_payload').notNullable();
    table.string('title', 500).nullable();
    table.text('description').nullable();
    table.decimal('amount', 12, 2).nullable();
    table
      .string('status', 20)
      .notNullable()
      .defaultTo('pending')
      .checkIn(['pending', 'awaiting_customer', 'confirmed', 'rejected']);
    table
      .string('verification_type', 50)
      .nullable()
      .checkIn([
        'cf_breakdown',
        'pcf_breakdown',
        'closing_pcf_breakdown',
        'discount_order',
        'refund_order',
        'token_pay_order',
        'ispe_purchase_order',
        'register_cash_in',
        'register_cash_out',
        'non_cash_order',
      ]);
    table
      .uuid('cashier_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .uuid('customer_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('customer_rejection_reason').nullable();
    table.jsonb('breakdown').nullable();
    table
      .uuid('reviewed_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('reviewed_at', { useTz: true }).nullable();
    table.text('review_notes').nullable();
    table.integer('audit_rating').nullable();
    table.text('audit_details').nullable();
    table
      .uuid('audited_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('audited_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX pos_verifications_company_id_status_idx
    ON pos_verifications (company_id, status)
  `);

  // -------------------------------------------------------------------------
  // 20. pos_verification_images
  // -------------------------------------------------------------------------
  await knex.schema.createTable('pos_verification_images', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('pos_verification_id')
      .notNullable()
      .references('id')
      .inTable('pos_verifications')
      .onDelete('CASCADE');
    table
      .uuid('uploaded_by')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.string('file_path', 500).notNullable();
    table.string('file_name', 255).notNullable();
    table.string('mime_type', 100).notNullable();
    table.integer('file_size').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -------------------------------------------------------------------------
  // 21. schedules
  // -------------------------------------------------------------------------
  await knex.schema.createTable('schedules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.uuid('branch_id').notNullable().references('id').inTable('branches');
    table.date('shift_date').notNullable();
    table.time('start_time').notNullable();
    table.time('end_time').notNullable();
    table.string('status', 20).notNullable().defaultTo('scheduled');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -------------------------------------------------------------------------
  // 22. shift_logs
  // -------------------------------------------------------------------------
  await knex.schema.createTable('shift_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table.uuid('shift_id').nullable().references('id').inTable('employee_shifts');
    table.uuid('branch_id').notNullable().references('id').inTable('branches');
    table
      .string('log_type', 30)
      .notNullable()
      .checkIn(['shift_updated', 'check_in', 'check_out', 'shift_ended', 'authorization_resolved']);
    table.jsonb('changes').nullable();
    table.integer('odoo_attendance_id').nullable();
    table.timestamp('event_time', { useTz: true }).notNullable();
    table.decimal('worked_hours', 8, 4).nullable();
    table.integer('cumulative_minutes').nullable();
    table.jsonb('odoo_payload').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -------------------------------------------------------------------------
  // 23. shift_authorizations
  // -------------------------------------------------------------------------
  await knex.schema.createTable('shift_authorizations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table.uuid('shift_id').notNullable().references('id').inTable('employee_shifts');
    table.uuid('shift_log_id').notNullable().references('id').inTable('shift_logs');
    table.uuid('branch_id').notNullable().references('id').inTable('branches');
    table
      .uuid('user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .string('auth_type', 50)
      .notNullable()
      .checkIn(['early_check_in', 'tardiness', 'early_check_out', 'late_check_out', 'overtime']);
    table.integer('diff_minutes').notNullable();
    table.boolean('needs_employee_reason').notNullable().defaultTo(false);
    table
      .string('status', 20)
      .notNullable()
      .defaultTo('pending')
      .checkIn(['pending', 'approved', 'rejected', 'no_approval_needed']);
    table.text('employee_reason').nullable();
    table.text('rejection_reason').nullable();
    table.string('overtime_type', 50).nullable();
    table
      .uuid('resolved_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('resolved_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -------------------------------------------------------------------------
  // 24. authorization_requests
  // -------------------------------------------------------------------------
  await knex.schema.createTable('authorization_requests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.uuid('branch_id').notNullable().references('id').inTable('branches');
    table.string('request_type', 50).notNullable();
    table
      .string('level', 20)
      .notNullable()
      .defaultTo('management')
      .checkIn(['management', 'service_crew']);
    table.text('description').nullable();
    table.string('reference', 255).nullable();
    table.decimal('requested_amount', 12, 2).nullable();
    table.string('bank_name', 255).nullable();
    table.string('account_name', 255).nullable();
    table.string('account_number', 255).nullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.text('rejection_reason').nullable();
    table
      .uuid('reviewed_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('reviewed_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -------------------------------------------------------------------------
  // 25. cash_requests
  // -------------------------------------------------------------------------
  await knex.schema.createTable('cash_requests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.uuid('branch_id').notNullable().references('id').inTable('branches');
    table.string('request_type', 100).nullable();
    table.string('reference', 255).nullable();
    table.decimal('amount', 12, 2).notNullable();
    table.text('reason').nullable();
    table.string('bank_name', 255).nullable();
    table.string('account_name', 255).nullable();
    table.string('account_number', 255).nullable();
    table.string('attachment_url', 500).nullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.text('rejection_reason').nullable();
    table
      .uuid('reviewed_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('reviewed_at', { useTz: true }).nullable();
    table
      .uuid('disbursed_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('disbursed_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -------------------------------------------------------------------------
  // 26. store_audits
  // -------------------------------------------------------------------------
  await knex.schema.createTable('store_audits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table.string('type', 30).notNullable().checkIn(['customer_service', 'compliance']);
    table
      .string('status', 20)
      .notNullable()
      .defaultTo('pending')
      .checkIn(['pending', 'processing', 'completed']);
    table.uuid('branch_id').notNullable().references('id').inTable('branches');
    table
      .uuid('auditor_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.decimal('monetary_reward', 10, 2).notNullable();
    table.timestamp('completed_at', { useTz: true }).nullable();
    table.timestamp('processing_started_at', { useTz: true }).nullable();
    table.boolean('vn_requested').notNullable().defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Customer service specific columns
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

    // Compliance specific columns
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
  });

  await knex.raw(`
    CREATE INDEX store_audits_company_type_status_created_at_idx
    ON store_audits (company_id, type, status, created_at DESC)
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX store_audits_one_active_per_auditor
    ON store_audits (company_id, auditor_user_id)
    WHERE status = 'processing'
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX store_audits_one_active_css_per_order
    ON store_audits (company_id, css_odoo_order_id)
    WHERE type = 'customer_service' AND status != 'completed'
  `);
  // css_star_rating CHECK BETWEEN 1 AND 5
  await knex.raw(`
    ALTER TABLE store_audits
    ADD CONSTRAINT store_audits_css_star_rating_check
    CHECK (css_star_rating IS NULL OR (css_star_rating >= 1 AND css_star_rating <= 5))
  `);

  // -------------------------------------------------------------------------
  // 27. store_audit_messages
  // -------------------------------------------------------------------------
  await knex.schema.createTable('store_audit_messages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('store_audit_id')
      .notNullable()
      .references('id')
      .inTable('store_audits')
      .onDelete('CASCADE');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.text('content').notNullable();
    table.boolean('is_deleted').notNullable().defaultTo(false);
    table
      .uuid('deleted_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index('store_audit_id');
  });

  // -------------------------------------------------------------------------
  // 28. store_audit_attachments
  // -------------------------------------------------------------------------
  await knex.schema.createTable('store_audit_attachments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('store_audit_id')
      .notNullable()
      .references('id')
      .inTable('store_audits')
      .onDelete('CASCADE');
    table
      .uuid('message_id')
      .nullable()
      .references('id')
      .inTable('store_audit_messages')
      .onDelete('SET NULL');
    table
      .uuid('uploaded_by')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('file_url').notNullable();
    table.string('file_name', 255).notNullable();
    table.integer('file_size').notNullable();
    table.string('content_type', 100).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -------------------------------------------------------------------------
  // 29. case_reports
  // -------------------------------------------------------------------------
  await knex.schema.createTable('case_reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table.integer('case_number').notNullable();
    table.string('title', 255).notNullable();
    table.text('description').notNullable();
    table
      .string('status', 20)
      .notNullable()
      .defaultTo('open')
      .checkIn(['open', 'closed']);
    table.text('corrective_action').nullable();
    table.text('resolution').nullable();
    table.boolean('vn_requested').notNullable().defaultTo(false);
    table
      .uuid('created_by')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .uuid('closed_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('closed_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['company_id', 'case_number']);
  });

  await knex.raw(`
    CREATE INDEX case_reports_company_id_status_created_at_idx
    ON case_reports (company_id, status, created_at DESC)
  `);

  // -------------------------------------------------------------------------
  // 30. case_messages
  // -------------------------------------------------------------------------
  await knex.schema.createTable('case_messages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('case_id')
      .notNullable()
      .references('id')
      .inTable('case_reports')
      .onDelete('CASCADE');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.text('content').notNullable();
    table.boolean('is_system').notNullable().defaultTo(false);
    table.boolean('is_deleted').notNullable().defaultTo(false);
    table
      .uuid('deleted_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    // Self-referencing FK for threaded replies
    table
      .uuid('parent_message_id')
      .nullable()
      .references('id')
      .inTable('case_messages')
      .onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index('case_id');
  });

  // -------------------------------------------------------------------------
  // 31. case_attachments
  // -------------------------------------------------------------------------
  await knex.schema.createTable('case_attachments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('case_id')
      .notNullable()
      .references('id')
      .inTable('case_reports')
      .onDelete('CASCADE');
    table
      .uuid('message_id')
      .nullable()
      .references('id')
      .inTable('case_messages')
      .onDelete('SET NULL');
    table
      .uuid('uploaded_by')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('file_url').notNullable();
    table.string('file_name', 255).notNullable();
    table.integer('file_size').notNullable();
    table.string('content_type', 100).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -------------------------------------------------------------------------
  // 32. case_reactions
  // -------------------------------------------------------------------------
  await knex.schema.createTable('case_reactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('message_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('emoji', 20).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('message_id').references('id').inTable('case_messages').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX case_reactions_message_id_user_id_emoji_unique
    ON case_reactions (message_id, user_id, emoji)
  `);

  // -------------------------------------------------------------------------
  // 33. case_participants
  // -------------------------------------------------------------------------
  await knex.schema.createTable('case_participants', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('case_id').notNullable();
    table.uuid('user_id').notNullable();
    table.boolean('is_joined').notNullable().defaultTo(true);
    table.boolean('is_muted').notNullable().defaultTo(false);
    table.timestamp('last_read_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('case_id').references('id').inTable('case_reports').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX case_participants_case_id_user_id_unique
    ON case_participants (case_id, user_id)
  `);

  // -------------------------------------------------------------------------
  // 34. case_mentions
  // -------------------------------------------------------------------------
  await knex.schema.createTable('case_mentions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('message_id')
      .notNullable()
      .references('id')
      .inTable('case_messages')
      .onDelete('CASCADE');
    table
      .uuid('mentioned_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .uuid('mentioned_role_id')
      .nullable()
      .references('id')
      .inTable('roles')
      .onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE case_mentions
    ADD CONSTRAINT case_mentions_must_have_target
    CHECK (mentioned_user_id IS NOT NULL OR mentioned_role_id IS NOT NULL)
  `);

  // -------------------------------------------------------------------------
  // 35. violation_notices
  // -------------------------------------------------------------------------
  await knex.schema.createTable('violation_notices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table.integer('vn_number').notNullable();
    table
      .string('status', 30)
      .notNullable()
      .defaultTo('queued')
      .checkIn(['queued', 'discussion', 'issuance', 'disciplinary_meeting', 'completed', 'rejected']);
    table
      .string('category', 20)
      .notNullable()
      .checkIn(['manual', 'case_reports', 'store_audits']);
    table.text('description').notNullable();
    table.decimal('epi_decrease', 3, 1).nullable();
    table
      .uuid('created_by')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .uuid('confirmed_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .uuid('issued_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .uuid('completed_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .uuid('rejected_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('rejection_reason').nullable();
    table
      .uuid('source_case_report_id')
      .nullable()
      .references('id')
      .inTable('case_reports')
      .onDelete('SET NULL');
    table
      .uuid('source_store_audit_id')
      .nullable()
      .references('id')
      .inTable('store_audits')
      .onDelete('SET NULL');
    table.text('issuance_file_url').nullable();
    table.string('issuance_file_name', 255).nullable();
    table.text('disciplinary_file_url').nullable();
    table.string('disciplinary_file_name', 255).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['company_id', 'vn_number']);
  });

  await knex.raw(`
    CREATE INDEX violation_notices_company_id_status_created_at_idx
    ON violation_notices (company_id, status, created_at DESC)
  `);

  // -------------------------------------------------------------------------
  // 36. violation_notice_targets
  // -------------------------------------------------------------------------
  await knex.schema.createTable('violation_notice_targets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('violation_notice_id').notNullable();
    table.uuid('user_id').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('violation_notice_id').references('id').inTable('violation_notices').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX violation_notice_targets_vn_id_user_id_unique
    ON violation_notice_targets (violation_notice_id, user_id)
  `);

  // -------------------------------------------------------------------------
  // 37. violation_notice_messages
  // -------------------------------------------------------------------------
  await knex.schema.createTable('violation_notice_messages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('violation_notice_id')
      .notNullable()
      .references('id')
      .inTable('violation_notices')
      .onDelete('CASCADE');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.text('content').notNullable();
    table
      .string('type', 10)
      .notNullable()
      .defaultTo('message')
      .checkIn(['message', 'system']);
    table.boolean('is_deleted').notNullable().defaultTo(false);
    table
      .uuid('deleted_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    // Self-referencing FK for threaded replies
    table
      .uuid('parent_message_id')
      .nullable()
      .references('id')
      .inTable('violation_notice_messages')
      .onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index('violation_notice_id');
  });

  // -------------------------------------------------------------------------
  // 38. violation_notice_attachments
  // -------------------------------------------------------------------------
  await knex.schema.createTable('violation_notice_attachments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('violation_notice_id')
      .notNullable()
      .references('id')
      .inTable('violation_notices')
      .onDelete('CASCADE');
    table
      .uuid('message_id')
      .nullable()
      .references('id')
      .inTable('violation_notice_messages')
      .onDelete('SET NULL');
    table
      .uuid('uploaded_by')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('file_url').notNullable();
    table.string('file_name', 255).notNullable();
    table.integer('file_size').notNullable();
    table.string('content_type', 100).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -------------------------------------------------------------------------
  // 39. violation_notice_reactions
  // -------------------------------------------------------------------------
  await knex.schema.createTable('violation_notice_reactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('message_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('emoji', 20).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('message_id').references('id').inTable('violation_notice_messages').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX violation_notice_reactions_message_id_user_id_emoji_unique
    ON violation_notice_reactions (message_id, user_id, emoji)
  `);

  // -------------------------------------------------------------------------
  // 40. violation_notice_participants
  // -------------------------------------------------------------------------
  await knex.schema.createTable('violation_notice_participants', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('violation_notice_id').notNullable();
    table.uuid('user_id').notNullable();
    table.boolean('is_joined').notNullable().defaultTo(true);
    table.boolean('is_muted').notNullable().defaultTo(false);
    table.timestamp('last_read_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('violation_notice_id').references('id').inTable('violation_notices').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX violation_notice_participants_vn_id_user_id_unique
    ON violation_notice_participants (violation_notice_id, user_id)
  `);

  // -------------------------------------------------------------------------
  // 41. violation_notice_mentions
  // -------------------------------------------------------------------------
  await knex.schema.createTable('violation_notice_mentions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('message_id')
      .notNullable()
      .references('id')
      .inTable('violation_notice_messages')
      .onDelete('CASCADE');
    table
      .uuid('mentioned_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .uuid('mentioned_role_id')
      .nullable()
      .references('id')
      .inTable('roles')
      .onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE violation_notice_mentions
    ADD CONSTRAINT violation_notice_mentions_must_have_target
    CHECK (mentioned_user_id IS NOT NULL OR mentioned_role_id IS NOT NULL)
  `);

  // -------------------------------------------------------------------------
  // 42. violation_notice_reads
  // -------------------------------------------------------------------------
  await knex.schema.createTable('violation_notice_reads', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('violation_notice_id').notNullable();
    table.uuid('user_id').notNullable();
    table.timestamp('last_read_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('violation_notice_id').references('id').inTable('violation_notices').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX violation_notice_reads_vn_id_user_id_unique
    ON violation_notice_reads (violation_notice_id, user_id)
  `);

  // -------------------------------------------------------------------------
  // 43. peer_evaluations
  // -------------------------------------------------------------------------
  await knex.schema.createTable('peer_evaluations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('company_id').notNullable();
    table.uuid('evaluator_user_id').notNullable();
    table.uuid('evaluated_user_id').notNullable();
    table.uuid('shift_id').notNullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.integer('q1_score').notNullable().defaultTo(5);
    table.integer('q2_score').notNullable().defaultTo(5);
    table.integer('q3_score').notNullable().defaultTo(5);
    table.text('additional_message').nullable();
    table.integer('overlap_minutes').notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('submitted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('company_id').references('id').inTable('companies').onDelete('CASCADE');
    table.foreign('evaluator_user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('evaluated_user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('shift_id').references('id').inTable('employee_shifts').onDelete('CASCADE');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX peer_evaluations_evaluator_evaluated_shift_unique
    ON peer_evaluations (evaluator_user_id, evaluated_user_id, shift_id)
  `);

  await knex.raw(`
    CREATE INDEX peer_evaluations_evaluator_user_id_status_idx
    ON peer_evaluations (evaluator_user_id, status)
  `);
  await knex.raw(`
    CREATE INDEX peer_evaluations_expires_at_status_idx
    ON peer_evaluations (expires_at, status)
  `);

  // -------------------------------------------------------------------------
  // 44. personal_information_verifications
  // -------------------------------------------------------------------------
  await knex.schema.createTable('personal_information_verifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('status', 20).notNullable().defaultTo('pending');
    table.jsonb('requested_changes').notNullable();
    table.jsonb('approved_changes').nullable();
    table.string('valid_id_url', 500).notNullable();
    table
      .uuid('reviewed_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('reviewed_at', { useTz: true }).nullable();
    table.text('rejection_reason').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX personal_information_verifications_one_pending_per_user
    ON personal_information_verifications (company_id, user_id)
    WHERE status = 'pending'
  `);

  // -------------------------------------------------------------------------
  // 45. employment_requirement_types (uses VARCHAR code as PK, not UUID)
  // -------------------------------------------------------------------------
  await knex.schema.createTable('employment_requirement_types', (table) => {
    table.string('code', 100).primary();
    table.string('label', 255).notNullable();
    table.integer('sort_order').notNullable().defaultTo(0);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -------------------------------------------------------------------------
  // 46. employment_requirement_submissions
  // -------------------------------------------------------------------------
  await knex.schema.createTable('employment_requirement_submissions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .string('requirement_code', 100)
      .notNullable()
      .references('code')
      .inTable('employment_requirement_types')
      .onDelete('CASCADE');
    table.string('document_url', 500).notNullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table
      .uuid('reviewed_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('reviewed_at', { useTz: true }).nullable();
    table.text('rejection_reason').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX employment_requirement_submissions_one_pending
    ON employment_requirement_submissions (company_id, user_id, requirement_code)
    WHERE status = 'pending'
  `);

  // -------------------------------------------------------------------------
  // 47. bank_information_verifications
  // -------------------------------------------------------------------------
  await knex.schema.createTable('bank_information_verifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.integer('bank_id').notNullable();
    table.string('account_number', 255).notNullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table
      .uuid('reviewed_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('reviewed_at', { useTz: true }).nullable();
    table.text('rejection_reason').nullable();
    table.integer('odoo_partner_bank_id').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX bank_information_verifications_one_pending_per_user
    ON bank_information_verifications (company_id, user_id)
    WHERE status = 'pending'
  `);

  // -------------------------------------------------------------------------
  // 48. registration_requests
  // -------------------------------------------------------------------------
  await knex.schema.createTable('registration_requests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.string('email', 255).notNullable();
    table.text('encrypted_password').notNullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.timestamp('requested_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table
      .uuid('reviewed_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('reviewed_at', { useTz: true }).nullable();
    table.text('rejection_reason').nullable();
    table.jsonb('approved_role_ids').nullable();
    table
      .uuid('approved_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .uuid('resident_company_id')
      .nullable()
      .references('id')
      .inTable('companies')
      .onDelete('SET NULL');
    table.uuid('resident_branch_id').nullable();
    table.string('resident_branch_name', 255).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Partial unique: only one pending registration per email (case-insensitive)
  await knex.raw(`
    CREATE UNIQUE INDEX registration_requests_email_pending_unique
    ON registration_requests (LOWER(email))
    WHERE status = 'pending'
  `);

  // -------------------------------------------------------------------------
  // 49. registration_request_company_assignments
  // -------------------------------------------------------------------------
  await knex.schema.createTable('registration_request_company_assignments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('registration_request_id').notNullable();
    table.uuid('company_id').notNullable();
    table.string('company_name', 255).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table
      .foreign('registration_request_id')
      .references('id')
      .inTable('registration_requests')
      .onDelete('CASCADE');
    table.foreign('company_id').references('id').inTable('companies').onDelete('CASCADE');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX rrca_registration_request_id_company_id_unique
    ON registration_request_company_assignments (registration_request_id, company_id)
  `);

  // -------------------------------------------------------------------------
  // 50. registration_request_assignment_branches
  // -------------------------------------------------------------------------
  await knex.schema.createTable('registration_request_assignment_branches', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('registration_request_company_assignment_id').notNullable();
    table.uuid('branch_id').notNullable();
    table.string('branch_name', 255).nullable();
    table.string('branch_odoo_id', 100).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table
      .foreign('registration_request_company_assignment_id')
      .references('id')
      .inTable('registration_request_company_assignments')
      .onDelete('CASCADE');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX rrab_assignment_id_branch_id_unique
    ON registration_request_assignment_branches (registration_request_company_assignment_id, branch_id)
  `);

  // -------------------------------------------------------------------------
  // 51. refresh_tokens
  // -------------------------------------------------------------------------
  await knex.schema.createTable('refresh_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .uuid('company_id')
      .nullable()
      .references('id')
      .inTable('companies')
      .onDelete('SET NULL');
    table.string('token_hash', 255).notNullable().unique();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.boolean('is_revoked').notNullable().defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index('user_id');
  });

  // -------------------------------------------------------------------------
  // 52. employee_notifications
  // -------------------------------------------------------------------------
  await knex.schema.createTable('employee_notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .uuid('company_id')
      .nullable()
      .references('id')
      .inTable('companies')
      .onDelete('SET NULL');
    table.string('title', 255).notNullable();
    table.text('message').notNullable();
    table.string('type', 50).notNullable().defaultTo('info');
    table.boolean('is_read').notNullable().defaultTo(false);
    table.string('link_url', 500).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index('user_id');
  });

  // -------------------------------------------------------------------------
  // 53. push_subscriptions
  // -------------------------------------------------------------------------
  await knex.schema.createTable('push_subscriptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.text('endpoint').notNullable().unique();
    table.text('p256dh').notNullable();
    table.text('auth').notNullable();
    table.text('user_agent').nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.integer('failure_count').notNullable().defaultTo(0);
    table.timestamp('last_success_at', { useTz: true }).nullable();
    table.timestamp('last_failure_at', { useTz: true }).nullable();
    table.text('last_failure_reason').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index('user_id');
  });

  // -------------------------------------------------------------------------
  // 54. scheduled_job_runs
  //     scheduled_for_manila is intentionally TIMESTAMP (no tz) — Manila time
  // -------------------------------------------------------------------------
  await knex.schema.createTable('scheduled_job_runs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('job_name', 120).notNullable();
    table.string('scheduled_for_key', 32).notNullable();
    // NO useTz — intentional Manila local time column
    table.timestamp('scheduled_for_manila', { useTz: false }).notNullable();
    table.string('status', 20).notNullable();
    table.integer('attempt_count').notNullable().defaultTo(1);
    table.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('finished_at', { useTz: true }).nullable();
    table.text('error_message').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['job_name', 'scheduled_for_key']);
  });

  await knex.raw(`
    CREATE INDEX scheduled_job_runs_job_name_status_idx
    ON scheduled_job_runs (job_name, status)
  `);

  // -------------------------------------------------------------------------
  // 55. company_sequences
  // -------------------------------------------------------------------------
  await knex.schema.createTable('company_sequences', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('company_id').notNullable();
    table.string('sequence_name', 50).notNullable();
    table.integer('current_value').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign('company_id').references('id').inTable('companies').onDelete('CASCADE');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX company_sequences_company_id_sequence_name_unique
    ON company_sequences (company_id, sequence_name)
  `);

  // ===========================================================================
  // SEEDING
  // ===========================================================================

  // -------------------------------------------------------------------------
  // Seed: permissions
  // -------------------------------------------------------------------------
  const permissionDefinitions: Array<{ category: string; keys: string[] }> = [
    { category: 'admin', keys: ['manage_roles', 'manage_users', 'manage_branches', 'view_all_branches'] },
    { category: 'dashboard', keys: ['view_performance_index', 'view_payslip'] },
    { category: 'pos_verification', keys: ['view', 'confirm_reject', 'upload_image'] },
    { category: 'pos_session', keys: ['view', 'audit_complete'] },
    {
      category: 'account',
      keys: [
        'view_schedule',
        'view_auth_requests',
        'submit_private_auth_request',
        'submit_public_auth_request',
        'view_cash_requests',
        'submit_cash_request',
        'submit_employee_requirements',
        'view_notifications',
        'view_audit_results',
      ],
    },
    {
      category: 'employee',
      keys: ['view_own_profile', 'edit_own_profile', 'view_all_profiles', 'edit_work_profile'],
    },
    { category: 'shift', keys: ['view_all', 'approve_authorizations', 'end_shift'] },
    { category: 'auth_request', keys: ['approve_management', 'view_all', 'approve_service_crew'] },
    { category: 'cash_request', keys: ['view_all', 'approve'] },
    {
      category: 'employee_verifications',
      // These keys already contain dots — use as-is (do NOT prepend category)
      keys: [
        'employee_verification.view',
        'registration.approve',
        'personal_information.approve',
        'employee_requirements.approve',
        'bank_information.approve',
      ],
    },
    { category: 'store_audit', keys: ['view', 'process'] },
    { category: 'case_report', keys: ['view', 'create', 'close', 'manage'] },
    {
      category: 'violation_notice',
      keys: ['view', 'request', 'create', 'confirm', 'reject', 'issue', 'complete', 'manage'],
    },
    { category: 'peer_evaluation', keys: ['view', 'manage'] },
  ];

  const permissionsToInsert = permissionDefinitions.flatMap(({ category, keys }) =>
    keys.map((key) => {
      // employee_verifications keys already have dots; all others get category prefix
      const fullKey =
        category === 'employee_verifications' ? key : `${category}.${key}`;

      // Build human-readable name from the leaf portion only
      const leafPart = key.includes('.') ? key.split('.').pop()! : key;
      const name = leafPart
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      return { key: fullKey, name, category, description: null };
    })
  );

  await knex('permissions').insert(permissionsToInsert);

  // -------------------------------------------------------------------------
  // Seed: system roles
  // -------------------------------------------------------------------------
  await knex('roles').insert([
    {
      name: 'Administrator',
      description: null,
      color: '#e74c3c',
      is_system: true,
      priority: 100,
    },
    {
      name: 'Management',
      description: null,
      color: '#3498db',
      is_system: true,
      priority: 50,
    },
    {
      name: 'Service Crew',
      description: null,
      color: '#2ecc71',
      is_system: true,
      priority: 10,
    },
  ]);

  // -------------------------------------------------------------------------
  // Seed: role_permissions — assign ALL permissions to Administrator
  // -------------------------------------------------------------------------
  const [adminRole] = await knex('roles').where({ name: 'Administrator' }).select('id');
  const allPermissions = await knex('permissions').select('id');

  if (adminRole && allPermissions.length > 0) {
    const rolePermissionsToInsert = allPermissions.map((perm) => ({
      role_id: adminRole.id,
      permission_id: perm.id,
    }));
    await knex('role_permissions').insert(rolePermissionsToInsert);
  }

  // -------------------------------------------------------------------------
  // Seed: employment_requirement_types
  // -------------------------------------------------------------------------
  await knex('employment_requirement_types').insert([
    { code: 'psa_birth_certificate', label: 'Photocopy of PSA Birth Certificate', sort_order: 1 },
    { code: 'government_issued_id', label: 'Photocopy of Government-issued ID', sort_order: 2 },
    { code: 'xray_result_impression', label: 'Original Copy of X-ray Result Impression', sort_order: 3 },
    { code: 'urinalysis_result_impression', label: 'Original Copy of Urinalysis Result Impression', sort_order: 4 },
    { code: 'fecalysis_result_impression', label: 'Original Copy of Fecalysis Result Impression', sort_order: 5 },
    { code: 'employment_agreement_signed', label: 'Printed and Signed Employment Agreement', sort_order: 6 },
    { code: 'nbi_clearance', label: 'Original Copy of NBI Clearance', sort_order: 7 },
    { code: 'tin_id', label: 'Photocopy of TIN ID', sort_order: 8 },
    { code: 'sss_id', label: 'Photocopy of SSS ID', sort_order: 9 },
    { code: 'philhealth_id', label: 'Photocopy of PhilHealth ID', sort_order: 10 },
    { code: 'pagibig_membership_id', label: 'Photocopy of Pag-IBIG Membership ID', sort_order: 11 },
  ]);
}

// ---------------------------------------------------------------------------
// DOWN — drop all tables in reverse creation order
// ---------------------------------------------------------------------------

export async function down(knex: Knex): Promise<void> {
  // Disable FK checks for the duration of the drop sequence
  await knex.raw('SET session_replication_role = replica');

  try {
    // Seeded lookup tables
    await knex.schema.dropTableIfExists('company_sequences');
    await knex.schema.dropTableIfExists('scheduled_job_runs');
    await knex.schema.dropTableIfExists('push_subscriptions');
    await knex.schema.dropTableIfExists('employee_notifications');
    await knex.schema.dropTableIfExists('refresh_tokens');
    await knex.schema.dropTableIfExists('registration_request_assignment_branches');
    await knex.schema.dropTableIfExists('registration_request_company_assignments');
    await knex.schema.dropTableIfExists('registration_requests');
    await knex.schema.dropTableIfExists('bank_information_verifications');
    await knex.schema.dropTableIfExists('employment_requirement_submissions');
    await knex.schema.dropTableIfExists('employment_requirement_types');
    await knex.schema.dropTableIfExists('personal_information_verifications');
    await knex.schema.dropTableIfExists('peer_evaluations');
    await knex.schema.dropTableIfExists('violation_notice_reads');
    await knex.schema.dropTableIfExists('violation_notice_participants');
    await knex.schema.dropTableIfExists('violation_notice_reactions');
    await knex.schema.dropTableIfExists('violation_notice_attachments');
    await knex.schema.dropTableIfExists('violation_notice_mentions');
    await knex.schema.dropTableIfExists('violation_notice_messages');
    await knex.schema.dropTableIfExists('violation_notice_targets');
    await knex.schema.dropTableIfExists('violation_notices');
    await knex.schema.dropTableIfExists('case_mentions');
    await knex.schema.dropTableIfExists('case_participants');
    await knex.schema.dropTableIfExists('case_reactions');
    await knex.schema.dropTableIfExists('case_attachments');
    await knex.schema.dropTableIfExists('case_messages');
    await knex.schema.dropTableIfExists('case_reports');
    await knex.schema.dropTableIfExists('store_audit_attachments');
    await knex.schema.dropTableIfExists('store_audit_messages');
    await knex.schema.dropTableIfExists('store_audits');
    await knex.schema.dropTableIfExists('cash_requests');
    await knex.schema.dropTableIfExists('authorization_requests');
    await knex.schema.dropTableIfExists('shift_authorizations');
    await knex.schema.dropTableIfExists('shift_logs');
    await knex.schema.dropTableIfExists('schedules');
    await knex.schema.dropTableIfExists('pos_verification_images');
    await knex.schema.dropTableIfExists('pos_verifications');
    await knex.schema.dropTableIfExists('shift_exchange_requests');
    await knex.schema.dropTableIfExists('employee_shifts');
    await knex.schema.dropTableIfExists('pos_sessions');
    await knex.schema.dropTableIfExists('user_company_branches');
    await knex.schema.dropTableIfExists('user_branches');
    await knex.schema.dropTableIfExists('branches');
    await knex.schema.dropTableIfExists('user_company_access');
    await knex.schema.dropTableIfExists('user_roles');
    await knex.schema.dropTableIfExists('role_permissions');
    await knex.schema.dropTableIfExists('roles');
    await knex.schema.dropTableIfExists('permissions');
    await knex.schema.dropTableIfExists('user_sensitive_info');
    await knex.schema.dropTableIfExists('super_admins');

    // Remove the circular FK before dropping the tables
    await knex.schema.alterTable('departments', (table) => {
      table.dropForeign(['head_user_id']);
    });

    await knex.schema.dropTableIfExists('users');
    await knex.schema.dropTableIfExists('departments');
    await knex.schema.dropTableIfExists('companies');
  } finally {
    await knex.raw('SET session_replication_role = DEFAULT');
  }
}
